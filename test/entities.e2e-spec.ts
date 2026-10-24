import { EntityEvents } from '../src/entities/entity-events.js';
import { createTestApp, login, resetDb, TestApp } from './helpers.js';

describe('entities API', () => {
  let t: TestApp;
  let admin: string;
  let alice: string; // client
  let bob: string; // another client
  let rao: string; // lawyer
  let lawyerId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (path: string, token?: string) => (token ? t.http().get(path).set(auth(token)) : t.http().get(path));
  const q = (filter: object) => `q=${encodeURIComponent(JSON.stringify(filter))}`;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    admin = (await login(t, 'boss@x.com', 'admin')).token;
    alice = (await login(t, 'alice@x.com')).token;
    bob = (await login(t, 'bob@x.com')).token;
    rao = (await login(t, 'rao@x.com')).token;
    const lawyer = await t.prisma.lawyer.create({
      data: {
        full_name: 'Adv. Rao', email: 'rao@x.com', status: 'active', consultation_rate: 600, discounted_rate: 450,
        rating: 4.5, specializations: ['Criminal Law', 'Bail'], city: 'Delhi', account_number: '1234567890', upi_id: 'rao@upi',
      },
    });
    lawyerId = lawyer.id;
    await t.prisma.lawyer.create({ data: { full_name: 'Adv. Iyer', email: 'iyer@x.com', status: 'active', city: 'Chennai', specializations: ['Bail'], is_online: true } });
    await t.prisma.lawyer.create({ data: { full_name: 'Adv. Das', email: 'das@x.com', status: 'active', city: 'Kolkata', specializations: ['Tax'] } });
  });

  describe('public lawyer directory', () => {
    it('lists lawyers to guests without bank details', async () => {
      const res = await get(`/api/entities/Lawyer?${q({ status: 'active' })}&sort=-rating`).expect(200);
      expect(res.body).toHaveLength(3);
      expect(res.body[0].full_name).toBe('Adv. Rao');
      expect(res.body[0].account_number).toBeUndefined();
      expect(res.body[0].upi_id).toBeUndefined();
    });

    it('shows bank details to the lawyer themselves and to admins', async () => {
      expect((await get(`/api/entities/Lawyer/${lawyerId}`, rao).expect(200)).body.account_number).toBe('1234567890');
      expect((await get(`/api/entities/Lawyer/${lawyerId}`, admin).expect(200)).body.upi_id).toBe('rao@upi');
      expect((await get(`/api/entities/Lawyer/${lawyerId}`, alice).expect(200)).body.upi_id).toBeUndefined();
    });

    it("runs the lawyer profile page's MongoDB-style related-lawyers query", async () => {
      const filter = {
        status: 'active',
        $and: [{ id: { $ne: lawyerId } }, { $or: [{ city: 'Delhi' }, { specializations: { $in: ['Bail'] } }] }],
      };
      const res = await get(`/api/entities/Lawyer?${q(filter)}&sort=-is_online&limit=4`).expect(200);
      expect(res.body.map((l: any) => l.full_name)).toEqual(['Adv. Iyer']);
    });

    it('matches a single value against an array field, like MongoDB', async () => {
      const res = await get(`/api/entities/Lawyer?${q({ specializations: 'Bail' })}&sort=full_name`).expect(200);
      expect(res.body.map((l: any) => l.full_name)).toEqual(['Adv. Iyer', 'Adv. Rao']);
    });

    it('sorts unset values last when sorting descending', async () => {
      const res = await get(`/api/entities/Lawyer?sort=-is_online`).expect(200);
      expect(res.body[0].full_name).toBe('Adv. Iyer');
    });

    it('rejects unknown fields and bad JSON', async () => {
      await get(`/api/entities/Lawyer?${q({ password: 'x' })}`).expect(400);
      await get(`/api/entities/Lawyer?q=not-json`).expect(400);
      await get(`/api/entities/Lawyer?sort=nope`).expect(400);
      await get(`/api/entities/NoSuchThing`).expect(404);
    });
  });

  describe('lawyer self-service', () => {
    it('lets a lawyer change availability and bank details but not ratings or status', async () => {
      await t.http().put(`/api/entities/Lawyer/${lawyerId}`).set(auth(rao)).send({ is_online: true, upi_id: 'new@upi' }).expect(200);
      await t.http().put(`/api/entities/Lawyer/${lawyerId}`).set(auth(rao)).send({ rating: 5 }).expect(403);
      await t.http().put(`/api/entities/Lawyer/${lawyerId}`).set(auth(rao)).send({ status: 'active', is_verified: true }).expect(403);
      // Resending unchanged protected values (whole-form saves) is fine
      await t.http().put(`/api/entities/Lawyer/${lawyerId}`).set(auth(rao)).send({ rating: 4.5, is_online: false }).expect(200);
    });

    it("doesn't let anyone else edit a lawyer, including their bank details", async () => {
      await t.http().put(`/api/entities/Lawyer/${lawyerId}`).set(auth(alice)).send({ upi_id: 'thief@upi' }).expect(404);
      await t.http().put(`/api/entities/Lawyer/${lawyerId}`).send({ upi_id: 'thief@upi' }).expect(401);
      expect((await t.prisma.lawyer.findUnique({ where: { id: lawyerId } }))!.upi_id).toBe('rao@upi');
    });
  });

  describe('wallets', () => {
    it("are readable by their owner only and can't be written by users", async () => {
      const w = await t.prisma.wallet.create({ data: { user_email: 'alice@x.com', balance: 100 } });
      await t.prisma.wallet.create({ data: { user_email: 'bob@x.com', balance: 999 } });
      const mine = await get('/api/entities/Wallet', alice).expect(200);
      expect(mine.body).toHaveLength(1);
      expect(mine.body[0].balance).toBe(100);
      await t.http().put(`/api/entities/Wallet/${w.id}`).set(auth(alice)).send({ balance: 1_000_000 }).expect(403);
      await t.http().post('/api/entities/Wallet').set(auth(alice)).send({ user_email: 'alice@x.com', balance: 5000 }).expect(403);
      await t.http().post('/api/entities/WalletTransaction').set(auth(alice)).send({ user_email: 'alice@x.com', amount: 1 }).expect(403);
      expect((await get('/api/entities/Wallet', admin).expect(200)).body).toHaveLength(2);
      await t.http().put(`/api/entities/Wallet/${w.id}`).set(auth(admin)).send({ balance: 150 }).expect(200);
    });
  });

  describe('consultations', () => {
    it('takes the price from the lawyer profile and forces the client and status', async () => {
      const res = await t.http().post('/api/entities/Consultation').set(auth(alice)).send({
        lawyer_id: lawyerId, client_email: 'someone@else.com', status: 'completed', amount_paid: 999999, consultation_type: 'audio',
      }).expect(201);
      expect(res.body).toMatchObject({ client_email: 'alice@x.com', status: 'scheduled', amount_paid: 450, lawyer_name: 'Adv. Rao' });
      expect(res.body.created_by).toBe('alice@x.com');
    });

    it('is visible and editable by the client and the lawyer only', async () => {
      const { body: c } = await t.http().post('/api/entities/Consultation').set(auth(alice)).send({ lawyer_id: lawyerId }).expect(201);
      expect((await get('/api/entities/Consultation', rao).expect(200)).body).toHaveLength(1);
      expect((await get('/api/entities/Consultation', bob).expect(200)).body).toHaveLength(0);
      await get(`/api/entities/Consultation/${c.id}`, bob).expect(404);
      await t.http().put(`/api/entities/Consultation/${c.id}`).set(auth(rao)).send({ status: 'in_progress' }).expect(200);
      await t.http().put(`/api/entities/Consultation/${c.id}`).set(auth(alice)).send({ amount_paid: 1 }).expect(403);
      await t.http().put(`/api/entities/Consultation/${c.id}`).set(auth(alice)).send({ lawyer_id: 'other' }).expect(403);
      await t.http().put(`/api/entities/Consultation/${c.id}`).set(auth(bob)).send({ status: 'cancelled' }).expect(404);
    });

    it('fires on-create listeners (Base44 automations)', async () => {
      const seen: string[] = [];
      t.app.get(EntityEvents).onCreate('Consultation', (r) => void seen.push(r.id));
      const { body } = await t.http().post('/api/entities/Consultation').set(auth(alice)).send({ lawyer_id: lawyerId }).expect(201);
      await new Promise((r) => setTimeout(r, 20));
      expect(seen).toContain(body.id);
    });
  });

  describe('service requests', () => {
    it("can't be marked paid by the client", async () => {
      const { body: sr } = await t.http().post('/api/entities/ServiceRequest').set(auth(alice)).send({
        service_title: 'GST Registration', package_name: 'Basic', package_price: '₹999', amount_paid: 999, payment_status: 'paid', status: 'completed',
      }).expect(201);
      expect(sr).toMatchObject({ payment_status: 'pending', amount_paid: 0, status: 'pending', client_email: 'alice@x.com' });
      await t.http().put(`/api/entities/ServiceRequest/${sr.id}`).set(auth(alice)).send({ payment_status: 'paid' }).expect(403);
      await t.http().put(`/api/entities/ServiceRequest/${sr.id}`).set(auth(alice)).send({ status: 'completed' }).expect(403);
      await t.http().put(`/api/entities/ServiceRequest/${sr.id}`).set(auth(alice)).send({ status: 'in_review', documents: ['https://f/1.pdf'], doc_upload_status: 'uploaded' }).expect(200);
    });
  });

  describe('referrals', () => {
    it("start at zero and the owner can't top up their own balance", async () => {
      const { body: ref } = await t.http().post('/api/entities/RGLReferral').set(auth(alice)).send({
        referral_code: 'ALICE10', available_balance: 50000, total_earned: 50000,
      }).expect(201);
      expect(ref).toMatchObject({ user_email: 'alice@x.com', available_balance: 0, total_earned: 0 });
      await t.http().put(`/api/entities/RGLReferral/${ref.id}`).set(auth(alice)).send({ available_balance: 50000 }).expect(403);
      await t.http().post('/api/entities/RGLReferral').set(auth(bob)).send({ referral_code: 'ALICE10' }).expect(403);
    });

    it('can be looked up by code at checkout without exposing balances', async () => {
      await t.prisma.rGLReferral.create({ data: { user_email: 'alice@x.com', referral_code: 'ALICE10', available_balance: 700, is_active: true } });
      const res = await get(`/api/entities/RGLReferral?${q({ referral_code: 'ALICE10', is_active: true })}`, bob).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].available_balance).toBeUndefined();
      expect((await get('/api/entities/RGLReferral', bob).expect(200)).body).toHaveLength(0);
      expect((await get('/api/entities/RGLReferral', alice).expect(200)).body[0].available_balance).toBe(700);
    });

    it("can't create withdrawals or subscriptions directly", async () => {
      await t.http().post('/api/entities/RGLWithdrawal').set(auth(alice)).send({ amount: 500 }).expect(403);
      await t.http().post('/api/entities/RGLSubscription').set(auth(alice)).send({ status: 'active', plan_name: 'Rakshak' }).expect(403);
    });
  });

  describe('promo codes', () => {
    it('can only be checked one code at a time', async () => {
      await t.prisma.promoCode.create({ data: { code: 'LAUNCH50', is_active: true } });
      await t.prisma.promoCode.create({ data: { code: 'SECRET100', is_active: true } });
      await get('/api/entities/PromoCode').expect(403);
      const res = await get(`/api/entities/PromoCode?${q({ code: 'LAUNCH50' })}`).expect(200);
      expect(res.body.map((p: any) => p.code)).toEqual(['LAUNCH50']);
      expect((await get('/api/entities/PromoCode', admin).expect(200)).body).toHaveLength(2);
      await t.http().post('/api/entities/PromoCode').set(auth(alice)).send({ code: 'FREE' }).expect(403);
    });
  });

  describe('blog', () => {
    it('shows only published posts and only lets readers bump the view counter by one', async () => {
      const post = await t.prisma.blog.create({ data: { title: 'Bail 101', slug: 'bail-101', is_published: true, view_count: 10 } });
      await t.prisma.blog.create({ data: { title: 'Draft', slug: 'draft', is_published: false } });
      expect((await get('/api/entities/Blog').expect(200)).body).toHaveLength(1);
      await t.http().put(`/api/entities/Blog/${post.id}`).send({ view_count: 99999 }).expect(200);
      expect((await t.prisma.blog.findUnique({ where: { id: post.id } }))!.view_count).toBe(11);
      // PATCH is the same partial update
      await t.http().patch(`/api/entities/Blog/${post.id}`).send({ view_count: 99999 }).expect(200);
      expect((await t.prisma.blog.findUnique({ where: { id: post.id } }))!.view_count).toBe(12);
      await t.http().put(`/api/entities/Blog/${post.id}`).send({ title: 'Hacked' }).expect(403);
    });
  });

  describe('payout requests', () => {
    it('are limited to advocates and their available balance', async () => {
      await t.prisma.wallet.create({ data: { user_email: 'rao@x.com', balance: 1000 } });
      const body = { lawyer_id: lawyerId, amount: 600, method: 'upi', upi_id: 'rao@upi' };
      await t.http().post('/api/entities/WithdrawalRequest').set(auth(rao)).send(body).expect(201);
      // 600 is already pending, so only 400 more is available
      await t.http().post('/api/entities/WithdrawalRequest').set(auth(rao)).send({ ...body, amount: 500 }).expect(403);
      await t.http().post('/api/entities/WithdrawalRequest').set(auth(alice)).send(body).expect(403);
    });
  });

  describe('cases, messages and chat', () => {
    it('limits case data to the client and assigned lawyer, and ignores unknown fields', async () => {
      const { body: c } = await t.http().post('/api/entities/Case').set(auth(alice)).send({
        title: 'Bail matter', assigned_lawyer_id: lawyerId, amount_paid: 5,
      }).expect(201);
      expect(c.assigned_lawyer_id).toBeUndefined();
      await t.prisma.case.update({ where: { id: c.id }, data: { assigned_lawyer_id: lawyerId } });

      // LawyerReview sends fields Message doesn't have; they're dropped, not an error
      const { body: m } = await t.http().post('/api/entities/Message').set(auth(alice)).send({
        case_id: c.id, content: 'Hello', type: 'review', tags: ['x'], sender_email: 'spoof@x.com',
      }).expect(201);
      expect(m).toMatchObject({ sender_email: 'alice@x.com', content: 'Hello' });
      expect(m.type).toBeUndefined();

      expect((await get(`/api/entities/Message?${q({ case_id: c.id })}`, rao).expect(200)).body).toHaveLength(1);
      expect((await get(`/api/entities/Message?${q({ case_id: c.id })}`, bob).expect(200)).body).toHaveLength(0);
      await t.http().post('/api/entities/Message').set(auth(bob)).send({ case_id: c.id, content: 'spam' }).expect(403);
      await t.http().post('/api/entities/CaseDocument').set(auth(bob)).send({ case_id: c.id, name: 'x' }).expect(403);
    });

    it('only allows chat messages in your own conversations', async () => {
      await t.http().post('/api/entities/ChatMessage').set(auth(alice)).send({ user_email: 'alice@x.com', lawyer_id: lawyerId, content: 'hi' }).expect(201);
      await t.http().post('/api/entities/ChatMessage').set(auth(rao)).send({ user_email: 'alice@x.com', lawyer_id: lawyerId, content: 'hello' }).expect(201);
      await t.http().post('/api/entities/ChatMessage').set(auth(bob)).send({ user_email: 'alice@x.com', lawyer_id: lawyerId, content: 'x' }).expect(403);
      expect((await get('/api/entities/ChatMessage', rao).expect(200)).body).toHaveLength(2);
      expect((await get('/api/entities/ChatMessage', bob).expect(200)).body).toHaveLength(0);
    });
  });

  describe('users and admin-only tables', () => {
    it('lets users see only themselves and admins see everyone', async () => {
      const mine = await get('/api/entities/User', alice).expect(200);
      expect(mine.body.map((u: any) => u.email)).toEqual(['alice@x.com']);
      expect((await get('/api/entities/User', admin).expect(200)).body).toHaveLength(4);
      await t.http().put(`/api/entities/User/${mine.body[0].id}`).set(auth(alice)).send({ role: 'admin' }).expect(403);
    });

    it('keeps the unused legal-practice tables admin-only', async () => {
      await t.prisma.lGClient.create({ data: { email: 'c@x.com' } });
      expect((await get('/api/entities/LGClient', alice).expect(200)).body).toHaveLength(0);
      expect((await get('/api/entities/LGClient', admin).expect(200)).body).toHaveLength(1);
    });

    it('lets guests apply for jobs but not read applications', async () => {
      await t.http().post('/api/entities/JobApplication').send({ applicant_email: 'Job@Seeker.com', status: 'hired', admin_notes: 'x' }).expect(201);
      const apps = await get('/api/entities/JobApplication', admin).expect(200);
      expect(apps.body[0]).toMatchObject({ applicant_email: 'job@seeker.com', status: 'applied' });
      expect(apps.body[0].admin_notes).toBeUndefined();
      expect((await get('/api/entities/JobApplication').expect(200)).body).toHaveLength(0);
    });
  });
});
