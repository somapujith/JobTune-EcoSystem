# JobTube Eco System — Improvement Opportunities

Survey date: 2026-08-31. Based on a full read of the actual codebase (not the pre-existing
root-level docs, which describe an aspirational/stale architecture — see note at bottom).

## Current State (verified from code)

- **Stack**: Express 5 + raw `pg` (no ORM, despite docs claiming Sequelize), React 18 + Vite SSR,
  Zustand state, JWT auth with refresh tokens (`sessions` table, 1h access / 30d refresh).
- **AI**: All AI features hit a self-hosted **LM Studio** instance (`LM_STUDIO_URL`,
  `backend/src/utils/aiClient.js`) via OpenAI-compatible chat completions — not the Claude API.
  `@anthropic-ai/sdk` is installed in `package.json` but appears unused/vestigial.
- **No realtime anything**: zero websockets, SSE, or polling anywhere in backend or frontend.
  AI calls run synchronously inline in route handlers with up to a 120s timeout.
- **No queue/cron**: no retry on failed AI calls, no scheduled refresh of anything (e.g. job
  discovery is pull-on-request only).
- **Payment is fake**: `frontend/src/pages/PaymentConfirm.jsx` has zero payment gateway
  integration — just a `setTimeout` then a redirect to the dashboard. `subscriptions.js` lets
  users self-select a plan with no charge behind it.
- **Route duplication**: `backend/src/routes/resume.js` (v1, 769 lines) and `resumeV2.js`
  (v2, 275 lines) are both live and both mounted on the same `/api/resume` prefix in `app.js`.
  Not dead code — active tech debt.
- **Weak data integrity**: most tables use a bare `user_id INTEGER` with no FK constraint —
  only a few tables reference `users(id)` with `ON DELETE CASCADE`.
- **Docs drift**: `00_START_HERE.md`, `DOCUMENTATION_INDEX.md`, `PROJECT_ARCHITECTURE_GUIDE.md`
  at the repo root claim Sequelize ORM, Claude API, and Winston audit logging — none of which
  match the actual code (raw `pg`, LM Studio, a custom `auditLogger` middleware). Treat those
  as roadmap/marketing copy, not ground truth, until rewritten.

### Backend surface (28 route files under `backend/src/routes/`)

`auth`, `resume` (v1), `resumeV2`, `atsCheckerV2`, `atsExport`, `subscriptions`, `skills`,
`careerRoadmap`, `learning`, `interview`, `jobTracker`, `jobAnalyzer`, `jobFit`, `jobDiscovery`,
`jobPreparation`, `coverLetter`, `profiles` (GitHub/LinkedIn analysis), `recruiterVisibility`,
`resumeConsistency`, `resumeChat`, `achievementEnhancer`, `evidence`, `piiRedaction`, `guides`,
`benchmarks`, `progress`, `dashboard`, `admin`, `projects`.

### Frontend surface (35 pages under `frontend/src/pages/`)

Resume tools (Optimizer, Builder, History, Comparison, Send), ATS Checker V2, LinkedIn/GitHub
Optimizer, Portfolio Builder, Mock Interview, Job Tracker/Discovery/Matcher/Fit/Analyzer, Cover
Letter Generator, Career Roadmap, Skill Assessment, Recruiter Visibility, Resume Consistency,
Achievement Enhancer, Evidence Dashboard, Onboarding, Plan Settings, Payment Confirm (fake),
Dashboard, Blog, Content Vault, Project Ideas, plus three subscription-tier "track" pages.

### Data model (from `initializeTables.js` / `runMigrations.js`)

`users`, `resumes`, `mock_interviews`, `skill_assessments`, `learning_roadmaps`,
`career_roadmaps`, `resume_embeddings`, `job_applications`, `discovered_jobs`, `job_guides`,
`scorer_benchmarks`, `evidence_bullets`, `evidence_usage`, `audit_logs`, `pii_redactions`,
`onet_occupations`, `subscription_plans`, `user_subscriptions`, `onboarding_responses`,
`analyses`, `resume_exports`, `sessions`.

## Improvements, ranked by impact

### 1. Make AI calls actually realtime (highest priority)

120-second synchronous requests are the biggest "not useful" risk in the product today.

- Move AI calls to a job queue (BullMQ + Redis) — return a job ID immediately instead of
  blocking the HTTP request.
- Stream progress via SSE or websocket (e.g. `/api/resume/analyze/:jobId/stream`) so the
  frontend shows live status ("Parsing resume... Scoring ATS... Generating suggestions...")
  instead of a blank spinner with no feedback.
- Add retry + timeout handling around LM Studio calls so a transient failure doesn't just
  surface as a generic 500.

### 2. Real payment integration

The fake `PaymentConfirm` flow blocks any real monetization. Wire Stripe or Razorpay with
webhook-driven subscription activation and real billing history instead of self-select.

### 3. Kill the resume.js / resumeV2.js split

Confirm which frontend pages call which endpoint, migrate fully onto the v2 schema, and delete
v1. Behavior currently depends on Express route-matching order between two handlers mounted on
the same prefix — fragile and confusing to maintain.

### 4. Cloud LLM fallback

LM Studio is a local/self-hosted tunnel — a single point of failure for the entire AI feature
set. Add the Claude API (the SDK is already installed) as a fallback when LM Studio is
unreachable, so AI features degrade gracefully instead of failing outright.

### 5. Async job discovery

`jobDiscovery.js` pulls from Adzuna/Remotive only on-request. Add a cron job (node-cron or a
BullMQ repeatable job) to refresh discovered jobs periodically and notify users of new matches
— this is where "realtime" matters most for actual user value (timely job alerts).

### 6. Notifications layer

No email or push notifications exist anywhere. Add transactional email (SendGrid/Resend is
enough to start) for: job match alerts, application status reminders, AI analysis complete,
subscription/billing events.

### 7. Fix the docs

Regenerate `README`/architecture docs from the actual code (raw `pg`, LM Studio, custom
`auditLogger`) so they stop misleading anyone onboarding onto the project.

### 8. Foreign key integrity

Add proper FK constraints (with `ON DELETE CASCADE` where appropriate) to the tables currently
using a bare `user_id INTEGER` with no reference — prevents orphaned rows on user deletion.
