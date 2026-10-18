import { createTestApp, login, resetDb, TestApp } from './helpers.js';

describe('auth', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mail.outbox.length = 0;
  });
  afterAll(() => t.close());

  const codeFor = (email: string) =>
    /letter-spacing:6px;margin:16px 0">(\d{6})</.exec(t.mail.outbox.filter((m) => m.to === email).at(-1)!.html)![1];

  it('emails a code and logs in, creating the account', async () => {
    await t.http().post('/api/auth/otp/request').send({ email: 'Priya@Example.com' }).expect(200);
    const code = codeFor('priya@example.com');
    const res = await t.http().post('/api/auth/otp/verify').send({ email: 'priya@example.com', code, full_name: 'Priya' }).expect(200);
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.refresh_token).toBeTruthy();
    expect(res.body.user).toMatchObject({ email: 'priya@example.com', full_name: 'Priya', role: 'user' });
    const me = await t.http().get('/api/auth/me').set('Authorization', `Bearer ${res.body.access_token}`).expect(200);
    expect(me.body.email).toBe('priya@example.com');
  });

  it('rejects wrong codes and locks the code after 5 attempts', async () => {
    await t.http().post('/api/auth/otp/request').send({ email: 'a@x.com' }).expect(200);
    const code = codeFor('a@x.com');
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await t.http().post('/api/auth/otp/verify').send({ email: 'a@x.com', code: wrong }).expect(401);
    await t.http().post('/api/auth/otp/verify').send({ email: 'a@x.com', code }).expect(401);
  });

  it('rejects expired and reused codes', async () => {
    await t.http().post('/api/auth/otp/request').send({ email: 'b@x.com' }).expect(200);
    const code = codeFor('b@x.com');
    await t.http().post('/api/auth/otp/verify').send({ email: 'b@x.com', code }).expect(200);
    await t.http().post('/api/auth/otp/verify').send({ email: 'b@x.com', code }).expect(401);

    await t.http().post('/api/auth/otp/request').send({ email: 'c@x.com' }).expect(200);
    await t.prisma.otpCode.updateMany({ where: { email: 'c@x.com' }, data: { expires_at: new Date(Date.now() - 1000) } });
    await t.http().post('/api/auth/otp/verify').send({ email: 'c@x.com', code: codeFor('c@x.com') }).expect(401);
  });

  it('limits codes per email', async () => {
    for (let i = 0; i < 5; i++) await t.http().post('/api/auth/otp/request').send({ email: 'd@x.com' }).expect(200);
    await t.http().post('/api/auth/otp/request').send({ email: 'd@x.com' }).expect(429);
  });

  it('requires a token, and rejects a bad one even on public routes', async () => {
    await t.http().get('/api/auth/me').expect(401);
    await t.http().get('/api/auth/me').set('Authorization', 'Bearer nonsense').expect(401);
    await t.http().get('/api/health').set('Authorization', 'Bearer nonsense').expect(401);
    await t.http().get('/api/health').expect(200);
  });

  it("lets users edit their profile but not their role or email", async () => {
    const { token } = await login(t, 'e@x.com');
    const res = await t
      .http()
      .put('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ full_name: 'Eve', phone: '9999999999', city: 'Delhi', role: 'admin', email: 'other@x.com' })
      .expect(200);
    expect(res.body).toMatchObject({ full_name: 'Eve', phone: '9999999999', city: 'Delhi', role: 'user', email: 'e@x.com' });
  });

  it('rotates refresh tokens and revokes the family when an old one is replayed', async () => {
    const { refresh: r1 } = await login(t, 'f@x.com');
    const second = await t.http().post('/api/auth/refresh').send({ refresh_token: r1 }).expect(200);
    const r2 = second.body.refresh_token;
    // Another tab using r1 within the grace period: rejected, but r2 keeps working
    await t.http().post('/api/auth/refresh').send({ refresh_token: r1 }).expect(401);
    const third = await t.http().post('/api/auth/refresh').send({ refresh_token: r2 }).expect(200);
    const r3 = third.body.refresh_token;
    // Replaying r1 long after it was rotated looks like theft: the whole family is revoked
    await t.prisma.refreshToken.updateMany({ where: { revoked_at: { not: null } }, data: { revoked_at: new Date(Date.now() - 60_000) } });
    await t.http().post('/api/auth/refresh').send({ refresh_token: r1 }).expect(401);
    await t.http().post('/api/auth/refresh').send({ refresh_token: r3 }).expect(401);
  });

  it('logout revokes the refresh token', async () => {
    const { refresh } = await login(t, 'g@x.com');
    await t.http().post('/api/auth/logout').send({ refresh_token: refresh }).expect(200);
    await t.http().post('/api/auth/refresh').send({ refresh_token: refresh }).expect(401);
  });

  it('blocks disabled accounts immediately', async () => {
    const { token } = await login(t, 'h@x.com');
    await t.prisma.user.update({ where: { email: 'h@x.com' }, data: { disabled: true } });
    await t.http().get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('signs in with Google and links an existing email account', async () => {
    await login(t, 'i@x.com');
    const profile = { sub: 'g-123', email: 'I@x.com', name: 'Ira', picture: 'https://img/ira.png' };
    const res = await t.http().post('/api/auth/google').send({ credential: 'google:' + JSON.stringify(profile) }).expect(200);
    expect(res.body.user).toMatchObject({ email: 'i@x.com', full_name: 'Ira' });
    expect(await t.prisma.user.count()).toBe(1);
    await t.http().post('/api/auth/google').send({ credential: 'bad-token-xxxxxxxxxxxxxxxxxxxx' }).expect(401);
  });
});
