import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AiService } from '../src/ai/ai.service.js';
import { CashfreeClient } from '../src/payments/cashfree.client.js';
import { TwilioClient } from '../src/notifications/twilio.client.js';
import { FakeCashfree } from './fake-cashfree.js';
import { createTestApp, login, resetDb, type TestApp } from './helpers.js';

const TWILIO_TOKEN = 'twilio-test-token';
const WEBHOOK_URL = 'https://api.myadhikaar.test/api/webhooks/whatsapp';

class FakeTwilio extends TwilioClient {
  sent: { to: string; body: string }[] = [];
  override get configured() {
    return true;
  }
  override async sendWhatsApp(to: string, body: string) {
    this.sent.push({ to, body });
  }
}

describe('functions, notifications and SEO', () => {
  let t: TestApp;
  const cf = new FakeCashfree();
  let twilio: FakeTwilio;
  let user: { token: string };
  const fn = (name: string, body: object, token: string | null = user.token) => {
    const req = t.http().post(`/api/functions/${name}`);
    return (token ? req.set({ Authorization: `Bearer ${token}` }) : req).send(body);
  };
  const recipients = () => t.mail.outbox.flatMap((m) => [m.to].flat());
  const settle = () => new Promise((r) => setTimeout(r, 150));

  beforeAll(async () => {
    process.env.TWILIO_AUTH_TOKEN = TWILIO_TOKEN;
    process.env.API_URL = 'https://api.myadhikaar.test';
    t = await createTestApp((b) =>
      b
        .overrideProvider(CashfreeClient)
        .useValue(cf)
        .overrideProvider(TwilioClient)
        .useClass(FakeTwilio)
        .overrideProvider(AiService)
        .useValue({ invoke: async () => ({ intent: 'talk_to_lawyer', reply: 'Namaste!' }) }),
    );
    twilio = t.app.get(TwilioClient) as FakeTwilio;
  });
  afterAll(async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.API_URL;
    await t.close();
  });
  beforeEach(async () => {
    await resetDb(t.prisma);
    cf.orders.clear();
    user = await login(t, 'user@example.com');
    await settle();
    t.mail.outbox.length = 0;
  });

  it('rejects unknown and removed functions', async () => {
    await fn('deleteEverything', {}).expect(404);
    await fn('payuInitiate', {}).expect(410);
    await fn('generateDummyAdvocates', {}).expect(410);
  });

  describe('sendEmail', () => {
    it('lets users email themselves and support, not anyone else', async () => {
      await fn('sendEmail', { template: 'user_refund', to: 'user@example.com', data: { userName: 'U', amount: 5 } }).expect(200);
      await fn('sendEmail', { template: 'admin_refund', to: 'support@myadhikaar.test', data: { userName: 'U' } }).expect(200);
      await fn('sendEmail', { template: 'user_refund', to: 'victim@example.com', data: {} }).expect(403);
      await fn('sendEmail', { template: 'user_refund', to: ['user@example.com', 'victim@example.com'], data: {} }).expect(403);
      expect(recipients()).not.toContain('victim@example.com');
    });

    it('allows public-form receipts without login', async () => {
      await fn('sendEmail', { template: 'career_application_received', to: 'applicant@example.com', data: { name: 'A' } }, null).expect(200);
      await fn('sendEmail', { template: 'user_refund', to: 'applicant@example.com', data: {} }, null).expect(403);
    });

    it('escapes data and only sends raw HTML to our inboxes', async () => {
      await fn('sendEmail', { template: 'user_refund', to: 'user@example.com', data: { userName: '<img src=x onerror=alert(1)>' } }).expect(200);
      expect(t.mail.outbox.at(-1)!.html).not.toContain('<img src=x');
      await fn('sendEmail', { template: 'raw_html', to: 'victim@example.com', subject: 'Hi', html: '<a href="phish">x</a>' }).expect(403);
      await fn('sendEmail', { template: 'raw_html', to: 'support@myadhikaar.test', subject: 'Hi', html: '<b>ok</b>' }).expect(200);
    });

    it('skips emails the server already sends', async () => {
      const res = await fn('sendEmail', { template: 'wallet_recharge', to: 'user@example.com', data: { amount: 99999 } }).expect(200);
      expect(res.body.skipped).toBeTruthy();
      expect(t.mail.outbox).toHaveLength(0);
    });
  });

  describe('legacy payment functions', () => {
    it('maps the old wallet checkout onto server-priced orders', async () => {
      const init = await fn('cashfreeInitiate', { orderId: 'WLT_client_made', amount: 2000, orderNote: 'Wallet', customerPhone: '9876543210' }).expect(200);
      expect(init.body).toMatchObject({ is_sandbox: true });
      const order = cf.orders.get(init.body.order_id)!;
      expect(order.order_amount).toBe(2000);

      const coupon = await fn('cashfreeInitiate', { orderId: 'WLT_x', amount: 999, orderNote: 'MyAdhikaar Wallet Recharge (Coupon: WALLET500)' }).expect(200);
      expect(cf.orders.get(coupon.body.order_id)!.order_amount).toBe(2);

      cf.pay(init.body.order_id);
      const cb = await fn('walletRechargeCallback', { order_id: init.body.order_id, amount: 99999 }).expect(200);
      expect(cb.body).toMatchObject({ success: true, new_balance: 2000, bonus_credited: 250 });
      const verify = await fn('verifyCashfreePayment', { orderId: init.body.order_id }).expect(200);
      expect(verify.body).toMatchObject({ success: true, status: 'PAID' });
    });

    it('asks old service checkouts to refresh', async () => {
      await fn('cashfreeInitiate', { orderId: 'SRV_unknown', amount: 1 }).expect(400);
    });
  });

  describe('reviews and referrals', () => {
    it('allows one review per completed consultation', async () => {
      const lawyer = await t.prisma.lawyer.create({ data: { full_name: 'Adv. K', status: 'active', rating: 4, total_reviews: 1 } });
      await fn('submitLawyerReview', { lawyer_id: lawyer.id, rating: 5 }).expect(403);
      await t.prisma.consultation.create({ data: { lawyer_id: lawyer.id, client_email: 'user@example.com', status: 'completed' } });
      const res = await fn('submitLawyerReview', { lawyer_id: lawyer.id, rating: 5, comment: 'Great' }).expect(200);
      expect(res.body).toMatchObject({ rating: 4.5, total_reviews: 2 });
      await fn('submitLawyerReview', { lawyer_id: lawyer.id, rating: 1 }).expect(400);
    });

    it('withdraws referral earnings without overdrawing', async () => {
      await t.prisma.rGLReferral.create({ data: { user_email: 'user@example.com', referral_code: 'U1', available_balance: 300, total_withdrawn: 0 } });
      await fn('requestReferralWithdrawal', { amount: 50 }).expect(400);
      const results = await Promise.all([1, 2, 3].map(() => fn('requestReferralWithdrawal', { amount: 200, upi_id: 'u@upi' })));
      expect(results.filter((r) => r.status === 200 || r.status === 201)).toHaveLength(1);
      const referral = await t.prisma.rGLReferral.findFirstOrThrow({ where: { user_email: 'user@example.com' } });
      expect(referral).toMatchObject({ available_balance: 100, total_withdrawn: 200 });
    });
  });

  describe('notifications', () => {
    it('emails the user and admins about a new service request', async () => {
      await t.http().post('/api/entities/ServiceRequest').set({ Authorization: `Bearer ${user.token}` }).send({ service_title: 'Trademark' }).expect(201);
      await settle();
      expect(recipients()).toEqual(expect.arrayContaining(['user@example.com', 'admin-inbox@myadhikaar.test', 'support@myadhikaar.test']));
    });

    it('sends a WhatsApp confirmation for a booking when the user has a phone', async () => {
      twilio.sent.length = 0;
      await t.prisma.user.update({ where: { email: 'user@example.com' }, data: { phone: '98765 43210' } });
      const lawyer = await t.prisma.lawyer.create({ data: { full_name: 'Adv. K', status: 'active' } });
      await t.http().post('/api/entities/Consultation').set({ Authorization: `Bearer ${user.token}` }).send({ lawyer_id: lawyer.id, consultation_type: 'audio' }).expect(201);
      await settle();
      expect(twilio.sent).toHaveLength(1);
      expect(twilio.sent[0].to).toBe('98765 43210');
      expect(twilio.sent[0].body).toContain('Consultation Confirmed');
    });

    it('welcomes new users on their first login only', async () => {
      await login(t, 'newbie@example.com');
      await login(t, 'newbie@example.com');
      await settle();
      expect(t.mail.outbox.filter((m) => m.to === 'newbie@example.com' && m.subject.includes('Welcome'))).toHaveLength(1);
    });

    it('reports yesterday to admins', async () => {
      const service = t.app.get((await import('../src/notifications/notifications.service.js')).NotificationsService);
      const now = new Date('2026-10-20T03:00:00Z'); // 08:30 IST
      await t.prisma.session.create({ data: { status: 'ended', ended_at: '2026-10-19T10:00:00.000Z', total_charged: 120 } });
      await t.prisma.session.create({ data: { status: 'ended', ended_at: '2026-10-18T10:00:00.000Z', total_charged: 999 } });
      const report = await service.sendDailyReport(now);
      expect(report).toMatchObject({ totalCalls: 1, totalRevenue: '120', date: '19 October 2026' });
    });
  });

  describe('WhatsApp bot', () => {
    const signed = (params: Record<string, string>) =>
      createHmac('sha1', TWILIO_TOKEN)
        .update(WEBHOOK_URL + Object.keys(params).sort().map((k) => k + params[k]).join(''))
        .digest('base64');

    it('rejects unsigned requests and replies to signed ones', async () => {
      twilio.sent.length = 0;
      const params = { From: 'whatsapp:+919876543210', Body: 'I need a vakeel' };
      await t.http().post('/api/webhooks/whatsapp').type('form').send(params).expect(403);
      await t.http().post('/api/webhooks/whatsapp').type('form').set('X-Twilio-Signature', 'bad').send(params).expect(403);
      const ok = await t.http().post('/api/webhooks/whatsapp').type('form').set('X-Twilio-Signature', signed(params)).send(params).expect(200);
      expect(ok.text).toContain('<Response>');
      expect(twilio.sent).toHaveLength(1);
      expect(twilio.sent[0].body).toContain('https://myadhikaar.test/TalkToLawyer');
    });
  });

  describe('SEO', () => {
    it('serves robots.txt and a sitemap with published blogs', async () => {
      await t.prisma.blog.create({ data: { title: 'Bail', slug: 'bail-guide', is_published: true } });
      await t.prisma.blog.create({ data: { title: 'Draft', slug: 'draft', is_published: false } });
      const robots = await t.http().get('/api/seo/robots.txt').expect(200);
      expect(robots.text).toContain('Sitemap: https://myadhikaar.test/sitemap.xml');
      const sitemap = await t.http().get('/api/seo/sitemap.xml').expect(200);
      expect(sitemap.headers['content-type']).toContain('application/xml');
      expect(sitemap.text).toContain('https://myadhikaar.test/Blog/bail-guide');
      expect(sitemap.text).not.toContain('/Blog/draft');
      expect(sitemap.text.match(/<url>/g)!.length).toBeGreaterThan(1000);
    });
  });
});
