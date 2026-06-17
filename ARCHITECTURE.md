# JobTune EcoSystem — Full Pipeline & Module Reference

A career-tooling platform: resume/ATS scoring, job tracking & discovery, interview prep, profile optimization (LinkedIn/GitHub), and AI-assisted career planning — gated behind a 3-tier subscription model. Stack: **Express 5 + PostgreSQL** backend, **React 18 + Vite (SSR-capable) + Zustand** frontend, **LM Studio** (self-hosted, OpenAI-compatible) for all AI features.

---

## 1. High-Level Architecture

```
┌─────────────────────────┐        ┌──────────────────────────┐        ┌────────────────────┐
│  Frontend (Vite/React)  │  HTTP  │  Backend (Express 5)      │  SQL   │  PostgreSQL         │
│  SSR for public pages   │◄──────►│  /api/* routes + services │◄──────►│  (Supabase-hosted)  │
│  CSR for authed app     │        │  JWT auth + sessions       │        │                     │
└─────────────────────────┘        └─────────────┬──────────────┘        └────────────────────┘
                                                   │ fetch (OpenAI-compatible chat/completions)
                                                   ▼
                                    ┌──────────────────────────┐
                                    │  LM Studio (self-hosted)  │
                                    │  Local LLMs via tunnel    │
                                    │  (Mistral/Llama/Qwen)     │
                                    └──────────────────────────┘
```

- **No cloud LLM provider is actually wired in.** `@anthropic-ai/sdk` is listed in `backend/package.json` but never imported anywhere in `backend/src` — it's a dead dependency. All AI calls go through `backend/src/utils/aiClient.js` → a self-hosted LM Studio instance reached via `LM_STUDIO_URL` (typically a Cloudflare Tunnel to a home/office PC).
- `winston` is also installed but unused; logging is done via `console.log`/`console.error` throughout.
- Every backend feature has a **deterministic fallback** when the LLM is unreachable or `MOCK_AI=true` — the app is designed to degrade gracefully rather than hard-fail when the local LLM host is offline.

---

## 2. Backend — Entry Point & Middleware Pipeline

**Entry:** `backend/src/server.js` → `backend/src/app.js`

Request pipeline (in order):
1. `cors()` — origin allow-list built from `FRONTEND_URL` env var (scheme auto-corrected to `https://` if missing, trailing slash stripped) plus localhost dev origins.
2. `express.json()` — body parsing.
3. `auditLogger('API_REQUEST', 'system')` — applied globally to `/api/*`; logs method/URL/status/query/IP to `audit_logs` table post-response, with request body redacted.
4. Route mounting (see §4).
5. `/admin` — static admin UI (`backend/src/public/admin`).
6. `/api/health` — liveness check.
7. SSR/CSR frontend serving via `setupFrontend(app)` (see §6).
8. Global `errorHandler` — logs stack trace, returns sanitized 500 (full message only in dev).

**Middleware (`backend/src/middleware/`):**
| File | Purpose |
|---|---|
| `auth.js` | `authenticateToken` — verifies JWT, checks session liveness via `sessionService.isSessionActive()`, touches `last_active_at`, rejects with `SESSION_SUPERSEDED` if another device took over the session. |
| `auditLogger.js` | Logs every API request to `audit_logs` (action, resource, IP, redacted body). |
| `errorHandler.js` | Centralized error → HTTP response translation. |

**Database (`backend/src/config/database.js`):** `pg.Pool` against `DATABASE_URL` (Supabase, SSL-enforced) or discrete `DB_*` env vars. Pool size 10, idle timeout 30s, connect timeout 2s.

---

## 3. Authentication & Session Model

`backend/src/routes/auth.js` + `backend/src/services/sessionService.js`

- **Signup/Login** — bcrypt password hashing, JWT access token + separate refresh token per session.
- **Single-active-device enforcement** — each user has at most one live session; logging in elsewhere returns a `SESSION_SUPERSEDED`-style conflict unless the client passes `replaceDevice: true`, which revokes the old session.
- **Endpoints:** `POST /signup`, `POST /login`, `POST /refresh`, `POST /logout`, `POST /logout-all`, `GET /sessions`, `DELETE /sessions/:sessionId`, `GET /me`.
- **Frontend mirror:** `useAuthStore` (Zustand) stores `{ token, refreshToken, sessionId }` in `localStorage`. Axios interceptor (`lib/auth-client.js`) attaches `Authorization: Bearer`, auto-refreshes on 401 (queues concurrent requests during refresh), and on a `SESSION_SUPERSEDED` code triggers a full-screen `<SessionBlocked>` view with a "use this device instead" action.

**Table:** `user_sessions(id, user_id, refresh_token_hash, device_name, user_agent, ip_address, last_active_at, expires_at, revoked_at, created_at)`

---

## 4. Subscription / Plan System (core gating mechanism)

### Data model
`backend/src/migrations/add-subscriptions.sql`

| Table | Columns |
|---|---|
| `subscription_plans` | `id, name, tier_level, description, price, features TEXT[], created_at` |
| `user_subscriptions` | `id, user_id (unique), plan_id, selected_at, status` |
| `onboarding_responses` | `id, user_id (unique), career_goal, experience_level, pain_points TEXT[], recommended_plan_id, completed_at` |

### The 3 tiers (seeded by migration)
| Tier | Name | Price | Features |
|---|---|---|---|
| 1 | **Learn & Build** | $0 | Learning Resources, Project Ideas, Skill Assessment |
| 2 | **Tune & Polish** | $29 | Resume Optimizer, LinkedIn Optimizer, GitHub Optimizer, Portfolio Builder, Project Ideas, Learning Resources |
| 3 | **Zero to Hero** | $79 | Everything in tier 2 + Interview Prep, Job Tracker, Career Roadmap, Skill Assessment, Cover Letter Generator, ATS Checker, Mock Interview |

### Backend logic
`backend/src/services/planService.js` — CRUD over plans/subscriptions; `hasAccess(userPlan, toolName)` checks `userPlan.features.includes(toolName)`.

`backend/src/services/recommendationEngine.js` — scores a recommended plan from onboarding answers: career goal (40 pts) + experience level (30 pts) + pain points (30 pts) → highest-scoring tier wins.

**Routes (`backend/src/routes/subscriptions.js`, mounted at `/api/subscriptions`):**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/plans` | public | List all 3 tiers |
| GET | `/my-plan` | yes | Current user's plan |
| POST | `/recommend` | yes | Score a recommendation from `{careerGoal, experienceLevel, painPoints}`, persists to `onboarding_responses` |
| POST | `/select-plan` | yes | Assign `{planId}` → upserts `user_subscriptions` |
| GET | `/onboarded` | yes | `true` if user has either an onboarding response or an active plan |

### Frontend enforcement
- `useSubscriptionStore` (Zustand) — fetches plans/my-plan/onboarded/recommend/select-plan; exposes `hasAccess(toolName)`.
- `config/toolAccess.js` — `TOOL_ACCESS` (tool → required plan), `ROUTE_TOOLS` (URL path → tool name), `PLAN_TIERS` (plan name → tier number).
- `<PlanGate>` component — wraps every tool page; compares `userTier >= requiredTier`; if denied, renders a locked state with an upgrade CTA deep-linking to `/dashboard/settings/plans?highlightPlan=X&fromTool=Y`.
- `<ProtectedToolRoute>` (in `App.jsx`) — composes auth check + onboarding check + `<PlanGate>` for every feature route.
- **Onboarding flow:** `Onboarding.jsx` → `<OnboardingQuestionnaire>` (3 questions) → `getRecommendation()` → `<PlanSelection>` (3-card picker, recommended plan highlighted) → `selectPlan()` → `/payment-confirm` (simulated payment, no real billing/payment gateway integration exists) → `/dashboard`.
- **Plan switching:** `PlanSettings.jsx` (`/dashboard/settings/plans`) shows all 3 plans side by side; `<PlanChangeModal>` shows gained/lost features and upgrade/downgrade delta via `config/planDetails.js` (`getFeatureDiff`, `getChangeType`, `formatPrice`).

> Note: there is no real payment processor integration (no Stripe/Paddle/etc. found) — `PaymentConfirm.jsx` is a simulated "processing…" screen that auto-redirects.

---

## 5. AI Layer

`backend/src/utils/aiClient.js` — single shared client used by every AI-powered feature.

- **Transport:** raw `fetch` to `${LM_STUDIO_URL}/chat/completions` (OpenAI-compatible schema), 120s timeout.
- **Model selection:** per-feature env vars — `LM_STUDIO_MODEL_RESUME`, `LM_STUDIO_MODEL_INTERVIEW`, `LM_STUDIO_MODEL_JOB`, `LM_STUDIO_MODEL_SKILLS`, `LM_STUDIO_MODEL_ROADMAP`, `LM_STUDIO_MODEL_EMBED`, falling back to generic `LM_STUDIO_MODEL`.
- **Reasoning-model guard:** `isReasoningModel()` detects QwQ/DeepSeek-R1-style models via regex and swaps to a fast instruct model when `structuredJson: true` is requested (reasoning models tend to blow past context limits on JSON tasks).
- **Self-healing retry:** if the server rejects a `system` role message (HTTP 400 mentioning "role"/"system"/"template"), it retries by merging system+user into a single user message.
- **Mock mode:** `MOCK_AI=true` short-circuits with canned responses (800ms simulated latency) — used for local dev without an LM Studio host.
- **`extractJSON(text)`** — pulls a JSON object/array out of a markdown-fenced or raw LLM response, with brace/bracket-matching fallback if `JSON.parse` fails outright.
- **Embeddings:** `backend/src/utils/embeddings.js` calls the same LM Studio host with `LM_STUDIO_MODEL_EMBED` (nomic-embed-text) for resume-chat RAG and evidence-bullet deduplication.

Every route that calls `callAI` also ships a **deterministic fallback generator** (template/regex-based) so the feature still returns a usable result if the LLM call fails — this pattern repeats across career roadmap, cover letter, interview, job analyzer, learning roadmap, and skills routes.

---

## 6. Frontend Rendering Strategy (SSR/CSR hybrid)

- Build produces two bundles: `vite build` (client) and `vite build --ssr src/entry-server.jsx` (server), via `frontend/package.json` `build:client`/`build:server`.
- `backend/src/ssr/setupFrontend.js` decides per-route whether to server-render (marketing pages: home, blog, login — for fast first paint + SEO) or serve the CSR shell (authenticated app: dashboard and all tool pages, since auth state isn't available server-side).
- `frontend/api/ssr.js` — a Vercel serverless-function-compatible handler mirroring the same SSR/CSR decision, used when the frontend is deployed standalone on Vercel rather than served through the Express backend.
- `<ClientOnly>` component — wraps browser-only UI so SSR doesn't choke on `window`/`localStorage` access; paired with `lib/browser.js` (`isBrowser`, `safeLocalStorage` guards).

---

## 7. Feature Modules (Backend Route → Service → Frontend Page)

Each row: route file (mount path) → primary service(s) → frontend page(s) consuming it. All routes below require `authenticateToken` unless noted "public".

### 7.1 Resume & ATS Pipeline
| Route file | Endpoints | Service | Frontend |
|---|---|---|---|
| `routes/resume.js` (`/api/resume`) | `POST /upload`, `GET /list`, `GET /scores`, `GET /:id`, `DELETE /:id`, `POST /tune`, `POST /ai-edit`, `POST /build` | `resumeDatabase`, `aiClient`, `pdf-parse`/`mammoth` parsing | `ResumeOptimizer.jsx`, `ResumeBuilder.jsx`, `ResumeHistory.jsx` |
| `routes/resumeV2.js` (`/api/resume`) | `POST /v2/analyze`, `POST /v2/feedback`, `POST /v2/export`, `GET /v2/history`, `GET /v2/:resumeId` | `v2/resumeAnalysisEngine`, `v2/resumeCriticEngine`, `v2/resumeExportEngine` | `ATSCheckerV2.jsx` |
| `routes/atsCheckerV2.js` (`/api/ats`) | `POST /v2/parse` | `pdf-parse`, `mammoth` (file→text) | `ATSCheckerV2.jsx` |
| `routes/atsExport.js` (`/api/ats`) | `POST /export/docx`, `POST /export/txt`, `GET /history` | `resumeExport`, `resumeDatabase` | `ResumeOptimizer.jsx` |
| `routes/resumeChat.js` (`/api/resume-chat`) | `POST /chat`, `POST /embed` | `embeddings`, `aiClient` (RAG: embed chunks → cosine similarity → LLM Q&A) | — |

**V2 deterministic scoring engine** (`backend/src/services/v2/`) — no LLM involved, <100ms target latency:

`resumeAnalysisEngine.js` orchestrates a weighted composite score:
- 20% `formattingAnalyzer.js` — spacing/length/consistency
- 20% `sectionAnalyzer.js` — section presence/structure (experience, education, skills, projects, certs, summary)
- 20% `keywordAnalyzer.js` — tech/domain keyword coverage vs. detected role
- 20% `experienceAnalyzer.js` — work history completeness (company/title/dates/bullets)
- 10% `projectAnalyzer.js` — project section completeness/diversity
- 10% `readabilityAnalyzer.js` — sentence length/word frequency

Supporting analyzers: `actionVerbAnalyzer.js` (strong-verb density), `metricsAnalyzer.js` (quantified-impact density: %, x, counts), `roleDetectionEngine.js` (infers target role), `missingInfoEngine.js` (gap detection), `contactValidator.js` (email/phone/LinkedIn/GitHub presence). `resumeCriticEngine.js` turns the analysis into rule-based feedback text; `resumeExportEngine.js` renders PDF/DOCX/TXT.

**Tables:** `resumes`, `analyses`, `resume_exports`, `resume_embeddings`.

### 7.2 Job Tools
| Route file | Endpoints | Service | Frontend |
|---|---|---|---|
| `routes/jobTracker.js` (`/api/jobs`) | `GET /`, `POST /`, `PATCH /:id`, `DELETE /:id` | direct DB (`job_applications`) | `JobTracker.jsx` (Kanban: applied→interview→offer/rejected) |
| `routes/jobDiscovery.js` (`/api/jobs`) | `GET /discover` | `services/discovery/` source factory | `JobDiscovery.jsx` |
| `routes/jobAnalyzer.js` (`/api/jobs`) | `POST /analyze-description` | `aiClient` + regex fallback | `JobAnalyzer.jsx` |
| `routes/jobFit.js` (`/api/jobs`) | `POST /fit` | `services/scoring/strategies/jobFit.js` | `JobFitAnalysis.jsx` |
| `routes/coverLetter.js` (`/api/jobs`) | `POST /generate-cover-letter` | `aiClient` + fallback | `CoverLetterGenerator.jsx` |

**Job discovery sources** (`backend/src/services/discovery/`): `JobSource.js` (abstract base, contract `search(query, location)`), `MockJobSource.js` (5 hardcoded jobs), `RemotiveSource.js` (Remotive public API), `AdzunaSource.js` (Adzuna API, needs `ADZUNA_APP_ID`/`ADZUNA_APP_KEY`). `index.js` is a factory (`getSource(name)`).

**Job fit scoring** (`services/scoring/strategies/jobFit.js`): composite = 35% domain match + 35% seniority match + 30% skills overlap; hybrid — tries LLM first, falls back to O*NET taxonomy (`services/taxonomy/onetLoader.js`, backed by `data/onet/occupations.json`) + regex matching.

**Tables:** `job_applications`, `discovered_jobs`.

### 7.3 Interview & Career Prep
| Route file | Endpoints | Service | Frontend |
|---|---|---|---|
| `routes/interview.js` (`/api/interview`) | `POST /start`, `POST /:id/respond`, `GET /history` | `aiClient` + question bank fallback | `MockInterview.jsx` |
| `routes/careerRoadmap.js` (`/api/career`) | `POST /roadmap`, `GET /roadmap/:id`, `GET /roadmap` | `aiClient` + fallback | `CareerRoadmap.jsx` |
| `routes/guides.js` (`/api/guides`) | `POST /generate`, `GET /:id` | `services/guides/jobGuideGenerator.js` | `JobGuide.jsx` |
| `routes/jobPreparation.js` (`/api/job-prep`) | `POST /star-stories`, `POST /tutor`, `POST /projects`, `POST /project-blueprint` | `aiClient`, structured prompts + fallback | `TuneAndPolishTrack.jsx`, `ZeroToHeroTrack.jsx`, `LearnAndBuildTrack.jsx` |

`JobPreparation.jsx` is the track selector: **Tune & Polish** (resume+interview, experienced candidates), **Zero to Hero** (full pathway + AI tutor wizard, beginners), **Learn & Build** (project-based portfolio building, intermediate). Wizard progress for these multi-step tracks persists cross-device via `useUserProgress` hook → `routes/progress.js` (`/api/progress`, tables: `user_progress` keyed by `context_key` ∈ {zero-to-hero, learn-and-build, tune-and-polish, preferences}).

**Tables:** `mock_interviews`, `career_roadmaps`, `job_guides`, `user_progress`.

### 7.4 Profile Optimization
| Route file | Endpoints | Service | Frontend |
|---|---|---|---|
| `routes/profiles.js` (`/api/profiles`) | `POST /github/analyze`, `POST /linkedin/analyze`, `POST /jobmatch` | GitHub public API, scoring engines, taxonomy | `GitHubOptimizer.jsx`, `LinkedInOptimizer.jsx`/`LinkedInOptimizerEnhanced.jsx`, `JobMatcher.jsx` |

GitHub analyzer fetches public profile/repo data (no GitHub auth token required) and scores it; also powers a README generator (`<GitHubReadmeGenerator>` / `<GitHubReadmePreview>` components, `utils/readmeGenerator.js`). LinkedIn analyzer is form-based (no live LinkedIn scraping — user pastes headline/about/skills/etc.) and scores completeness. `jobmatch` is keyword-overlap scoring between pasted skills and a job description.

### 7.5 Learning & Skills
| Route file | Endpoints | Service | Frontend |
|---|---|---|---|
| `routes/skills.js` (`/api/skills`) | `POST /assessment`, `GET /history` | `aiClient` + fallback | `SkillAssessment.jsx` |
| `routes/learning.js` (`/api/learning`) | `POST /generate-roadmap`, `GET /roadmaps`, `GET /resources` (public) | `aiClient` + fallback | `ContentVault.jsx` |
| `routes/projects.js` (`/api/projects`) | `GET /ideas` | static hardcoded list | `ProjectIdeas.jsx` |

**Tables:** `skill_assessments`, `learning_roadmaps`.

### 7.6 Evidence Tracking (resume bullet reuse/diversity)
`routes/evidence.js` (`/api/evidence`) → `services/evidence/evidenceTracker.js` → `EvidenceDashboard.jsx`

- `extractBullets()` splits resume text on bullet markers; `extractSkillsFromText()` keyword-matches against ~22 known skill types.
- `saveBullet()` hashes + embeds (dedup via `embeddings.js`) into `evidence_bullets`.
- `logUsage()` records each reuse context (tailored resume / cover letter) into `evidence_usage`.
- `getReuseReport()` computes a diversity score and flags over-/under-used bullets — the idea being a candidate shouldn't reuse the exact same 3 bullets across every application.

**Tables:** `evidence_bullets`, `evidence_usage`.

### 7.7 Privacy / PII
`routes/piiRedaction.js` (`/api/pii`) → `services/pii/piiRedactor.js`
- `POST /redact` — regex-based detection (email, US phone, address, capitalized name patterns) → returns redacted text + a token→original map; overlapping matches are de-duplicated.
- `POST /restore` — reverses redaction using the map.
- Use case: sharing a resume/cover letter publicly (e.g., portfolio site) without leaking contact details.

**Table:** `pii_redactions`.

### 7.8 Dashboard & Admin
- `routes/dashboard.js` (`/api/dashboard`, `GET /overview`) — aggregates resume score, interview count/scores, job application stats, and AI-suggested next actions into one payload for `Dashboard.jsx`.
- `routes/admin.js` (`/api/admin`, requires `authenticateToken` + admin role) — `GET /stats`, `GET /users`, `GET /audit-logs`, `PUT /users/:id/role`. Served at `/admin` static UI plus these JSON endpoints.
- `routes/benchmarks.js` (`/api/benchmarks`, admin-only) — `GET /run` triggers `services/benchmarks/scorerBenchmark.js` to evaluate scorer accuracy/latency against a named dataset.

**Tables:** `users`, `audit_logs`.

---

## 8. Database Schema Summary

| Table | Key columns | Owning feature |
|---|---|---|
| `users` | email, password_hash, github_username, linkedin_url, role | Auth |
| `user_sessions` | user_id, refresh_token_hash, device_name, expires_at, revoked_at | Auth/sessions |
| `audit_logs` | user_id, action, resource, details, ip_address | Audit middleware |
| `subscription_plans` | name, tier_level, price, features[] | Subscriptions |
| `user_subscriptions` | user_id (unique), plan_id, status | Subscriptions |
| `onboarding_responses` | user_id (unique), career_goal, experience_level, pain_points[] | Subscriptions/onboarding |
| `resumes` | user_id, original_resume, optimized_resume, original_score, optimized_score, keyword_coverage | Resume |
| `analyses` | resume_id (unique), section_completeness, keyword_relevance, formatting_score, recommendations | Resume V2 |
| `resume_exports` | resume_id, export_format, file_path | Resume export |
| `resume_embeddings` | user_id, resume_id, chunk_index, chunk_text, embedding | Resume chat (RAG) |
| `job_applications` | user_id, company, role, status, source, applied_at | Job tracker |
| `discovered_jobs` | user_id, external_id, source, title, company, tags (unique on source+external_id) | Job discovery |
| `job_guides` | user_id, application_id, guide (JSONB) | Guides |
| `evidence_bullets` | user_id, bullet_text, bullet_hash (unique per user), skills, embedding | Evidence |
| `evidence_usage` | bullet_id, application_id, context | Evidence |
| `mock_interviews` | user_id, role, messages, feedback, score | Interview |
| `learning_roadmaps` | user_id, gaps, target_role, roadmap, ai_powered | Learning |
| `career_roadmaps` | user_id, current_role, target_role, timeframe, roadmap | Career roadmap |
| `skill_assessments` | user_id, skills, strengths, gaps, role_matches | Skills |
| `pii_redactions` | user_id, context_type, context_id, redaction_map | PII |
| `user_progress` | user_id, context_key (unique per user), progress_data | Cross-device wizard progress |

---

## 9. Frontend Module Map

### Pages (`frontend/src/pages/`)
| Page | Tool | Plan tier required* |
|---|---|---|
| `Home.jsx` | Marketing landing (public, SSR) | — |
| `Login.jsx` | Auth (public, SSR) | — |
| `Onboarding.jsx` | Questionnaire → plan recommendation | — |
| `PaymentConfirm.jsx` | Simulated payment → dashboard | — |
| `Dashboard.jsx` | Hub: readiness/skill/resume scores, tool grid with lock icons | — |
| `PlanSettings.jsx` | Plan comparison + switch | — |
| `SkillAssessment.jsx` | 4-question technical quiz → AI scoring | Learn & Build |
| `ResumeOptimizer.jsx` | ATS resume analyzer/scorer | Tune & Polish |
| `ResumeBuilder.jsx` | Resume builder (placeholder/"coming soon") | Tune & Polish |
| `ResumeHistory.jsx` | Version history (placeholder) | Tune & Polish |
| `ResumeComparison.jsx` | Diff two resume versions | Tune & Polish |
| `ResumeSend.jsx` | Send to reviewers (placeholder) | Tune & Polish |
| `LinkedInOptimizer.jsx` / `LinkedInOptimizerEnhanced.jsx` | LinkedIn profile scoring | Tune & Polish |
| `GitHubOptimizer.jsx` | GitHub profile audit + README generator | Tune & Polish |
| `PortfolioBuilder.jsx` | Drag-and-drop portfolio site builder (no backend yet) | Tune & Polish |
| `ProjectIdeas.jsx` | Curated project templates | Learn & Build |
| `ContentVault.jsx` | Learning resource library | Learn & Build |
| `MockInterview.jsx` | AI interview chatbot | Zero to Hero |
| `JobMatcher.jsx` | Skill-vs-JD keyword match | Tune & Polish |
| `JobTracker.jsx` | Kanban application tracker | Zero to Hero |
| `JobDiscovery.jsx` | Multi-source job search | Zero to Hero |
| `CareerRoadmap.jsx` | Phased career plan generator | Zero to Hero |
| `ATSCheckerV2.jsx` | Deterministic ATS score + breakdown | Zero to Hero |
| `JobAnalyzer.jsx` | JD parser/structurer | Zero to Hero |
| `JobFitAnalysis.jsx` | Resume-vs-JD fit radar chart | Zero to Hero |
| `CoverLetterGenerator.jsx` | AI cover letter generator | Zero to Hero |
| `EvidenceDashboard.jsx` | Bullet reuse/diversity analytics | Zero to Hero |
| `JobPreparation.jsx` | Track selector | Zero to Hero |
| `TuneAndPolishTrack.jsx` | STAR story generator + links | Zero to Hero |
| `ZeroToHeroTrack.jsx` | Beginner wizard + AI tutor | Zero to Hero |
| `LearnAndBuildTrack.jsx` | Project-based roadmap + Kanban | Zero to Hero |
| `JobGuide.jsx` | Company/role interview guide | Zero to Hero |
| `Blog.jsx` | Static blog (public) | — |

\* Tier requirements come from `config/toolAccess.js`; consult that file directly for the authoritative mapping, as it's the single source of truth enforced by `<PlanGate>`.

### Components (`frontend/src/components/`)
| Component | Role |
|---|---|
| `Layout.jsx` | Global nav/header, responsive menu, dark-mode toggle |
| `PlanGate.jsx` | Tier-check gate around tool pages |
| `PlanSelection.jsx` | 3-card plan picker (onboarding) |
| `PlanChangeModal.jsx` | Upgrade/downgrade confirmation with feature diff |
| `OnboardingQuestionnaire.jsx` | 3-question intake form |
| `SessionBlocked.jsx` | Full-screen single-device-conflict message |
| `ErrorBoundary.jsx` | React error boundary |
| `ClientOnly.jsx` | SSR-safe browser-only wrapper |
| `ConfirmModal.jsx` | Generic confirm/cancel dialog |
| `LoadingButton.jsx` | Button with spinner/disabled state |
| `ResumePreview.jsx` | Resume render/preview |
| `GitHubReadmeGenerator.jsx` / `GitHubReadmePreview.jsx` | README builder + markdown preview |
| `SkeletonCard.jsx` | Loading placeholder |
| `SuggestionTracker.jsx` | Suggestion/tip tracking UI |

### State & utilities
- **`store/useAuthStore.js`** (Zustand) — login/signup/logout/checkAuth, token + session-id persistence, session-supersede handling.
- **`store/useSubscriptionStore.js`** (Zustand) — plans/my-plan/onboarded/recommend/select-plan, `hasAccess(toolName)`.
- **`hooks/useUserProgress.js`** — debounced (700ms) cross-device progress sync against `/api/progress/:contextKey`.
- **`lib/auth-client.js`** — Axios instance with auth header injection + 401 refresh queueing.
- **`lib/browser.js`** — `isBrowser`, `safeLocalStorage` SSR guards.
- **`config/toolAccess.js`** — `TOOL_ACCESS`, `ROUTE_TOOLS`, `PLAN_TIERS` (source of truth for gating).
- **`config/planDetails.js`** — plan metadata, `getChangeType`, `getFeatureDiff`, `formatPrice`.

---

## 10. Environment Configuration

**Backend (`backend/.env`):**
```
PORT, DATABASE_URL, JWT_SECRET, NODE_ENV
LM_STUDIO_URL, LM_STUDIO_MODEL, LM_STUDIO_MODEL_{RESUME,INTERVIEW,JOB,SKILLS,ROADMAP,EMBED}
MOCK_AI
ADZUNA_APP_ID, ADZUNA_APP_KEY
FRONTEND_URL
```

**Frontend (`frontend/.env`):**
```
VITE_API_URL   # points at deployed backend, e.g. https://jobtune-backend-xxx.onrender.com/api
```

**Deployment topology (inferred from recent commits/config):** backend on Render, frontend on Vercel (with its own SSR handler at `frontend/api/ssr.js`), LM Studio self-hosted behind a Cloudflare Tunnel, Postgres on Supabase.

---

## 11. Notable Cross-Cutting Patterns

1. **LLM-optional design** — nearly every AI-touched route has a non-AI fallback (template or rule-based), so the product functions even if the self-hosted LM Studio box is offline.
2. **Plan gating is enforced client-side only via `<PlanGate>`** — worth confirming whether backend routes also check `planService.hasAccess()` server-side, since right now most feature routes only check `authenticateToken`, not plan entitlement. This is a potential authorization gap if the frontend gate is bypassed (e.g., direct API calls).
3. **Single-device session enforcement** is unusual for this kind of app — deliberate anti-sharing measure tied to the subscription model.
4. **Two parallel resume-scoring pipelines exist**: the legacy AI-driven `routes/resume.js` and the newer deterministic `routes/resumeV2.js`/`services/v2/*`. The git status at the time of writing shows several legacy services deleted (`atsScoring.js`, `resumeOptimizer.js`, `resumeStructure.js`, `keywordIntelligence.js`, `missingInfoEngine.js` (v1), `resumeMatcher.js`, `skillClassifier.js`, the v1 `atsChecker.js` route) — indicating an in-progress migration fully onto the V2 deterministic engine.
5. **Dead dependencies** — `@anthropic-ai/sdk` and `winston` are installed but unused; don't assume Claude/Anthropic API or structured logging are active just because they're in `package.json`.
