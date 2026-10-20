# MyAdhikaar Backend

NestJS + PostgreSQL API for [myadhikaar.com](https://myadhikaar.com), replacing Base44. It keeps Base44's data
model and IDs, so the website moves over with a thin client swap rather than a rewrite.

- **Stack:** NestJS 12 (ESM), Prisma 7 with `@prisma/adapter-pg`, PostgreSQL 16, Vitest
- **Auth:** email login codes and Google sign-in; short-lived JWT access tokens plus rotating refresh tokens
- **Payments:** Cashfree, priced and fulfilled on the server only (webhook + return page + reconcile job)
- **AI:** Claude API for the legal assistant agent, `InvokeLLM` and the WhatsApp bot
- **Hosting:** Railway (Dockerfile build, migrations as a pre-deploy step)

## What's in the API

All routes are under `/api`. In development, Swagger is at `/api/docs`.

| Area | Routes | Notes |
| --- | --- | --- |
| Auth | `POST auth/otp/request`, `auth/otp/verify`, `auth/google`, `auth/refresh`, `auth/logout`, `GET/PUT auth/me` | Codes expire after 10 min, 5 attempts |
| Entities | `GET/POST entities/:Entity`, `GET/PUT/PATCH/DELETE entities/:Entity/:id`, `POST entities/:Entity/bulk` | Base44-style `q` filters and `sort`. Each entity has a deny-by-default access policy (`src/entities/policies.ts`) |
| Payments | `POST payments/quote`, `POST payments/orders`, `GET payments/orders/:id`, `POST payments/webhook/cashfree` | Wallet recharge, legal services, RoadGuard subscriptions |
| Functions | `POST functions/:name` | What the frontend's `base44.functions.invoke()` calls: sessions, legacy payment calls, email, video rooms, TTS, reviews, referral withdrawals |
| AI | `POST agents/conversations`, `GET agents/conversations/:id`, `POST agents/conversations/:id/messages`, `GET agents/conversations/:id/stream` (SSE) | Legal assistant with tools (find lawyers, book, create requests) |
| Integrations | `POST integrations/upload-file`, `integrations/invoke-llm`, `integrations/send-email` | Uploads go to an S3-compatible bucket |
| Webhooks | `POST webhooks/whatsapp` | Twilio-signed requests only |
| SEO | `GET seo/sitemap.xml`, `GET seo/robots.txt` | |
| Health | `GET health` | Checks the database |

Scheduled jobs:
- per-minute consultation billing;
- payment reconciliation every 10 minutes;
- daily admin report at 08:00 IST;
- monthly advocate summary at 07:30 IST on the 1st.

Each job takes a Postgres advisory lock, so it runs once even with several replicas.

## Local development

You need Node 22+, npm 11 and PostgreSQL 16.

```bash
npm install -g npm@11
npm install
cp .env.example .env          # set DATABASE_URL and JWT_SECRET at least
npx prisma migrate dev        # creates tables and generates the client
npm run start:dev
```

Without `RESEND_API_KEY`, emails are logged instead of sent, including login codes.

Tests run against a real database (`myadhikaar_test` by default, or `TEST_DATABASE_URL`):

```bash
DATABASE_URL=postgresql://…/myadhikaar_test npx prisma migrate deploy
npm run test:e2e
npm run lint
```

Changing the schema: edit `prisma/schema.prisma`, run `npx prisma migrate dev --name what_changed`, and commit the migration.

## Deploying on Railway

1. **Create a project with a PostgreSQL database.** Add a service from this GitHub repo. Railway reads `railway.json`, which:
   - builds the `Dockerfile`;
   - runs `prisma migrate deploy` before each deploy;
   - health-checks `/api/health`.
2. **Set the service variables**, all listed in `.env.example`:
   - `DATABASE_URL`: `${{Postgres.DATABASE_URL}}`
   - `JWT_SECRET`: `openssl rand -base64 48`
   - `APP_URL`: `https://myadhikaar.com`
   - `API_URL`: the API's public URL, e.g. `https://api.myadhikaar.com`. Twilio signatures and Cashfree webhooks use it.
   - `CORS_ORIGINS`: the website origins
   - `ADMIN_EMAILS`: `support@myadhikaar.com,vishavjeetraghav61@gmail.com,adv.vishavjeetraghav@gmail.com`
   - `GOOGLE_CLIENT_ID`, `RESEND_API_KEY`, `EMAIL_FROM`
   - `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`
   - `ANTHROPIC_API_KEY`
   - `DAILY_API_KEY`, `ELEVENLABS_API_KEY`
   - `TWILIO_*`
   - `S3_*`
3. **Add a custom domain** (e.g. `api.myadhikaar.com`) under the service's Networking settings.
4. **Point the external services at the API:**
   - Cashfree webhook: `https://api.myadhikaar.com/api/payments/webhook/cashfree`
   - Twilio WhatsApp "when a message comes in": `https://api.myadhikaar.com/api/webhooks/whatsapp`
   - Google OAuth client: add the website origin under "Authorised JavaScript origins".
   - Resend: verify the sending domain.

## Moving data from Base44

`src/scripts/migrate-from-base44.ts` copies every Base44 entity and user into Postgres.
- Records keep their IDs and created/updated dates. Emails are lowercased.
- Fields no longer in the schema are reported, not copied.
- Re-running it only adds new records. `--replace` reloads everything except users, and updates existing users in place.

To get `BASE44_TOKEN`:
1. Sign in to the live site as an admin.
2. In the browser console, run `localStorage.getItem('base44_access_token')`.

```bash
# Inside the Railway service shell (railway ssh), or locally against the production DATABASE_URL
BASE44_APP_ID=69a09c5fbe7cb8c0c94a2eb8 BASE44_TOKEN=… node dist/scripts/migrate-from-base44.js --dry-run
BASE44_APP_ID=69a09c5fbe7cb8c0c94a2eb8 BASE44_TOKEN=… node dist/scripts/migrate-from-base44.js
```

Existing users can sign in with an email code or Google, using the same email they used on Base44. They keep their data, wallet and role.

### Cutover runbook

1. Deploy the API on Railway with every variable set; check `/api/health`.
2. Run the import with `--dry-run`, then for real. Spot-check counts against the Base44 dashboard.
3. Test on a staging deploy of the website (pointed at the API):
   - sign-in;
   - a ₹1 wallet recharge in Cashfree sandbox;
   - a consultation;
   - the AI assistant.
4. Put the Base44 app in maintenance (or pause payments), then run the import again with `--replace` to catch the last changes.
5. Switch the website to the new API and repoint the Cashfree and Twilio webhooks.
6. Watch the logs and payment reconciliation for a day before turning Base44 off.

## Behaviour changes from Base44

These are deliberate fixes to issues in the old app:

- **Prices:** wallet, service and RoadGuard prices are decided by the server. Amounts in client requests are ignored.
- **Fulfilment:** a payment is fulfilled once, and only after Cashfree confirms the amount.
- **Coupons:** the hard-coded RoadGuard coupons (`RGLFREEE`, `RGLLAUNCH`, …) no longer work; promo codes come from the `PromoCode` table. `WALLET500` can be used once per account.
- **Invoices:** RoadGuard invoices include 18% GST inside the price paid instead of adding it on top.
- **Email:** callers can email only themselves or support, using templates. Admins can email anyone.
- **Video rooms:** only the consultation's lawyer gets owner rights in the room.
- **Data access:**
  - Lawyer bank details and other users' records are no longer readable from the browser.
  - Wallets and subscriptions can only change through payments.
