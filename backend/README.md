# Backend — JobTube Eco System

Express + PostgreSQL API. Entry point: [src/server.js](src/server.js) → wires [src/app.js](src/app.js).

For setup/env vars/running, see [../docs/SETUP.md](../docs/SETUP.md). For what each feature actually does end-to-end, see [../docs/modules/](../docs/modules/) — this file is a map of the backend folder only.

## Structure

```
src/
  server.js        Entry point: connects DB, self-provisions schema, starts Express
  app.js            Express app: CORS, JSON body parsing, audit logging, route mounting, error handler
  config/
    database.js     pg Pool setup (reads DATABASE_URL)
  routes/           One file per feature area — thin HTTP layer, calls services
  services/         Business logic + DB queries. Feature-specific subfolders:
    v2/             ATS Checker V2's rule-based analyzers (one file per check: action verbs,
                     certifications, contact info, education, experience, formatting, metrics,
                     missing-info, projects, readability, role detection, sections, skills)
                     — orchestrated by resumeAnalysisEngine.js
    discovery/       Job source adapters (Adzuna, Remotive, Mock) behind a common JobSource interface
    scoring/strategies/  Job-fit scoring (currently one strategy: jobFit.js)
    evidence/        Evidence-tracking logic for the recruiter-visibility feature
    guides/          Job-prep guide generation
    pii/             PII detection/redaction for recruiter-facing profiles
    taxonomy/        O*NET occupation/skill taxonomy loader
    benchmarks/      Resume scorer benchmarking harness
  middleware/
    auth.js           authenticateToken — verifies JWT + checks session still active
    requirePlan.js     requirePlan(minTier) — server-side plan-tier gate
    auditLogger.js      Logs every /api request to audit_logs
    errorHandler.js     Global error handler; hides internals unless NODE_ENV=development
  migrations/        Standalone .sql files (NOT auto-run — see docs/SETUP.md)
  utils/
    initializeTables.js   Auto-creates core tables on boot (CREATE TABLE IF NOT EXISTS)
    runMigrations.js       Auto-creates subscription tables on boot if missing
  data/onet/          Static O*NET taxonomy data files
  public/admin/        Static admin frontend bundle, served directly by Express
  ssr/setupFrontend.js  Wires the frontend's SSR bundle into Express for production serving
scripts/              One-off/manual scripts (resume generation, learning-content import) — not part of the request pipeline
tests/                 Jest tests — route- and service-level
```

## Routing map

Every route file in `src/routes/` is mounted in [src/app.js](src/app.js). Which module doc covers which route file:

| Route file | Module doc |
|---|---|
| `auth.js`, `subscriptions.js`, `progress.js` | [01-auth-onboarding](../docs/modules/01-auth-onboarding.md) |
| `resume.js`, `resumeChat.js`, `atsExport.js` | [02-resume-builder](../docs/modules/02-resume-builder.md) |
| `resumeV2.js`, `atsCheckerV2.js` | [03-ats-checker](../docs/modules/03-ats-checker.md) |
| `jobDiscovery.js`, `jobTracker.js`, `jobFit.js`, `jobAnalyzer.js` | [04-job-discovery-tracker](../docs/modules/04-job-discovery-tracker.md) |
| `interview.js`, `jobPreparation.js`, `guides.js` | [05-interview-prep](../docs/modules/05-interview-prep.md) |
| `learning.js`, `learningPath.js` | [06-learning-path](../docs/modules/06-learning-path.md) |
| `careerRoadmap.js`, `skills.js`, `projects.js`, `benchmarks.js` | [07-career-roadmap-skills](../docs/modules/07-career-roadmap-skills.md) |
| `profiles.js`, `evidence.js`, `piiRedaction.js`, `recruiterVisibility.js` | [08-profile-evidence-recruiter](../docs/modules/08-profile-evidence-recruiter.md) |
| `coverLetter.js`, `achievementEnhancer.js`, `resumeConsistency.js` | [09-content-generation](../docs/modules/09-content-generation.md) |
| `dashboard.js`, `admin.js` | [10-dashboard-admin-platform](../docs/modules/10-dashboard-admin-platform.md) |

## Tests

```bash
npm test              # jest --coverage
npm run test:watch
npm run test:coverage # enforces 80% branches/functions/lines/statements
```

Tests live in `tests/` and are named after the service/route they cover (e.g. `jobTracker.test.js`, `piiRedactor.test.js`, `onetLoader.test.js`, `evidence.routes.test.js`). Not every route file has a corresponding test — check `tests/` before assuming coverage exists for a given feature.

## Known issues

See the "Cross-Module Findings" section in [../docs/README.md](../docs/README.md) for correctness bugs, security gaps, and dead code identified in this codebase — several are backend-specific (e.g. conflicting table schemas between `initializeTables.js`/`runMigrations.js`, missing rate limiting, the mock payment verifier).
