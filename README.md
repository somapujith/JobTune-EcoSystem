# JobTube Eco System

Fresher/early-career job-preparation platform: resume building & ATS scoring, job discovery & tracking, interview prep, a tiered learning path, career roadmap & skills assessment, recruiter-facing profiles, and an AI content-generation suite (cover letters, LinkedIn/GitHub/portfolio content).

Monorepo: **Express + PostgreSQL** backend, **React + Vite** frontend.

## Start here

| I want to... | Go to |
|---|---|
| Get the app running locally | [docs/SETUP.md](docs/SETUP.md) |
| Understand a specific feature/module (auth, resume builder, ATS checker, etc.) | [docs/README.md](docs/README.md) — module index |
| See known bugs, security gaps, and dead code found across the codebase | [docs/README.md#cross-module-findings-from-code-not-speculation](docs/README.md#cross-module-findings-from-code-not-speculation) |
| Work on the backend specifically | [backend/README.md](backend/README.md) |
| Work on the frontend specifically | [frontend/README.md](frontend/README.md) |
| Track the Cloudflare Workers migration | [docs/CLOUDFLARE_MIGRATION.md](docs/CLOUDFLARE_MIGRATION.md) |
| Read older planning/design docs (historical, not guaranteed accurate) | [docs/archive/](docs/archive/) |

## Quickstart

```bash
# from repo root — installs nothing itself, just runs both dev servers
npm run dev          # concurrently runs backend (:5000) + frontend (:5173)

# or separately
npm run dev:backend  # cd backend && node src/server.js
npm run dev:frontend # cd frontend && npm run dev
```

Requires `backend/.env` and `frontend/.env` to be populated first — see [docs/SETUP.md](docs/SETUP.md).

## Repo layout

```
backend/    Express API, PostgreSQL (Neon) access, business logic — see backend/README.md
frontend/   React (Vite) SPA/SSR client — see frontend/README.md
docs/       Module-by-module documentation (source of truth) + setup guide
docs/archive/  Superseded/historical planning docs, kept for reference only
workflow/   n8n / automation workflow exports
Topic_workflows/  Learning-path curriculum content (source data for Module 06)
```

## Documentation approach

`docs/modules/*.md` is the authoritative reference — each doc is grounded directly in the current `backend/src` / `frontend/src` code (file-by-file, with API tables and known issues), not aspirational. If a doc under `docs/archive/` disagrees with a doc under `docs/modules/` or `docs/README.md`, trust `docs/modules/`.

## In progress

Backend is connected to Cloudflare Workers via Cloudflare's native Git integration (auto-deploys on push) but the actual Express app hasn't been ported yet — the deployed Worker is still a stub. See [docs/CLOUDFLARE_MIGRATION.md](docs/CLOUDFLARE_MIGRATION.md) for the compatibility assessment, porting plan, and deploy mechanism. The Express app (run locally / wherever it's hosted today) remains the real backend until the port is complete.
