# Local Development Setup

Grounded in the actual scripts/config in `backend/` and `frontend/` as of 2026-09-14.

## Prerequisites

- Node.js (backend uses CommonJS + `pg`, frontend uses Vite — Node 18+ recommended)
- A reachable PostgreSQL database (Supabase works out of the box — see [SUPABASE_SETUP.md](archive/SUPABASE_SETUP.md) in the archive for the original Supabase walkthrough)
- Optional: an LM Studio instance (or any OpenAI-compatible endpoint) if you want real AI-generated output instead of mocked responses

## 1. Clone & install

```bash
npm install                 # root — only installs `concurrently`
cd backend && npm install
cd ../frontend && npm install
```

There is no root-level workspace linking — `backend/` and `frontend/` are independent npm projects with their own `package.json` / `node_modules`.

## 2. Configure environment variables

### `backend/.env` (copy from `backend/.env.example`)

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | No (default `5000`) | Backend HTTP port |
| `DATABASE_URL` | **Yes** | Postgres connection string (`postgresql://user:pass@host:port/db`) |
| `JWT_SECRET` | **Yes** | Signs access tokens — see [Module 01](modules/01-auth-onboarding.md) |
| `NODE_ENV` | No | `development` unmasks internal error messages in responses (see `errorHandler.js`) |
| `LM_STUDIO_URL` | Only if `MOCK_AI=false` | Base URL of an OpenAI-compatible inference endpoint |
| `LM_STUDIO_MODEL_RESUME` / `_INTERVIEW` / `_JOB` / `_SKILLS` / `_ROADMAP` / `_EMBED` | Only if `MOCK_AI=false` | Model names routed per feature |
| `MOCK_AI` | No (default behaves as unset/false) | Set `true` to skip real LLM calls and use mocked AI output — useful for running the app without an inference endpoint |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | Only for live job search | Credentials for the Adzuna job-search API — see [Module 04](modules/04-job-discovery-tracker.md) |
| `FRONTEND_URL` | Recommended | Used for CORS allow-listing |

### `frontend/.env` (copy from `frontend/.env.example`)

| Variable | Required | Purpose |
|---|---|---|
| `VITE_API_URL` | **Yes** | Base URL the frontend calls, e.g. `http://localhost:5000/api` for local dev |

## 3. Database — no manual migration step needed

On boot, `backend/src/server.js` runs, in order:
1. `initializeTables()` — creates every core table with `CREATE TABLE IF NOT EXISTS` (idempotent)
2. `runMigrations()` — adds subscription-related tables if missing
3. `sessionService.ensureTables()` — creates session/progress tables

So pointing `DATABASE_URL` at an empty Postgres database and starting the server is sufficient — it self-provisions its schema. Standalone `.sql` files in `backend/src/migrations/` (`add-ats-tables.sql`, `add-github-analyses.sql`, `add-subscriptions.sql`) exist for reference/manual application if needed, but are not run automatically.

**Known gotcha** (see [docs/README.md](README.md) cross-module findings): `initializeTables.js` and `runMigrations.js` define conflicting `resumes` table schemas. If you've run one boot path and then change code paths, check the actual `resumes` table columns before assuming `overall_score` vs `original_score`/`optimized_score` exists.

If the DB is unreachable at boot, the server logs a warning and **starts anyway** — every DB-backed endpoint will then fail at request time rather than at startup.

## 4. Run it

```bash
# from repo root — runs both together
npm run dev

# or independently, in two terminals
cd backend && npm run dev     # node src/server.js, default port 5000
cd frontend && npm run dev    # vite, default port 5173
```

Frontend dev server proxies/calls the backend via `VITE_API_URL` — make sure it matches wherever the backend is actually listening.

## 5. Tests

```bash
cd backend && npm test              # jest --coverage
cd backend && npm run test:coverage # same, but fails under 80% branches/functions/lines/statements
```

Test files live in `backend/tests/` (route- and service-level, e.g. `jobTracker.test.js`, `piiRedactor.test.js`, `onetLoader.test.js`). There is no frontend test suite or E2E suite currently wired up (`frontend/e2e/` exists as a directory but is empty at time of writing) — verify frontend changes manually in the browser.

## 6. Build (frontend)

```bash
cd frontend
npm run build          # build:client + build:server (SSR bundle)
npm run preview        # preview the client build
npm run preview:ssr    # preview via the SSR server (server/preview.mjs)
```

## Common pitfalls

- **"Server starts but every API call fails"** — almost always `DATABASE_URL` unreachable or wrong; check the startup console warning.
- **AI features return generic/templated output** — check `MOCK_AI` and whether `LM_STUDIO_URL` is actually reachable from where the backend runs.
- **Job search returns nothing** — `ADZUNA_APP_ID`/`ADZUNA_APP_KEY` are unset; see [Module 04](modules/04-job-discovery-tracker.md) for fallback behavior.
- **Payment flow "succeeds" instantly** — expected. `/verify-payment` is a mock with no real gateway wired up (see [Module 01](modules/01-auth-onboarding.md)).
