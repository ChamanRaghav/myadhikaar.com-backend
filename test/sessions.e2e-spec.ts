import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SessionsService } from '../src/sessions/sessions.service.js';
import { createTestApp, login, resetDb, type TestApp } from './helpers.js';

describe('consultation sessions (via /api/functions)', () => {
  let t: TestApp;
  let sessions: SessionsService;
  let client: { token: string };
  let lawyerId: string;
  const fn = (name: string, body: object, token = client.token) =>
    t.http().post(`/api/functions/${name}`).set({ Authorization: `Bearer ${token}` }).send(body);
  const wallet = (email: string) => t.prisma.wallet.findFirst({ where: { user_email: email } });
  const fund = (email: string, balance: number) =>
    t.prisma.wallet.create({ data: { user_email: email, balance, bonus_balance: 0, total_recharged: balance, total_spent: 0 } });
  /** Moves a session's clock back, as if it started `minutes` ago. */
  const age = async (id: string, minutes: number) => {
    const s = await t.prisma.session.findUniqueOrThrow({ where: { id } });
    const shift = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - minutes * 60_000).toISOString() : iso);
    await t.prisma.session.update({ where: { id }, data: { started_at: shift(s.started_at), last_tick_at: shift(s.last_tick_at) } });
  };

  beforeAll(async () => {
    t = await createTestApp();
    sessions = t.app.get(SessionsService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    client = await login(t, 'client@example.com');
    // ₹300 per 30 min → ₹10/min
    const lawyer = await t.prisma.lawyer.create({
      data: { full_name: 'Adv. Rao', email: 'rao@example.com', status: 'active', consultation_rate: 300, chat_rate: 150 },
    });
    lawyerId = lawyer.id;
  });

  it('needs five minutes of balance to start', async () => {
    await fn('startSession', { lawyer_id: lawyerId, session_type: 'call' }).expect(402);
    await fund('client@example.com', 50);
    const res = await fn('startSession', { lawyer_id: lawyerId, session_type: 'call' }).expect(200);
    expect(res.body.session).toMatchObject({ status: 'active', rate_per_min: 10 });
  });

  it('requires login', async () => {
    await t.http().post('/api/functions/startSession').send({ lawyer_id: lawyerId, session_type: 'call' }).expect(401);
  });

  it('reuses the active session on retries', async () => {
    await fund('client@example.com', 500);
    const [a, b] = await Promise.all([
      fn('startSession', { lawyer_id: lawyerId, session_type: 'call' }),
      fn('startSession', { lawyer_id: lawyerId, session_type: 'call' }),
    ]);
    expect(a.body.session.id).toBe(b.body.session.id);
    expect(await t.prisma.session.count({ where: { status: 'active' } })).toBe(1);
  });

  it('bills whole minutes each tick, pays the lawyer, and bills the rest on end', async () => {
    await fund('client@example.com', 500);
    const { body } = await fn('startSession', { lawyer_id: lawyerId, session_type: 'call' }).expect(200);
    const id = body.session.id;

    await age(id, 3);
    await sessions.billActiveSessions();
    expect((await wallet('client@example.com'))?.balance).toBe(470);
    expect((await wallet('rao@example.com'))?.balance).toBe(30);

    // A second tick straight away bills nothing more
    await sessions.billActiveSessions();
    expect((await wallet('client@example.com'))?.balance).toBe(470);

    // Half a minute later the call ends: the part-minute is billed
    await age(id, 0.5);
    const end = await fn('endSession', { session_id: id }).expect(200);
    expect(end.body.success).toBe(true);
    expect(end.body.total_charged).toBeCloseTo(35, 0);
    expect((await wallet('client@example.com'))?.balance).toBeCloseTo(465, 0);
    expect((await wallet('rao@example.com'))?.balance).toBeCloseTo(35, 0);

    // Ending twice changes nothing
    const again = await fn('endSession', { session_id: id }).expect(200);
    expect(again.body.alreadyEnded).toBe(true);
    expect((await wallet('client@example.com'))?.balance).toBeCloseTo(465, 0);
  });

  it('stops at what the wallet covers and expires the session', async () => {
    await fund('client@example.com', 55);
    const { body } = await fn('startSession', { lawyer_id: lawyerId, session_type: 'call' }).expect(200);
    await age(body.session.id, 10);
    await sessions.billActiveSessions();
    expect((await wallet('client@example.com'))?.balance).toBe(5);
    await age(body.session.id, 1);
    await sessions.billActiveSessions();
    const s = await t.prisma.session.findUniqueOrThrow({ where: { id: body.session.id } });
    expect(s.status).toBe('expired');
    expect((await wallet('client@example.com'))?.balance).toBe(5);
  });

  it('never double-charges when a tick and end race', async () => {
    await fund('client@example.com', 500);
    const { body } = await fn('startSession', { lawyer_id: lawyerId, session_type: 'call' }).expect(200);
    await age(body.session.id, 2);
    await Promise.all([sessions.billActiveSessions(), fn('endSession', { session_id: body.session.id }), sessions.billActiveSessions()]);
    const client = await wallet('client@example.com');
    const lawyer = await wallet('rao@example.com');
    expect(client!.balance! + lawyer!.balance!).toBeCloseTo(500, 5);
    expect(lawyer!.balance).toBeCloseTo(20, 0);
  });

  it("hides other users' sessions", async () => {
    await fund('client@example.com', 500);
    const { body } = await fn('startSession', { lawyer_id: lawyerId, session_type: 'call' }).expect(200);
    const other = await login(t, 'other@example.com');
    await fn('endSession', { session_id: body.session.id }, other.token).expect(404);
    const status = await fn('getSessionStatus', { session_id: body.session.id }, other.token).expect(200);
    expect(status.body.session).toBeNull();
  });

  it('pre-books 15 minutes for an appointment', async () => {
    await fund('client@example.com', 100);
    const when = new Date(Date.now() + 86_400_000).toISOString();
    await fn('bookAppointment', { lawyer_id: lawyerId, scheduled_date: when, mode: 'video' }).expect(402);
    await t.prisma.wallet.updateMany({ where: { user_email: 'client@example.com' }, data: { balance: 200 } });
    const res = await fn('bookAppointment', { lawyer_id: lawyerId, scheduled_date: when, mode: 'video' }).expect(200);
    expect((await wallet('client@example.com'))?.balance).toBe(50);
    const consultation = await t.prisma.consultation.findFirstOrThrow({ where: { client_email: 'client@example.com' } });
    expect(consultation).toMatchObject({ lawyer_id: lawyerId, consultation_type: 'video', amount_paid: 150 });
    expect(res.body).toBeTruthy();
  });
});
