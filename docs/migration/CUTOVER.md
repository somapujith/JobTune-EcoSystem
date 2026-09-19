# Cutover: the Cloudflare Worker is the production API

Last updated 2026-09-20. **Status: CUT OVER and verified end to end through the production domain, with the open items listed at the bottom.**
See also [security-review-2026-09-19.md](security-review-2026-09-19.md).

## What is live (verified on 2026-09-20)

| Layer | State |
|---|---|
| Frontend | `https://job-tune-eco-system.vercel.app` (Vercel, deployed from `main`) |
| API | Cloudflare Worker `jobtune-ecosystem` at `https://jobtune-ecosystem.somapujith.workers.dev`. `frontend/vercel.json` rewrites `/api/*` to it (commit `c6f1ca24`). Render is retired: `jobtune-backend-14k0.onrender.com` answers `404 x-render-routing: no-server` |
| Database | Neon (PostgreSQL 18.6, pooled endpoint). Additive schema applied on 2026-09-20 (`onboarding_completed`, `career_discovery_responses`, `users.name/full_name`, `github_analyses`); row counts unchanged (10 users, 5 orders, 3 plans) |
| Worker config | `wrangler.toml` `[vars]` (NODE_ENV, FRONTEND_URL, Gemini provider/model, MOCK_AI=false) and rate-limit bindings. Secrets set with `wrangler secret put`: `JWT_SECRET` (**new**, generated), `DATABASE_URL`, `GEMINI_API_KEY`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` |

## Acceptance evidence

`npm run migration:e2e -- --base https://job-tune-eco-system.vercel.app --frontend https://job-tune-eco-system.vercel.app --allow-writes`
→ **22 of 22 checks pass through the production domain** (health with `db: connected`, plans, auth gate, error masking, CORS allow/deny,
frontend served, rewrite works, signup, `/me`, plan gate `PLAN_UPGRADE_REQUIRED`, onboarding flag, session replacement,
refresh, logout, wrong password). The same journey passes 21/22 directly on the Worker (the one failure was the rewrite, before it existed).

Also verified live: a real Gemini answer through the production domain (see "Defects found by the live run"); rate limiting throttles
(with a delay, see below); hosted-Neon driver checks (cold connect 233 ms, warm 49 ms, multi-statement, 20 parallel per-request pools).

Rollback: `wrangler rollback` (previous Worker version), `wrangler secret delete JWT_SECRET` (every route fails closed), or reverting the
`vercel.json` line (the API is then unreachable, as before the cutover; there is no Render to return to).

## Defects found and fixed by the live run

1. **AI answers were being truncated.** `gemini-2.5-flash` thinks by default and thinking tokens count against `maxOutputTokens`; at the
   app's budgets (e.g. 1000) the JSON was cut off, so every JSON-returning AI route silently returned its canned fallback (Express had
   the same code). Fixed in both clients (`thinkingBudget: 0` for the 2.5 flash models), commit `9189f434`; verified live.
2. **Neon schema incomplete** (Render's boot migrations no longer run): applied with `scripts/migration/apply-neon-schema.js`.
3. **Auth brute-force limiter keyed by IP would have throttled all users together** (production audit data: users share a couple of proxy
   IPs); now keyed by account.

## Known limitations (be honest about these)

1. **Rate limiting is looser than designed.** Cloudflare's binding is eventually consistent: with a limit of 5 per 60 s per account, the
   first 429 arrived at about attempt 30, then everything was blocked (26 of 26). It bounds password guessing to tens of attempts per minute
   per account, not 5. For an exact limit, add a database-backed failed-login counter (code change, follow-up).
2. **Single-active-device is coarse behind Vercel.** The client IP the Worker sees is Vercel's rotating egress IP (`13.201.x.x`, varying
   within the range), so re-logging in from the same device sometimes answers 409 `ACCOUNT_IN_USE`; the frontend then offers "continue on this
   device" (`replaceDevice`). Render had the same effect (2 distinct IPs across 200 recorded requests). `X-Forwarded-For` is deliberately
   not trusted (tests pin this). Trusting Vercel's forwarded header would fix the friction but makes the device IP spoofable when the
   `workers.dev` URL is hit directly.
3. **The payment verifier is still a mock:** any signed-in user can create an order for a paid plan and verify it themselves. Ported as-is,
   pinned by a test. Needs your decision before real money is involved.
4. **CPU plan.** bcryptjs costs about 70 ms of CPU per login/signup. Signup, login and refresh ran in production without CPU errors, but
   I cannot see which Workers plan the account is on; confirm it is Paid (the Free plan caps CPU at 10 ms per request).
5. **Schema decisions left to you** (`proposed-schema-fixes.sql`): the two incompatible `learning_streaks` shapes (the course-streak display
   shows zeros; nothing breaks), empty `profiles` / `interview_sessions` / `projects` tables (career-score output), unique indexes.
6. **Supabase → Neon data parity is unproven.** I have no read access to the Supabase source. Neon itself is internally consistent.
7. **Secrets in git history** (older commits contain a tracked `.env`): rotate the database credentials, the Gemini and Adzuna keys. The
   Gemini and Adzuna values now set on the Worker came from your local `.env`; if those are the leaked ones, rotate and re-run
   `set-worker-secrets.ps1`.
8. **Test accounts** created by the acceptance runs remain in production (`jt-e2e-*@example.com`, no plan, no data). Remove with:
   `DELETE FROM users WHERE email LIKE 'jt-e2e-%@example.com';`

## Re-running the pieces

```powershell
cd backend
npm run migration:e2e -- --base https://job-tune-eco-system.vercel.app --frontend https://job-tune-eco-system.vercel.app --allow-writes
npm run migration:check-schema:live                      # with DATABASE_URL set to the Neon URL (read-only)
powershell -File scripts/migration/set-worker-secrets.ps1  # rotate secrets (values via stdin)
```
