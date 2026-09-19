# Pre-push security and hygiene review (2026-09-19)

Four independent read-only reviews were run over everything committed with the Cloudflare Workers port (Worker security
core; SQL/data-exposure sweep over all Worker code; the local-dev/Express changes; secrets and repo hygiene). Result: **no
unfixed blocker**. Items below are either fixed with a regression test, or open with an owner action.

> This repository is public. The open items are deliberately described at remediation level only (no payloads, timings or
> line references). The reviewers' detailed notes were handed to the repository owner out of band.

Method limits: static reading plus throwaway probes with synthetic secrets and fake databases. Nothing ran against a real
database, Render, Vercel or a deployed Worker. Green tests and a clean review do not prove SQL correctness on Neon or runtime
CPU/memory behavior.

## Fixed in this change (each has a regression test)

| # | Finding | Where | Test |
|---|---|---|---|
| F1 | Urlencoded body/query parsing had quadratic cost on repeated keys and no parameter limit (CPU exhaustion before routing or auth). Now linear; Express's 1000-parameter limits restored. | `src/worker/lib/http.js`, `middleware/bodyParser.js` | `tests/worker/formParsing.test.js` |
| F2 | Chunked multipart uploads without a truthful `Content-Length` skipped the size cap. The cap is now enforced while streaming and the upload is cancelled at the limit. | `src/worker/lib/upload.js` | `tests/worker/uploadBounded.test.js` |
| F3 | The `onboarding_completed` backfill re-ran on every Render boot and could mark unpaid users as onboarded. Now runs only in the run that adds the column. | `src/utils/runMigrations.js` | `tests/runMigrations.onboarding.test.js` |
| F4 | `/api/health` awaited the database with no bound. Now bounded at 2 s (Express and Worker). | `src/app.js`, `src/worker/routes/health.js` | `tests/worker/infra/health.test.js` |
| F5 | Destructive local-dev scripts could run against whatever `backend/.env` points at (possibly production). They now refuse non-local hosts unless `ALLOW_REMOTE=1`. | `backend/scripts/lib/assertLocalDb.js` | `tests/assertLocalDb.test.js` |
| F6 | Docker: API exposed on all interfaces; `.dockerignore` gaps. | `docker-compose.yml`, `backend/.dockerignore` | n/a |
| F7 | A Neon socket failure could escape masking as the runtime's own error page. A last-resort guard returns the masked 500; the pool `error` event is handled. | `src/worker-entry.js`, `src/worker/db.js` | `tests/worker/db.test.js`, `npm run migration:smoke` |
| F8 | Comments claimed the Worker serves only `/api/health`. Corrected, with the warning in O1. | `wrangler.toml`, `worker-entry.js` | n/a |
| F9 | Tests that only passed on one machine (gitignored fixtures, a missing `DATABASE_URL`). Built-in fixtures and a jest env default added; the full suite was run with fixtures and `.env` removed. | `scripts/migration/lib/fallbackFixtures.js`, `tests/setupEnv.js` | full suite |

## Open: owner action or decision

| # | Item |
|---|---|
| O1 | **Do not set `JWT_SECRET` / `DATABASE_URL` on the deployed Worker until rate limiting is provisioned** (`[[ratelimits]]` in `wrangler.toml`, `docs/migration/rate-limiting.md`). Pushing deploys the whole API to the public `workers.dev` URL; without secrets every route fails closed. With them there is no brute-force protection on login and each anonymous request costs a database connection and an audit row. |
| O2 | **Secrets already in git history** (not added by this change): older commits contain a tracked `backend/.env`. Rotate the database password, API keys and JWT secret that were in it. History was not rewritten. |
| O3 | The payment verifier is a mock (already documented in this repository). It is ported as-is; it needs an explicit decision before any cutover (ADR checklist 16). |
| O4 | Several routes accept unbounded input sizes; some regular expressions are vulnerable to backtracking on long inputs. Add per-route length caps. |
| O5 | Several AI-backed endpoints have no plan gate and no prompt-size cap; rate limiting (O1) is the first mitigation. |
| O6 | Some error responses include internal error text (Express behavior, preserved). Return generic messages, and send the Gemini key in a header rather than the URL. |
| O7 | Two authorization gaps inherited from Express (documented in `docs/migration/wave/*.md`). Fix in the post-cutover PR. |
| O8 | Object-lookup on user-supplied keys (`SORT_MAP[sort]` pattern) in a few routes: garbage or masked errors only, not injectable. Use `Object.hasOwn`. |
| O9 | Render deploy: `runMigrations` will add `users.onboarding_completed` and `career_discovery_responses` on the next boot. Check the Render log for `Migration error`. A new `backend/Dockerfile` should be ignored by a Node-runtime service; a Docker-type service would build it. |
| O10 | The README/SETUP advertise a local test account. Confirm no such account exists in production. |
| O11 | `backend/coverage/` is tracked despite being gitignored; consider `git rm -r --cached backend/coverage`. |

## Verified OK

Admin route coverage and path-variant probing; JWT algorithm pinning, expiry and secret length; `requirePlan` failing closed on
malformed tiers; CORS exact matching; error masking; request body limits; prototype-pollution resistance; parameterized SQL
throughout the Worker; no user-influenced outbound hosts; no secrets or tokens in logs; payment compare-and-set and cross-user
check preserved; lockfile changes limited to `hono` and `bcryptjs` from `registry.npmjs.org` with integrity hashes.
