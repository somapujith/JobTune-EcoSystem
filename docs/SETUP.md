# Local Development Setup

Grounded in the actual scripts/config in `backend/` and `frontend/` as of 2026-09-14.

## Prerequisites

- Node.js (backend uses CommonJS + `pg`, frontend uses Vite — Node 18+ recommended)
- A reachable PostgreSQL database. **The live/current environment runs on [Neon](https://neon.tech)** (serverless Postgres) — get the pooled connection string from the Neon console (Project → Connect) and use it as `DATABASE_URL`. Supabase also works out of the box if you'd rather self-host a dev DB there — see [SUPABASE_SETUP.md](archive/SUPABASE_SETUP.md) in the archive for that walkthrough. Any standard Postgres works; `database.js` only requires a `DATABASE_URL` connection string (SSL is on unless the URL says `sslmode=disable`). For local dev, skip all of that and use the Docker stack in [section 3](#3-database--no-manual-migration-step-needed).
- Optional: an LM Studio instance (or any OpenAI-compatible endpoint) if you want real AI-generated output instead of mocked responses

## Quick start (local, ~2 minutes)

Needs Node 18+ and Docker Desktop running.

```bash
npm run setup     # installs root + backend + frontend deps, creates backend/.env (generates JWT_SECRET)
npm run db:up     # starts local Postgres (docker compose, port 5433) and waits until healthy
npm run seed      # creates the schema, imports the 66 Frontend learning topics, adds a test user
npm run dev       # (re)starts the DB if needed, then API :5000 + web :5173
```

Open http://localhost:5173 and sign in with `user@gmail.com` / `test@123` (Zero to Hero plan, onboarding complete).

How the pieces connect: browser → **Vite dev server :5173** → `/api/*` is proxied to → **Express API :5000** → **Postgres :5433**. The frontend calls same-origin `/api`, so no CORS or frontend `.env` is needed. Check it end to end with `curl localhost:5173/api/health`, which should report `"db":"connected"`.

## 1. Clone & install

```bash
npm run setup               # everything below in one go
# or manually:
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
| `DATABASE_URL` | **Yes** | Postgres connection string (`postgresql://user:pass@host:port/db`). Production uses a Neon pooled connection string (`...-pooler.<region>.aws.neon.tech/neondb?sslmode=require&channel_binding=require`) — get your own from the Neon console, never reuse someone else's, and never commit it (`.env` is gitignored) |
| `JWT_SECRET` | **Yes** | Signs access tokens — see [Module 01](modules/01-auth-onboarding.md) |
| `NODE_ENV` | No | `development` unmasks internal error messages in responses (see `errorHandler.js`) |
| `LM_STUDIO_URL` | Only if `MOCK_AI=false` | Base URL of an OpenAI-compatible inference endpoint |
| `LM_STUDIO_MODEL_RESUME` / `_INTERVIEW` / `_JOB` / `_SKILLS` / `_ROADMAP` / `_EMBED` | Only if `MOCK_AI=false` | Model names routed per feature |
| `MOCK_AI` | No (default behaves as unset/false) | Set `true` to skip real LLM calls and use mocked AI output — useful for running the app without an inference endpoint |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | Only for live job search | Credentials for the Adzuna job-search API — see [Module 04](modules/04-job-discovery-tracker.md) |
| `FRONTEND_URL` | Recommended | Used for CORS allow-listing |

### `frontend/.env` (optional — copy from `frontend/.env.example` only if needed)

Local dev needs **no** `frontend/.env`: with nothing set, the app calls same-origin `/api` and the Vite dev server proxies it to the backend.

| Variable | Required | Purpose |
|---|---|---|
| `VITE_API_PROXY` | No (default `http://localhost:5000`) | Where the Vite dev server proxies `/api` — must match the backend `PORT` |
| `VITE_API_URL` | No | Call a backend directly instead of via the proxy (baked into production builds, e.g. the deployed Render URL). The backend must then allow the origin via `FRONTEND_URL` (CORS) |

## 3. Database — no manual migration step needed

On boot, `backend/src/server.js` runs, in order:
1. `initializeTables()` — creates every core table with `CREATE TABLE IF NOT EXISTS` (idempotent)
2. `runMigrations()` — adds subscription-related tables if missing
3. `sessionService.ensureTables()` — creates session/progress tables

So pointing `DATABASE_URL` at an empty Postgres database (Neon or otherwise) and starting the server is sufficient — it self-provisions its schema, no manual `CREATE TABLE` or migration-runner step required. Standalone `.sql` files in `backend/src/migrations/` (`add-ats-tables.sql`, `add-github-analyses.sql`, `add-subscriptions.sql`) exist for reference/manual application if needed, but are not run automatically.

**Working against the shared/production Neon database:** all 27 tables already exist there with live data (users, subscriptions, learning-path content, etc.) — pointing your local backend at it means you're developing against real data, not a sandbox. For local development use the Docker stack below instead of the shared production `DATABASE_URL`.

### Local backend in Docker (recommended for development)

`docker-compose.yml` at the repo root runs the API and a local Postgres 17 together, fully isolated from Neon. Needs Docker Desktop (or Docker Engine + Compose v2.24+).

```bash
docker compose up --build            # API → http://localhost:5000, Postgres → localhost:5433
docker compose up --build --watch    # same, plus edits under backend/src sync into the container and restart it
docker compose up -d db              # Postgres only, if you'd rather run the API on the host
docker compose down                  # stop (data kept in the `pgdata` volume)
docker compose down -v               # stop and wipe the local database
```

Root `npm run docker:up | docker:watch | docker:db | docker:down | docker:reset | docker:psql` wrap the same commands.

- **No `.env` needed.** The container gets `DATABASE_URL=postgresql://jobtune:jobtune@db:5432/jobtune?sslmode=disable` from the compose file and dev defaults from `backend/.env.docker` (dev-only `JWT_SECRET`, `MOCK_AI=true`, `NODE_ENV=development`). `backend/.env` (which points at Neon) is deliberately excluded from the image. To use real AI or change any default, create `backend/.env.docker.local` (gitignored, loaded after `.env.docker`); `DATABASE_URL` and `PORT` are pinned in the compose file and can't be overridden there.
- **Empty database on first boot.** The API provisions its own schema (section above). Seed a login with `docker compose exec api node scripts/create_test_user.js` (`user@gmail.com` / `test@123`).
- **API only.** The container has no frontend build, so it logs `API-only mode`. Run the frontend on the host (`cd frontend && npm run dev`); its Vite proxy sends `/api` to `localhost:5000`, which is the container, so no `frontend/.env` is needed. The container and a host-run API both want port 5000 — run one or the other, or remap the container with `API_HOST_PORT` and set `VITE_API_PROXY` to match.
- **Host access to the DB:** `docker compose exec db psql -U jobtune jobtune`, or any client at `localhost:5433` (user/password/db all `jobtune`). Bound to loopback only. To run host-side scripts against it (e.g. `scripts/import_learning_topics.js`, which reads `Topic_workflows/` and so can't run inside the container), set `DATABASE_URL=postgresql://jobtune:jobtune@localhost:5433/jobtune?sslmode=disable`.
- **Port clashes:** 5433 (not 5432) is the default so it coexists with other local Postgres containers; set `POSTGRES_HOST_PORT` / `API_HOST_PORT` (shell or a root `.env`) to remap the published ports.
- **SSL:** `config/database.js` turns SSL off for `localhost`/`127.0.0.1` URLs and for any URL with `sslmode=disable`, and forces it on for everything else (Neon). The compose file's in-network URL (`@db:5432`) isn't localhost, so it relies on `?sslmode=disable` — keep it.

**Known gotcha** (see [docs/README.md](README.md) cross-module findings): `initializeTables.js` and `runMigrations.js` define conflicting `resumes` table schemas. If you've run one boot path and then change code paths, check the actual `resumes` table columns before assuming `overall_score` vs `original_score`/`optimized_score` exists.

If the DB is unreachable at boot, the server logs a warning and **starts anyway** — every DB-backed endpoint will then fail at request time rather than at startup.

## 4. Run it

```bash
# from repo root — starts the local DB (waits until healthy), then API + web together
npm run dev

# API + web only (DB already running, or DATABASE_URL points elsewhere)
npm run dev:apps

# or independently, in two terminals
cd backend && npm run dev     # node src/server.js, default port 5000
cd frontend && npm run dev    # vite, default port 5173
```

The frontend reaches the backend through the Vite `/api` proxy (see `frontend/vite.config.js`); keep `VITE_API_PROXY` in sync with the backend `PORT` if you change it. Database helpers: `npm run db:up` / `db:down` (stop, keep data) / `db:init` (create schema only) / `seed` (schema + topics + test user); `npm run docker:reset` wipes the local DB.

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
