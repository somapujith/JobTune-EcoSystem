# Cutover runbook: make the Cloudflare Worker the production API

Last updated 2026-09-20. Read [security-review-2026-09-19.md](security-review-2026-09-19.md) first; this file is the executable checklist.

## Where things stand (facts, checked live)

| Item | State |
|---|---|
| Production frontend | `https://job-tune-eco-system.vercel.app`, deployed by Vercel from `main` (both migration pushes deployed successfully) |
| Production API (Render) | **Down.** `https://jobtune-backend-14k0.onrender.com` answers `404` with `x-render-routing: no-server` (no service bound to that hostname). The last recorded API request in the database is 2026-09-19 08:07 UTC. `frontend/vercel.json` still rewrites `/api/*` to it, so **the production API is currently unreachable**. There is no Render to fall back to |
| Worker | Deployed and serving the full app at `https://jobtune-ecosystem.somapujith.workers.dev`. **No secrets set**, so every route fails closed with a masked 500 (verified). Config (`[vars]`, rate limits) is in `backend/wrangler.toml` |
| Neon (production data) | Reachable, PostgreSQL 18.6, 10 users, 5 orders (4 paid), 3 plans, 10 active sessions. All 10 password hashes are `$2b$10$` (compatible with the Worker's bcryptjs, proven both ways against native bcrypt). Driver checks against hosted Neon passed (cold connect 233 ms, warm 49 ms, multi-statement, 20 parallel per-request pools) |
| Neon **schema** | **Incomplete**: 47 of 52 needed tables, 7 columns missing, including `users.onboarding_completed`, `users.name`, `users.full_name` and `career_discovery_responses`. Render's boot migrations used to create them; nothing does now. A dry run on Neon (rolled back) succeeded |
| Not verified / needs you | see "What is NOT proven" at the end |

## Step 1. Apply the missing schema to Neon (additive, one transaction)

```powershell
cd backend
$env:DATABASE_URL = '<the Neon pooled connection string>'      # this shell only
npm run migration:apply-neon-schema                            # DRY RUN: executes everything, then rolls back
npm run migration:apply-neon-schema -- --apply                 # commit
npm run migration:check-schema:live                            # expect: only the 3 owner-decision tables + learning_streaks columns left
Remove-Item Env:DATABASE_URL
```

It only adds (`IF NOT EXISTS`), aborts if any row count changes, and never prints the URL. Neon keeps point-in-time history if
you want a restore point first (Neon console → Branches → Create branch from now).

Left alone on purpose (owner decisions, see `proposed-schema-fixes.sql`): the two incompatible `learning_streaks` shapes (the
course-streak display shows zeros; nothing breaks), empty `profiles` / `interview_sessions` / `projects` tables (career-score
output), unique indexes that fail on duplicate rows.

## Step 2. Set the Worker's secrets

```powershell
cd backend
$env:NEON_DATABASE_URL = '<the Neon pooled connection string>'
$env:GEMINI_API_KEY = '<key>'; $env:ADZUNA_APP_ID = '<id>'; $env:ADZUNA_APP_KEY = '<key>'
powershell -File scripts/migration/set-worker-secrets.ps1 -DryRun     # preview (names and lengths only)
powershell -File scripts/migration/set-worker-secrets.ps1             # set them
```

`JWT_SECRET` is generated fresh (the old one is in git history). Signed-in users are unaffected beyond a token refresh.
Rate limiting is already provisioned in `wrangler.toml` (login/signup **per account**, 5 per 60 s; 300 per 60 s per IP as a flood
backstop), which is why it is safe to set secrets now.

## Step 3. Prove the Worker directly (before touching the frontend)

```powershell
cd backend
npm run migration:e2e -- --base https://jobtune-ecosystem.somapujith.workers.dev --allow-writes
```

18 checks: health with `db: connected`, plans, auth gate, error masking, signup, `/me`, plan gate (`PLAN_UPGRADE_REQUIRED`),
onboarding flag, single-active-device replacement, refresh, logout, wrong password. It creates one test account and prints the SQL
to delete it. Every check must pass. (The same script passes 18/18 against the local reference stack.)

## Step 4. Point the production frontend at the Worker

Edit `frontend/vercel.json`: replace the first rewrite's destination:

```json
{ "source": "/api/(.*)", "destination": "https://jobtune-ecosystem.somapujith.workers.dev/api/$1" }
```

Commit and push to `main`; Vercel redeploys the frontend. Then run the same script **through the production domain**:

```powershell
npm run migration:e2e -- --base https://job-tune-eco-system.vercel.app --frontend https://job-tune-eco-system.vercel.app --allow-writes
```

## Rollback

Render is gone, so there is no previous backend to return to. The controls that exist: `wrangler rollback` (previous Worker version),
removing `JWT_SECRET` (`wrangler secret delete JWT_SECRET`, every route fails closed), or reverting the `vercel.json` line (the API is
unreachable again, which is today's state).

## What is NOT proven (do not call this done without these)

1. **Workers-runtime behavior against hosted Neon under real load.** The driver was verified from Node against hosted Neon and from
   workerd against a local Postgres. Step 3 is the first time the deployed Worker talks to Neon.
2. **CPU limits.** bcryptjs costs about 70 ms of CPU per login/signup. That needs the Workers **Paid** plan (the Free plan caps CPU at
   10 ms per request). Check the plan in the Cloudflare dashboard, and watch for `Exceeded CPU` in Workers logs during Step 3.
3. **`CF-Connecting-IP` behind Vercel.** Production audit data shows users already arrived from 2 shared IPs on Render, so
   single-device enforcement was already coarse; the Worker will behave the same. No regression, but it is not "fixed".
4. **The payment verifier is still a mock** (any signed-in user can grant themselves a paid plan). Checklist item 16 needs your decision.
5. **Rate limiting has been configured, not yet observed throttling** (checklist item 18): run `npm run migration:ratelimit` against a
   test account after Step 2.
6. **Neon schema decisions** listed under Step 1, and the secrets that were in git history (rotate the Gemini and Adzuna keys, and the
   old database credentials).
7. **Supabase → Neon data parity.** `scripts/migrate-to-neon.js` copied the data; I have no read access to the Supabase source, so I
   could not compare row counts. Neon-side integrity is consistent (foreign keys hold, sequences work, 10 users / 5 orders / 10 sessions).
   If the Supabase project still exists and you want a source-vs-target comparison, give me a read-only `SOURCE_DATABASE_URL`.
