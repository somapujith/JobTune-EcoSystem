# Render/Express endpoint manifest (reference)

> GENERATED FILE - do not edit. Regenerate with `node backend/scripts/migration/generate-manifest.js` (run from `backend/`).
> Source of truth: static AST analysis of `backend/src/app.js` and `backend/src/routes/*.js`. Machine-readable twin: `docs/migration/manifest.render.json`.
> Purpose: ADR-001 T4.1 / section 6.3 - the reference artifact that the Workers manifest is diffed against (`backend/scripts/migration/compare-manifests.js`).

Generated from the working tree on top of git HEAD `38d8130a3a`; uncommitted paths under `backend/src` at generation time: `M backend/src/app.js`, `M backend/src/config/database.js`, `M backend/src/routes/careerRoadmap.js`, `M backend/src/routes/subscriptions.js`, `M backend/src/server.js`, `M backend/src/services/planService.js`, `M backend/src/utils/runMigrations.js`, `M backend/src/worker-entry.js`, `?? backend/src/worker/`. Route/mount/guard changes among them are part of this manifest; use `--from-head` to see the committed baseline (the ADR numbers were measured at a committed state).

## 1. Headline counts and ADR reconciliation

| Measure | ADR-001 | Derived from source | Result |
| --- | --- | --- | --- |
| route files on disk (src/routes/*.js) | 41 | 41 | match |
| route files mounted from app.js | 41 | 41 | match |
| endpoints defined in route files | 181 | 183 | **MISMATCH** |
| mount points (app.use(prefix, router)) | 41 | 41 | match |
| route files using requirePlan | 26 | 26 | match |
| requirePlan(...) call sites (AST) | 100 | 90 | **MISMATCH** |
| requirePlan call sites in community.js | 14 | 12 | **MISMATCH** |
| requirePlan call sites in aiCoach.js | 11 | 7 | **MISMATCH** |
| requirePlan call sites in practice.js | 10 | 10 | match |
| requirePlan call sites in profiles.js | 8 | 8 | match |
| requirePlan call sites in projectBuilder.js | 7 | 7 | match |
| requirePlan call sites in courses.js | 7 | 7 | match |
| requirePlan call sites in studyHistory.js | 7 | 7 | match |

Other counts: 184 endpoints total (183 in route files + 1 registered directly on `app`), 177 authenticated, **7 public (no authenticateToken)**, 5 requireAdmin, 12 requireRole, 90 plan-gated endpoints (by tier: tier 1: 57, tier 2: 21, tier 3: 12), 0 router-on-router mounts.

ADR counting-method check: the ADR's per-file requirePlan numbers (community 14, aiCoach 11, ...) **are exactly reproduced** by counting TEXT LINES that contain `requirePlan(` (per route file, JSDoc header and section comments included) and the ADR total is **exactly reproduced** when the 1 definition line in `middleware/requirePlan.js` is added (total 100). Comment lines and the definition are not call sites, so the real, AST-counted number of `requirePlan(...)` call sites is **90** (all with literal arguments: 90).

## 2. Schema (for the Workers-side extractor)

The JSON has a top-level `schema` field with the same content. The comparator needs only `method`, `path`, `auth` (required) and `admin`, `roles`, `minTier`, `guards` (optional, defaults false / null / null / []). Everything else is informational.

| Endpoint field | Meaning |
| --- | --- |
| `id` | string. "METHOD /full/path". Not unique if a route is registered twice. |
| `method` | REQUIRED string. Upper-case HTTP method (GET POST PUT PATCH DELETE HEAD OPTIONS ALL). |
| `path` | REQUIRED string. Full path = mount prefix + route path, starting with "/", no trailing slash (except "/"). Params as ":name" (Hono ":name{regex}" and Express ":name(regex)" accepted). |
| `auth` | REQUIRED boolean. true iff authenticateToken is in the effective chain: inline, via a preceding file-level router.use(), or mount/app-level. |
| `admin` | boolean (default false). true iff a requireAdmin guard is in the effective chain. |
| `roles` | string[] \| null (default null). Union of literal args of requireRole(...) guards in the chain, else null. |
| `minTier` | number \| string \| null (default null). Highest numeric literal arg of requirePlan(n) in the chain; null when not plan-gated; a string (source text of the argument) when the argument is not a literal (always accompanied by flag NON_LITERAL_MINTIER). |
| `guards` | string[]. Guard middleware in effective order, canonical text, e.g. ["authenticateToken","requirePlan(2)"]. Any middleware whose name matches authenticate*/require*/optionalAuth is a guard. |
| `chain` | string[]. All effective middleware labels in order (app-level, mount-level, file-level, route-level) excluding the terminal handler; aliases resolved (auth -> authenticateToken); "<inline>" = anonymous function. Informational (Workers naming will differ). |
| `layers` | {app, mount, file, route}: string[] each; chain split by where it was registered. Informational. |
| `handler` | string. Label of the terminal handler ("<inline>" for anonymous functions). |
| `routePath` | string. Path relative to its router. |
| `mountPrefix` | string\|null. Absolute prefix of the router this route lives on (null for routes registered directly on app). |
| `mountOrder` | number\|null. 1-based index of the top-level mount (app.use(prefix, router)) in app.js. |
| `routerFile` | string\|null. Repo-relative router file. |
| `order` | number. 1-based global registration order (Express match order). |
| `sourceFile` | string. Repo-relative file containing the registration. |
| `line` | number. 1-based line of the router.<method>( call. |
| `flags` | string[]. Static-analysis notes: NON_LITERAL_MINTIER, PLAN_WITHOUT_AUTH, PLAN_BEFORE_AUTH, MULTIPLE_PLAN_GUARDS, ADMIN_WITHOUT_AUTH, UNRESOLVED_MIDDLEWARE:<label>, LOCAL_GUARD_DEFINITION:<name>, ALIASED_GUARD:<alias>, REQ_USER_WITHOUT_AUTH, DYNAMIC_PATH, COMPLEX_PATH_PATTERN, NON_TOPLEVEL_REGISTRATION, REQUIREPLAN_NOT_CALLED. |

Keying: Endpoints are paired on METHOD + canonical(path): lower-cased, trailing slash stripped, every :param (any name / regex constraint) replaced with ":". First occurrence wins on duplicates.

Hono note: Hono exposes app.routes (method, path, handler[]); resolve each handler to a guard name (e.g. by function name or a registry) and emit the same required fields.

Comparator severities: CRITICAL (exit 2) = auth / admin / role guard dropped or widened, minTier dropped or lowered on the candidate; ERROR (exit 1) = missing / extra endpoint (extras allowed with `--allow-extra-in-candidate`), method mismatch, guard or tier added / raised, unverifiable minTier, missing guard; WARN / INFO = advisory.

## 3. Middleware applied at app level (in registration order)

| # | Path | Kind | Middleware | Options | Line |
| --- | --- | --- | --- | --- | --- |
| 1 | / | security-headers | helmet() |  | app.js:53 |
| 2 | / | cors | cors(...) | origin: (origin, callback) => { if (!origin \|\| allowedOrigins.includes(origin)) { callback(null...; methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']; allowedHeaders: ['Content-Type', 'Authorization']; credentials: true | app.js:92 |
| 3 | / | body-parser | express.json(...) | limit: '1mb' | app.js:105 |
| 4 | / | body-parser | express.urlencoded(...) | extended: false; limit: '1mb' | app.js:106 |
| 5 | /api | audit-logger | auditLogger("API_REQUEST","system") |  | app.js:109 |
| 6 | /api | rate-limit | apiLimiter | windowMs: 15 * 60 * 1000; max: process.env.NODE_ENV === 'development' ? 500 : 100; standardHeaders: true; legacyHeaders: false; message: { error: 'Too many requests, please try again later.' } | app.js:112 |
| 7 | /admin | static | express.static(...) |  | app.js:156 |
| 8 | / | static | express.static(...) (via setupFrontend() in backend/src/ssr/setupFrontend.js) |  | ssr/setupFrontend.js:79 |
| 9 | / | inline-handler | <inline> (via setupFrontend() in backend/src/ssr/setupFrontend.js) |  | ssr/setupFrontend.js:81 |
| 10 | / | error-handler | errorHandler |  | app.js:180 |

`app.use(prefix, ...)` layers cover every route under the prefix that is registered after them. `app.use(express.static(...))` / the SSR handler are non-API surface; the SSR handler skips `/api` and `/admin` by an internal `req.path.startsWith` check (not statically provable, see section 7).

## 4. Mount table (order matters: Express matches in this order)

| # | Prefix | Route file | Mount-level middleware | Endpoints | Shares prefix with | app.js line |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | /api/auth | routes/auth.js | authLimiter {windowMs: 15 * 60 * 1000; max: 20; standardHeaders: true; legacyHeaders: false; message: { error: 'Too many authentication attempts, please try again later.' }} | 8 | - | 113 |
| 2 | /api/subscriptions | routes/subscriptions.js | - | 6 | - | 114 |
| 3 | /api/skills | routes/skills.js | - | 3 | - | 115 |
| 4 | /api/resume | routes/resume.js | - | 8 | routes/resumeV2.js | 116 |
| 5 | /api/resume | routes/resumeV2.js | - | 5 | routes/resume.js | 117 |
| 6 | /api/dashboard | routes/dashboard.js | - | 1 | - | 118 |
| 7 | /api/projects | routes/projects.js | - | 1 | - | 119 |
| 8 | /api/profiles | routes/profiles.js | - | 12 | - | 120 |
| 9 | /api/learning | routes/learning.js | - | 3 | - | 121 |
| 10 | /api/admin | routes/admin.js | - | 4 | - | 122 |
| 11 | /api/interview | routes/interview.js | - | 3 | - | 123 |
| 12 | /api/resume-chat | routes/resumeChat.js | - | 2 | - | 124 |
| 13 | /api/career | routes/careerRoadmap.js | - | 5 | - | 125 |
| 14 | /api/jobs | routes/jobTracker.js | - | 4 | routes/jobAnalyzer.js, routes/coverLetter.js, routes/jobDiscovery.js, routes/jobFit.js | 126 |
| 15 | /api/ats | routes/atsExport.js | - | 3 | routes/atsCheckerV2.js | 127 |
| 16 | /api/ats | routes/atsCheckerV2.js | - | 1 | routes/atsExport.js | 128 |
| 17 | /api/jobs | routes/jobAnalyzer.js | - | 1 | routes/jobTracker.js, routes/coverLetter.js, routes/jobDiscovery.js, routes/jobFit.js | 129 |
| 18 | /api/jobs | routes/coverLetter.js | - | 1 | routes/jobTracker.js, routes/jobAnalyzer.js, routes/jobDiscovery.js, routes/jobFit.js | 130 |
| 19 | /api/guides | routes/guides.js | - | 2 | - | 131 |
| 20 | /api/benchmarks | routes/benchmarks.js | - | 1 | - | 132 |
| 21 | /api/evidence | routes/evidence.js | - | 2 | - | 133 |
| 22 | /api/pii | routes/piiRedaction.js | - | 2 | - | 134 |
| 23 | /api/jobs | routes/jobDiscovery.js | - | 1 | routes/jobTracker.js, routes/jobAnalyzer.js, routes/coverLetter.js, routes/jobFit.js | 135 |
| 24 | /api/jobs | routes/jobFit.js | - | 1 | routes/jobTracker.js, routes/jobAnalyzer.js, routes/coverLetter.js, routes/jobDiscovery.js | 136 |
| 25 | /api/job-prep | routes/jobPreparation.js | - | 4 | - | 137 |
| 26 | /api/progress | routes/progress.js | - | 4 | - | 138 |
| 27 | /api/recruiter-visibility | routes/recruiterVisibility.js | - | 1 | - | 139 |
| 28 | /api/resume-consistency | routes/resumeConsistency.js | - | 1 | - | 140 |
| 29 | /api/jobs/achievement-enhancer | routes/achievementEnhancer.js | - | 1 | - | 141 |
| 30 | /api/ai-tutor | routes/aiTutor.js | - | 8 | - | 142 |
| 31 | /api/project-builder | routes/projectBuilder.js | - | 7 | - | 143 |
| 32 | /api/study-tools | routes/studyTools.js | - | 4 | - | 144 |
| 33 | /api/courses | routes/courses.js | - | 7 | - | 145 |
| 34 | /api/ai-coach | routes/aiCoach.js | - | 7 | - | 146 |
| 35 | /api/community | routes/community.js | - | 12 | - | 147 |
| 36 | /api/practice | routes/practice.js | - | 10 | - | 148 |
| 37 | /api/admin-panels | routes/adminPanels.js | - | 12 | - | 149 |
| 38 | /api/activity | routes/activity.js | - | 6 | - | 150 |
| 39 | /api/study-history | routes/studyHistory.js | - | 7 | - | 151 |
| 40 | /api/learning-modules | routes/learningModules.js | - | 6 | - | 152 |
| 41 | /api/learning-path | routes/learningPath.js | - | 6 | - | 153 |


Nested-prefix mount: `/api/jobs/achievement-enhancer` (mount #29, routes/achievementEnhancer.js) is registered by app.js after 5 mount(s) whose prefix contains it (`/api/jobs` #14, `/api/jobs` #17, `/api/jobs` #18, `/api/jobs` #23, `/api/jobs` #24); it is a sibling app.use() mount, not a router nested inside a router.

## 5. Per route file

| Route file | Mounted at | Endpoints | Auth | Public | requirePlan sites | Tiers (endpoints) | Admin | Role | File-level use() |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| routes/achievementEnhancer.js | /api/jobs/achievement-enhancer | 1 | 1 | 0 | 1 | T2:1 | - | - | - |
| routes/activity.js | /api/activity | 6 | 6 | 0 | 0 | - | - | - | - |
| routes/admin.js | /api/admin | 4 | 4 | 0 | 0 | - | 4 | - | use(authenticateToken,requireAdmin) @20 |
| routes/adminPanels.js | /api/admin-panels | 12 | 12 | 0 | 0 | - | - | 12 | - |
| routes/aiCoach.js | /api/ai-coach | 7 | 7 | 0 | 7 | T2:2 T3:5 | - | - | - |
| routes/aiTutor.js | /api/ai-tutor | 8 | 8 | 0 | 3 | T1:3 | - | - | - |
| routes/atsCheckerV2.js | /api/ats | 1 | 1 | 0 | 1 | T2:1 | - | - | - |
| routes/atsExport.js | /api/ats | 3 | 3 | 0 | 0 | - | - | - | - |
| routes/auth.js | /api/auth | 8 | 4 | 4 | 0 | - | - | - | - |
| routes/benchmarks.js | /api/benchmarks | 1 | 1 | 0 | 0 | - | 1 | - | - |
| routes/careerRoadmap.js | /api/career | 5 | 5 | 0 | 3 | T1:3 | - | - | - |
| routes/community.js | /api/community | 12 | 12 | 0 | 12 | T1:10 T2:2 | - | - | - |
| routes/courses.js | /api/courses | 7 | 7 | 0 | 7 | T1:7 | - | - | - |
| routes/coverLetter.js | /api/jobs | 1 | 1 | 0 | 1 | T2:1 | - | - | - |
| routes/dashboard.js | /api/dashboard | 1 | 1 | 0 | 0 | - | - | - | - |
| routes/evidence.js | /api/evidence | 2 | 2 | 0 | 1 | T3:1 | - | - | - |
| routes/guides.js | /api/guides | 2 | 2 | 0 | 0 | - | - | - | - |
| routes/interview.js | /api/interview | 3 | 3 | 0 | 1 | T3:1 | - | - | - |
| routes/jobAnalyzer.js | /api/jobs | 1 | 1 | 0 | 1 | T3:1 | - | - | - |
| routes/jobDiscovery.js | /api/jobs | 1 | 1 | 0 | 1 | T2:1 | - | - | - |
| routes/jobFit.js | /api/jobs | 1 | 1 | 0 | 1 | T3:1 | - | - | - |
| routes/jobPreparation.js | /api/job-prep | 4 | 4 | 0 | 0 | - | - | - | - |
| routes/jobTracker.js | /api/jobs | 4 | 4 | 0 | 1 | T3:1 | - | - | - |
| routes/learning.js | /api/learning | 3 | 2 | 1 | 2 | T1:2 | - | - | - |
| routes/learningModules.js | /api/learning-modules | 6 | 6 | 0 | 2 | T3:2 | - | - | - |
| routes/learningPath.js | /api/learning-path | 6 | 6 | 0 | 0 | - | - | - | - |
| routes/piiRedaction.js | /api/pii | 2 | 2 | 0 | 0 | - | - | - | - |
| routes/practice.js | /api/practice | 10 | 10 | 0 | 10 | T1:10 | - | - | - |
| routes/profiles.js | /api/profiles | 12 | 12 | 0 | 8 | T2:8 | - | - | - |
| routes/progress.js | /api/progress | 4 | 4 | 0 | 0 | - | - | - | - |
| routes/projectBuilder.js | /api/project-builder | 7 | 7 | 0 | 7 | T1:7 | - | - | - |
| routes/projects.js | /api/projects | 1 | 1 | 0 | 1 | T1:1 | - | - | - |
| routes/recruiterVisibility.js | /api/recruiter-visibility | 1 | 1 | 0 | 1 | T2:1 | - | - | - |
| routes/resume.js | /api/resume | 8 | 8 | 0 | 0 | - | - | - | - |
| routes/resumeChat.js | /api/resume-chat | 2 | 2 | 0 | 0 | - | - | - | - |
| routes/resumeConsistency.js | /api/resume-consistency | 1 | 1 | 0 | 1 | T2:1 | - | - | - |
| routes/resumeV2.js | /api/resume | 5 | 5 | 0 | 3 | T2:3 | - | - | - |
| routes/skills.js | /api/skills | 3 | 3 | 0 | 3 | T1:3 | - | - | - |
| routes/studyHistory.js | /api/study-history | 7 | 7 | 0 | 7 | T1:7 | - | - | - |
| routes/studyTools.js | /api/study-tools | 4 | 4 | 0 | 4 | T1:4 | - | - | - |
| routes/subscriptions.js | /api/subscriptions | 6 | 5 | 1 | 0 | - | - | - | - |

Totals: 183 endpoints, 177 authenticated, 6 public, 90 requirePlan call sites in 26 files.

## 6. Public surface: endpoints with NO authenticateToken (7)

These are reachable without a JWT (subject only to the global `/api` rate limiter and, for `/api/auth`, the auth limiter). Any that read `req.user` are flagged REQ_USER_WITHOUT_AUTH.

| # | Method | Path | Source | Notes |
| --- | --- | --- | --- | --- |
| 1 | POST | /api/auth/signup | routes/auth.js:49 |  |
| 2 | POST | /api/auth/login | routes/auth.js:91 |  |
| 3 | POST | /api/auth/refresh | routes/auth.js:128 |  |
| 4 | POST | /api/auth/logout | routes/auth.js:153 |  |
| 5 | GET | /api/subscriptions/plans | routes/subscriptions.js:8 |  |
| 6 | GET | /api/learning/resources | routes/learning.js:182 |  |
| 7 | GET | /api/health | app.js:159 |  |

Files that mix public and authenticated endpoints (worth a human glance for accidental omissions): routes/auth.js (4 public / 4 authenticated); routes/learning.js (1 public / 2 authenticated); routes/subscriptions.js (1 public / 5 authenticated).

## 7. Oddities

### Duplicate route registrations (same method + path)

None.

### Routes shadowed by an earlier :param route

None.

### Catch-alls and routes registered after them

- [INFO] path-less inline app.use() at backend/src/ssr/setupFrontend.js:81 (registered via setupFrontend() in backend/src/ssr/setupFrontend.js): 0 route(s) registered after it

### Prefixes shared by several route files / nested prefixes

- /api/resume is shared by 2 route files (mount orders 4, 5): backend/src/routes/resume.js, backend/src/routes/resumeV2.js
- /api/jobs is shared by 5 route files (mount orders 14, 17, 18, 23, 24): backend/src/routes/jobTracker.js, backend/src/routes/jobAnalyzer.js, backend/src/routes/coverLetter.js, backend/src/routes/jobDiscovery.js, backend/src/routes/jobFit.js
- /api/ats is shared by 2 route files (mount orders 15, 16): backend/src/routes/atsExport.js, backend/src/routes/atsCheckerV2.js
- /api/jobs/achievement-enhancer (backend/src/routes/achievementEnhancer.js) is mounted after, and inside the namespace of, /api/jobs; earlier /api/jobs routes with params/wildcards are checked for shadowing

### Opaque registrations (not fully resolvable statically)

- [INFO] backend/src/app.js:174 passes the app object to setupFrontend(); its app.use()/route registrations were expanded and are marked conditional (via)

### Guard middleware that protects nothing

- backend/src/middleware/requireOnboarding.js exports guard "requireOnboarding" but no route file or app.js applies it (it protects nothing)

### Endpoint-level flags

- [INFO] 6 endpoint(s) flagged ALIASED_GUARD: POST /api/resume/v2/analyze [auth->authenticateToken]; POST /api/resume/v2/feedback [auth->authenticateToken]; POST /api/resume/v2/export [auth->authenticateToken]; GET /api/resume/v2/history [auth->authenticateToken]; GET /api/resume/v2/:resumeId [auth->authenticateToken]; POST /api/ats/v2/parse [auth->authenticateToken]
- [INFO] 17 endpoint(s) flagged LOCAL_GUARD_DEFINITION: GET /api/admin/stats [requireAdmin]; GET /api/admin/users [requireAdmin]; GET /api/admin/audit-logs [requireAdmin]; PUT /api/admin/users/:id/role [requireAdmin]; GET /api/benchmarks/run [requireAdmin]; GET /api/admin-panels/university/overview [requireRole]; GET /api/admin-panels/university/students [requireRole]; GET /api/admin-panels/university/departments [requireRole]; GET /api/admin-panels/faculty/courses [requireRole]; GET /api/admin-panels/faculty/assignments [requireRole]; POST /api/admin-panels/faculty/assignments [requireRole]; GET /api/admin-panels/faculty/students [requireRole]; ... (+5)

### Endpoints whose middleware chain could not be fully resolved statically

None.

## 8. Plan-gated endpoints (minTier)

| Method | Path | minTier | Guards | Source |
| --- | --- | --- | --- | --- |
| GET | /api/skills/questions | 1 | authenticateToken > requirePlan(1) | routes/skills.js:160 |
| POST | /api/skills/assessment | 1 | authenticateToken > requirePlan(1) | routes/skills.js:173 |
| GET | /api/skills/history | 1 | authenticateToken > requirePlan(1) | routes/skills.js:258 |
| POST | /api/resume/v2/analyze | 2 | authenticateToken > requirePlan(2) | routes/resumeV2.js:41 |
| POST | /api/resume/v2/feedback | 2 | authenticateToken > requirePlan(2) | routes/resumeV2.js:133 |
| POST | /api/resume/v2/export | 2 | authenticateToken > requirePlan(2) | routes/resumeV2.js:172 |
| GET | /api/projects/ideas | 1 | authenticateToken > requirePlan(1) | routes/projects.js:6 |
| POST | /api/profiles/github/analyze | 2 | authenticateToken > requirePlan(2) | routes/profiles.js:551 |
| POST | /api/profiles/github/generate-repo-readme | 2 | authenticateToken > requirePlan(2) | routes/profiles.js:626 |
| POST | /api/profiles/github/optimize-bio | 2 | authenticateToken > requirePlan(2) | routes/profiles.js:747 |
| POST | /api/profiles/github/save | 2 | authenticateToken > requirePlan(2) | routes/profiles.js:804 |
| POST | /api/profiles/linkedin/analyze | 2 | authenticateToken > requirePlan(2) | routes/profiles.js:840 |
| POST | /api/profiles/linkedin/generate-headline | 2 | authenticateToken > requirePlan(2) | routes/profiles.js:899 |
| POST | /api/profiles/linkedin/generate-about | 2 | authenticateToken > requirePlan(2) | routes/profiles.js:913 |
| POST | /api/profiles/linkedin/generate-experience | 2 | authenticateToken > requirePlan(2) | routes/profiles.js:927 |
| POST | /api/learning/generate-roadmap | 1 | authenticateToken > requirePlan(1) | routes/learning.js:118 |
| GET | /api/learning/roadmaps | 1 | authenticateToken > requirePlan(1) | routes/learning.js:164 |
| POST | /api/interview/start | 3 | authenticateToken > requirePlan(3) | routes/interview.js:122 |
| POST | /api/career/roadmap | 1 | authenticateToken > requirePlan(1) | routes/careerRoadmap.js:11 |
| GET | /api/career/roadmap/:id | 1 | authenticateToken > requirePlan(1) | routes/careerRoadmap.js:107 |
| GET | /api/career/roadmap | 1 | authenticateToken > requirePlan(1) | routes/careerRoadmap.js:188 |
| POST | /api/jobs | 3 | authenticateToken > requirePlan(3) | routes/jobTracker.js:47 |
| POST | /api/ats/v2/parse | 2 | authenticateToken > requirePlan(2) | routes/atsCheckerV2.js:31 |
| POST | /api/jobs/analyze-description | 3 | authenticateToken > requirePlan(3) | routes/jobAnalyzer.js:49 |
| POST | /api/jobs/generate-cover-letter | 2 | authenticateToken > requirePlan(2) | routes/coverLetter.js:28 |
| GET | /api/evidence/report | 3 | authenticateToken > requirePlan(3) | routes/evidence.js:18 |
| GET | /api/jobs/discover | 2 | authenticateToken > requirePlan(2) | routes/jobDiscovery.js:51 |
| POST | /api/jobs/fit | 3 | authenticateToken > requirePlan(3) | routes/jobFit.js:17 |
| POST | /api/recruiter-visibility/analyze | 2 | authenticateToken > requirePlan(2) | routes/recruiterVisibility.js:25 |
| POST | /api/resume-consistency/check | 2 | authenticateToken > requirePlan(2) | routes/resumeConsistency.js:19 |
| POST | /api/jobs/achievement-enhancer/enhance | 2 | authenticateToken > requirePlan(2) | routes/achievementEnhancer.js:82 |
| GET | /api/ai-tutor/topics | 1 | authenticateToken > requirePlan(1) | routes/aiTutor.js:201 |
| POST | /api/ai-tutor/chat | 1 | authenticateToken > requirePlan(1) | routes/aiTutor.js:206 |
| POST | /api/ai-tutor/doubt | 1 | authenticateToken > requirePlan(1) | routes/aiTutor.js:266 |
| POST | /api/project-builder/generate | 1 | authenticateToken > requirePlan(1) | routes/projectBuilder.js:314 |
| POST | /api/project-builder/readme | 1 | authenticateToken > requirePlan(1) | routes/projectBuilder.js:384 |
| POST | /api/project-builder/deployment | 1 | authenticateToken > requirePlan(1) | routes/projectBuilder.js:428 |
| GET | /api/project-builder/workspace | 1 | authenticateToken > requirePlan(1) | routes/projectBuilder.js:481 |
| POST | /api/project-builder/workspace | 1 | authenticateToken > requirePlan(1) | routes/projectBuilder.js:495 |
| PUT | /api/project-builder/workspace/:id | 1 | authenticateToken > requirePlan(1) | routes/projectBuilder.js:524 |
| GET | /api/project-builder/templates | 1 | authenticateToken > requirePlan(1) | routes/projectBuilder.js:570 |
| POST | /api/study-tools/notes/generate | 1 | authenticateToken > requirePlan(1) | routes/studyTools.js:113 |
| POST | /api/study-tools/flashcards/generate | 1 | authenticateToken > requirePlan(1) | routes/studyTools.js:184 |
| POST | /api/study-tools/quiz/generate | 1 | authenticateToken > requirePlan(1) | routes/studyTools.js:245 |
| POST | /api/study-tools/quiz/submit | 1 | authenticateToken > requirePlan(1) | routes/studyTools.js:294 |
| GET | /api/courses | 1 | authenticateToken > requirePlan(1) | routes/courses.js:380 |
| GET | /api/courses/progress | 1 | authenticateToken > requirePlan(1) | routes/courses.js:418 |
| GET | /api/courses/paths | 1 | authenticateToken > requirePlan(1) | routes/courses.js:470 |
| GET | /api/courses/paths/:id | 1 | authenticateToken > requirePlan(1) | routes/courses.js:516 |
| GET | /api/courses/:id | 1 | authenticateToken > requirePlan(1) | routes/courses.js:563 |
| POST | /api/courses/:id/enroll | 1 | authenticateToken > requirePlan(1) | routes/courses.js:595 |
| POST | /api/courses/:id/progress | 1 | authenticateToken > requirePlan(1) | routes/courses.js:617 |
| GET | /api/ai-coach/career-score | 3 | authenticateToken > requirePlan(3) | routes/aiCoach.js:322 |
| POST | /api/ai-coach/recommendations | 3 | authenticateToken > requirePlan(3) | routes/aiCoach.js:422 |
| POST | /api/ai-coach/skill-gap | 3 | authenticateToken > requirePlan(3) | routes/aiCoach.js:495 |
| POST | /api/ai-coach/career-plan | 3 | authenticateToken > requirePlan(3) | routes/aiCoach.js:566 |
| POST | /api/ai-coach/compare-roles | 3 | authenticateToken > requirePlan(3) | routes/aiCoach.js:631 |
| POST | /api/ai-coach/code-review | 2 | authenticateToken > requirePlan(2) | routes/aiCoach.js:691 |
| GET | /api/ai-coach/review-history | 2 | authenticateToken > requirePlan(2) | routes/aiCoach.js:793 |
| GET | /api/community/forums | 1 | authenticateToken > requirePlan(1) | routes/community.js:142 |
| GET | /api/community/forums/:category | 1 | authenticateToken > requirePlan(1) | routes/community.js:165 |
| GET | /api/community/forums/thread/:id | 1 | authenticateToken > requirePlan(1) | routes/community.js:193 |
| POST | /api/community/forums/thread | 1 | authenticateToken > requirePlan(1) | routes/community.js:220 |
| POST | /api/community/forums/thread/:id/reply | 1 | authenticateToken > requirePlan(1) | routes/community.js:247 |
| POST | /api/community/forums/thread/:id/vote | 1 | authenticateToken > requirePlan(1) | routes/community.js:273 |
| GET | /api/community/groups | 1 | authenticateToken > requirePlan(1) | routes/community.js:316 |
| POST | /api/community/groups | 1 | authenticateToken > requirePlan(1) | routes/community.js:330 |
| GET | /api/community/events | 1 | authenticateToken > requirePlan(1) | routes/community.js:357 |
| GET | /api/community/leaderboard | 1 | authenticateToken > requirePlan(1) | routes/community.js:377 |
| POST | /api/community/communication/practice | 2 | authenticateToken > requirePlan(2) | routes/community.js:496 |
| POST | /api/community/communication/email | 2 | authenticateToken > requirePlan(2) | routes/community.js:545 |
| GET | /api/practice/problems | 1 | authenticateToken > requirePlan(1) | routes/practice.js:666 |
| GET | /api/practice/problems/:id | 1 | authenticateToken > requirePlan(1) | routes/practice.js:758 |
| POST | /api/practice/problems/:id/run | 1 | authenticateToken > requirePlan(1) | routes/practice.js:801 |
| POST | /api/practice/problems/:id/submit | 1 | authenticateToken > requirePlan(1) | routes/practice.js:855 |
| POST | /api/practice/problems/:id/hint | 1 | authenticateToken > requirePlan(1) | routes/practice.js:923 |
| GET | /api/practice/assessments | 1 | authenticateToken > requirePlan(1) | routes/practice.js:966 |
| GET | /api/practice/assessments/:id | 1 | authenticateToken > requirePlan(1) | routes/practice.js:1009 |
| POST | /api/practice/assessments/:id/submit | 1 | authenticateToken > requirePlan(1) | routes/practice.js:1045 |
| GET | /api/practice/stats | 1 | authenticateToken > requirePlan(1) | routes/practice.js:1114 |
| POST | /api/practice/problems/:id/bookmark | 1 | authenticateToken > requirePlan(1) | routes/practice.js:1210 |
| GET | /api/study-history/history | 1 | authenticateToken > requirePlan(1) | routes/studyHistory.js:11 |
| GET | /api/study-history/stats | 1 | authenticateToken > requirePlan(1) | routes/studyHistory.js:26 |
| GET | /api/study-history/weekly | 1 | authenticateToken > requirePlan(1) | routes/studyHistory.js:36 |
| POST | /api/study-history/srs/decks | 1 | authenticateToken > requirePlan(1) | routes/studyHistory.js:48 |
| GET | /api/study-history/srs/decks | 1 | authenticateToken > requirePlan(1) | routes/studyHistory.js:62 |
| GET | /api/study-history/srs/due | 1 | authenticateToken > requirePlan(1) | routes/studyHistory.js:72 |
| POST | /api/study-history/srs/review | 1 | authenticateToken > requirePlan(1) | routes/studyHistory.js:83 |
| POST | /api/learning-modules/module-assessment | 3 | authenticateToken > requirePlan(3) | routes/learningModules.js:137 |
| POST | /api/learning-modules/module-assessment/submit | 3 | authenticateToken > requirePlan(3) | routes/learningModules.js:277 |

