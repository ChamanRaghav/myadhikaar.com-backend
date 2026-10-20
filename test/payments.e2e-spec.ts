import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CashfreeClient } from '../src/payments/cashfree.client.js';
import { FakeCashfree, sign } from './fake-cashfree.js';
import { createTestApp, login, resetDb, type TestApp } from './helpers.js';

describe('payments', () => {
  let t: TestApp;
  const cf = new FakeCashfree();
  let user: { token: string };
  const auth = () => ({ Authorization: `Bearer ${user.token}` });
  const waitFor = async (check: () => boolean | Promise<boolean>) => {
    for (let i = 0; i < 50 && !(await check()); i++) await new Promise((r) => setTimeout(r, 20));
  };

  beforeAll(async () => {
    t = await createTestApp((b) => b.overrideProvider(CashfreeClient).useValue(cf));
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    cf.orders.clear();
    t.mail.outbox.length = 0;
    user = await login(t, 'payer@example.com');
  });

  const createOrder = (body: object) => t.http().post('/api/payments/orders').set(auth()).send(body);
  const balance = async (email = 'payer@example.com') => (await t.prisma.wallet.findFirst({ where: { user_email: email } }))?.balance ?? 0;

  describe('quotes', () => {
    it('adds the pack bonus on exact pack amounts only', async () => {
      const pack = await t.http().post('/api/payments/quote').send({ purpose: 'wallet_recharge', wallet: { amount: 2000 } }).expect(200);
      expect(pack.body).toEqual({ charge: 2000, credit: 2000, bonus: 250 });
      const other = await t.http().post('/api/payments/quote').send({ purpose: 'wallet_recharge', wallet: { amount: 1999 } }).expect(200);
      expect(other.body.bonus).toBe(0);
    });

    it('rejects bad amounts and unknown coupons', async () => {
      await t.http().post('/api/payments/quote').send({ purpose: 'wallet_recharge', wallet: { amount: 0 } }).expect(400);
      await t.http().post('/api/payments/quote').send({ purpose: 'wallet_recharge', wallet: { coupon: 'FREE100' } }).expect(400);
    });

    it('prices RoadGuard with the period discount and DB promos only', async () => {
      const rgl = { plan: 'suraksha', vehicle_type: 'truck', fleet_size: 2, billing_period: 'yearly' };
      const q = await t.http().post('/api/payments/quote').send({ purpose: 'rgl_subscription', rgl }).expect(200);
      // 1099/month × 2 vehicles × 12 months, less 20%
      expect(q.body).toMatchObject({ subtotal: 26376, period_discount: 5275, amount: 21101, months: 12 });

      // The hard-coded Base44 coupons are not honoured
      await t.http().post('/api/payments/quote').send({ purpose: 'rgl_subscription', rgl: { ...rgl, promo_code: 'RGLFREEE' } }).expect(400);

      await t.prisma.promoCode.create({ data: { code: 'HALF', type: 'discount_percent', value: 50, is_active: true, applicable_for: 'roadguard' } });
      await t.prisma.promoCode.create({ data: { code: 'ALL', type: 'discount_percent', value: 100, is_active: true, applicable_for: 'all' } });
      await t.prisma.promoCode.create({ data: { code: 'OLD', type: 'discount_percent', value: 50, is_active: true, valid_until: '2020-01-01' } });
      const half = await t.http().post('/api/payments/quote').send({ purpose: 'rgl_subscription', rgl: { ...rgl, promo_code: 'half' } }).expect(200);
      expect(half.body.amount).toBe(21101 - 10551);
      const full = await t.http().post('/api/payments/quote').send({ purpose: 'rgl_subscription', rgl: { ...rgl, promo_code: 'ALL' } }).expect(200);
      expect(full.body.amount).toBe(2);
      await t.http().post('/api/payments/quote').send({ purpose: 'rgl_subscription', rgl: { ...rgl, promo_code: 'OLD' } }).expect(400);
    });
  });

  describe('wallet recharge', () => {
    it('credits the server-priced amount once, however many times it is verified', async () => {
      const order = await createOrder({ purpose: 'wallet_recharge', wallet: { amount: 1000 } }).expect(201);
      expect(order.body).toMatchObject({ amount: 1000, payment_session_id: `session_${order.body.order_id}`, environment: 'sandbox' });
      expect(order.body.order_id).toMatch(/^WLT/);

      const pending = await t.http().get(`/api/payments/orders/${order.body.order_id}`).set(auth()).expect(200);
      expect(pending.body).toMatchObject({ status: 'created', paid: false });
      expect(await balance()).toBe(0);

      cf.pay(order.body.order_id);
      const results = await Promise.all(
        Array.from({ length: 10 }, () => t.http().get(`/api/payments/orders/${order.body.order_id}`).set(auth())),
      );
      for (const r of results) expect(r.status).toBe(200);
      // As in Base44, the pack bonus is tracked in bonus_balance, apart from the spendable balance
      const wallet = await t.prisma.wallet.findFirstOrThrow({ where: { user_email: 'payer@example.com' } });
      expect(wallet).toMatchObject({ balance: 1000, bonus_balance: 100 });
      expect(await t.prisma.wallet.count()).toBe(1);
      const ledger = await t.prisma.walletTransaction.findMany({ where: { user_email: 'payer@example.com' } });
      expect(ledger.map((l) => [l.type, l.amount]).sort()).toEqual([['bonus', 100], ['topup', 1000]]);

      const done = await t.http().get(`/api/payments/orders/${order.body.order_id}`).set(auth()).expect(200);
      expect(done.body).toMatchObject({ status: 'fulfilled', fulfilled: true, result: { credit: 1000, bonus: 100, new_balance: 1000 } });
      await waitFor(() => t.mail.outbox.some((m) => m.subject.includes('Recharge') || m.subject.toLowerCase().includes('wallet')));
      expect(t.mail.outbox.some((m) => m.to === 'payer@example.com')).toBe(true);
    });

    it('does not credit when Cashfree was paid a different amount', async () => {
      const order = await createOrder({ purpose: 'wallet_recharge', wallet: { amount: 5000 } }).expect(201);
      cf.pay(order.body.order_id, 1);
      const res = await t.http().get(`/api/payments/orders/${order.body.order_id}`).set(auth()).expect(200);
      expect(res.body.status).toBe('amount_mismatch');
      expect(await balance()).toBe(0);
      await waitFor(() => t.mail.outbox.some((m) => m.subject === 'Payment amount mismatch'));
      expect(t.mail.outbox.some((m) => m.subject === 'Payment amount mismatch')).toBe(true);
    });

    it('marks expired orders failed', async () => {
      const order = await createOrder({ purpose: 'wallet_recharge', wallet: { amount: 100 } }).expect(201);
      cf.expire(order.body.order_id);
      const res = await t.http().get(`/api/payments/orders/${order.body.order_id}`).set(auth()).expect(200);
      expect(res.body).toMatchObject({ status: 'failed', paid: false });
    });

    it('allows WALLET500 once per account', async () => {
      const first = await createOrder({ purpose: 'wallet_recharge', wallet: { coupon: 'wallet500' } }).expect(201);
      expect(first.body.amount).toBe(2);
      cf.pay(first.body.order_id);
      await t.http().get(`/api/payments/orders/${first.body.order_id}`).set(auth()).expect(200);
      expect(await balance()).toBe(500);
      await createOrder({ purpose: 'wallet_recharge', wallet: { coupon: 'WALLET500' } }).expect(400);
    });

    it("hides other users' orders", async () => {
      const order = await createOrder({ purpose: 'wallet_recharge', wallet: { amount: 100 } }).expect(201);
      const other = await login(t, 'other@example.com');
      await t.http().get(`/api/payments/orders/${order.body.order_id}`).set({ Authorization: `Bearer ${other.token}` }).expect(404);
      await t.http().post('/api/payments/orders').send({ purpose: 'wallet_recharge', wallet: { amount: 100 } }).expect(401);
    });
  });

  describe('webhook', () => {
    const post = (body: object, opts: { badSig?: boolean } = {}) => {
      const raw = JSON.stringify(body);
      const ts = String(Date.now());
      return t
        .http()
        .post('/api/payments/webhook/cashfree')
        .set('Content-Type', 'application/json')
        .set('x-webhook-timestamp', ts)
        .set('x-webhook-signature', opts.badSig ? 'nope' : sign(raw, ts))
        .send(raw);
    };

    it('fulfils from a signed webhook, using the status from Cashfree', async () => {
      const order = await createOrder({ purpose: 'wallet_recharge', wallet: { amount: 300 } }).expect(201);
      const payload = { data: { order: { order_id: order.body.order_id, order_amount: 300 }, payment: { payment_status: 'SUCCESS' } } };

      // A forged "SUCCESS" for an unpaid order changes nothing
      await post(payload).expect(200);
      expect(await balance()).toBe(0);

      cf.pay(order.body.order_id);
      await post(payload, { badSig: true }).expect(401);
      expect(await balance()).toBe(0);
      await post(payload).expect(200);
      await post(payload).expect(200);
      expect(await balance()).toBe(300);
    });
  });

  describe('services', () => {
    it('charges the catalog price, not what the client sends', async () => {
      const sr = await t
        .http()
        .post('/api/entities/ServiceRequest')
        .set(auth())
        .send({ service_title: 'GST Registration', package_name: 'Standard', amount: 1, payment_status: 'paid' })
        .expect(201);
      expect(sr.body.payment_status).not.toBe('paid');

      const order = await createOrder({ purpose: 'service', service: { service_request_id: sr.body.id } }).expect(201);
      expect(order.body.amount).toBe(2799);
      cf.pay(order.body.order_id);
      await t.http().get(`/api/payments/orders/${order.body.order_id}`).set(auth()).expect(200);

      const paid = await t.prisma.serviceRequest.findUniqueOrThrow({ where: { id: sr.body.id } });
      expect(paid).toMatchObject({ payment_status: 'paid', amount_paid: 2799, payment_order_id: order.body.order_id });
      await createOrder({ purpose: 'service', service: { service_request_id: sr.body.id } }).expect(400);
    });

    it("can't pay for someone else's request", async () => {
      const other = await login(t, 'other@example.com');
      const sr = await t
        .http()
        .post('/api/entities/ServiceRequest')
        .set({ Authorization: `Bearer ${other.token}` })
        .send({ service_title: 'GST Registration' })
        .expect(201);
      await createOrder({ purpose: 'service', service: { service_request_id: sr.body.id } }).expect(404);
    });
  });

  describe('RoadGuard subscription', () => {
    it('activates the fleet, invoice and referral after payment', async () => {
      const referrer = 'referrer@example.com';
      await t.prisma.rGLReferral.create({ data: { referral_code: 'REF1', user_email: referrer, is_active: true } });
      const order = await createOrder({
        purpose: 'rgl_subscription',
        rgl: {
          plan: 'kavach',
          vehicle_type: 'cab',
          fleet_size: 1,
          billing_period: 'quarterly',
          referral_code: 'ref1',
          name: 'Fleet Co',
          phone: '9876543210',
          vehicles: [{ vehicle_reg: 'DL01AB1234', driver_name: 'Ramesh' }],
        },
      }).expect(201);
      // 439 × 3 months, less 5%
      expect(order.body.amount).toBe(1251);
      cf.pay(order.body.order_id);
      const done = await t.http().get(`/api/payments/orders/${order.body.order_id}`).set(auth()).expect(200);
      expect(done.body.status).toBe('fulfilled');

      const [subscription, invoice, vehicle] = await Promise.all([
        t.prisma.rGLSubscription.findFirst({ where: { buyer_email: 'payer@example.com' } }),
        t.prisma.fleetInvoice.findFirst({ where: { owner_email: 'payer@example.com' } }),
        t.prisma.fleetVehicle.findFirst({ where: { vehicle_number: 'DL01AB1234' } }),
      ]);
      expect(subscription).toMatchObject({ status: 'active', referrer_email: referrer });
      expect(vehicle).toBeTruthy();
      // GST is included in the price paid
      expect(invoice?.total_amount).toBe(1251);
      expect((invoice?.amount ?? 0) + (invoice?.gst_amount ?? 0)).toBeCloseTo(1251, 1);
      expect(invoice?.gst_amount).toBeCloseTo(190.83, 1);

      const legacy = await t.http().post('/api/functions/generateFleetInvoice').set(auth()).send({}).expect(200);
      expect(legacy.body).toMatchObject({ success: true, invoice_id: invoice!.id });
    });
  });
});
