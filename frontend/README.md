# Frontend — JobTube Eco System

React + Vite SPA with SSR support. Entry points: [src/entry-client.jsx](src/entry-client.jsx) (browser hydration) and [src/entry-server.jsx](src/entry-server.jsx) (SSR render), both mounting [src/App.jsx](src/App.jsx).

For setup/env vars/running, see [../docs/SETUP.md](../docs/SETUP.md). For what each page/feature actually does end-to-end (including which backend routes it calls), see [../docs/modules/](../docs/modules/) — this file is a map of the frontend folder only.

## Structure

```
src/
  App.jsx              Route definitions
  entry-client.jsx      Browser hydration entry
  entry-server.jsx      SSR render entry (used by ../server/preview.mjs and the backend's ssr/setupFrontend.js)
  main.jsx               Vite dev-only entry
  pages/                 One component per route — see table below for module mapping
  components/            Shared/reusable UI: Layout, PlanGate, modals, skeleton loaders, etc.
  store/                 Zustand stores
    useAuthStore.js        Auth state, axios instance + interceptors, token refresh, single-device handling
    useSubscriptionStore.js Plans, recommendation, orders, hasAccess() tier check
    ssrReset.js             Resets store state between SSR requests (avoids cross-request state leakage)
  lib/
    auth-client.js         Second, unused auth wrapper — see Notes/Gotchas below
    browser.js              safeLocalStorage-style guards for SSR-safe browser API access
  config/
    planDetails.js           Plan tier metadata (pricing, features)
    toolAccess.js             Maps tool/page → required plan tier (used by PlanGate)
    renderStrategy.js          Per-route SSR vs CSR strategy config
  hooks/
    useDarkMode.js
    useUserProgress.js
server/preview.mjs      Node server for previewing the SSR build locally (npm run preview:ssr)
api/ssr.js               SSR handler entry, likely for a serverless/Vercel deployment target
e2e/                     Playwright(?) E2E test directory — currently empty, no suite wired up yet
```

## Pages → module doc

| Pages | Module doc |
|---|---|
| `Login.jsx`, `Onboarding.jsx`, `PreparationOnboarding.jsx`, `PlanSettings.jsx`, `PaymentConfirm.jsx` | [01-auth-onboarding](../docs/modules/01-auth-onboarding.md) |
| `ResumeOptimizer.jsx` (real), `ResumeBuilder.jsx`/`ResumeHistory.jsx`/`ResumeSend.jsx` (stubs), `ResumeComparison.jsx` | [02-resume-builder](../docs/modules/02-resume-builder.md) |
| `ATSCheckerV2.jsx` | [03-ats-checker](../docs/modules/03-ats-checker.md) |
| `JobDiscovery.jsx`, `JobTracker.jsx`, `JobFitAnalysis.jsx`, `JobAnalyzer.jsx`, `JobMatcher.jsx` | [04-job-discovery-tracker](../docs/modules/04-job-discovery-tracker.md) |
| `MockInterview.jsx`, `JobPreparation.jsx` | [05-interview-prep](../docs/modules/05-interview-prep.md) |
| `LearningPathSubjects.jsx`, `LearningPathTier.jsx`, `LearningPathTopic.jsx`, `ZeroToHeroTrack.jsx`, `LearnAndBuildTrack.jsx`, `TuneAndPolishTrack.jsx` | [06-learning-path](../docs/modules/06-learning-path.md) |
| `CareerRoadmap.jsx`, `SkillAssessment.jsx`, `ProjectIdeas.jsx` | [07-career-roadmap-skills](../docs/modules/07-career-roadmap-skills.md) |
| `EvidenceDashboard.jsx`, `RecruiterVisibility.jsx` | [08-profile-evidence-recruiter](../docs/modules/08-profile-evidence-recruiter.md) |
| `CoverLetterGenerator.jsx`, `AchievementEnhancer.jsx`, `ResumeConsistency.jsx`, `GitHubOptimizer.jsx`, `LinkedInOptimizer.jsx`, `PortfolioBuilder.jsx` (stub), `ContentVault.jsx` | [09-content-generation](../docs/modules/09-content-generation.md) |
| `Dashboard.jsx`, `Home.jsx`, `Blog.jsx`, `ComingSoon.jsx` | [10-dashboard-admin-platform](../docs/modules/10-dashboard-admin-platform.md) |

## Scripts

```bash
npm run dev          # vite dev server
npm run build         # build:client + build:server (SSR bundle)
npm run build:client   # client-only build → dist/client
npm run build:server   # SSR build → dist/server
npm run preview        # preview client build
npm run preview:ssr    # preview via SSR (server/preview.mjs)
npm run lint            # eslint, zero warnings allowed
```

## Notes / Gotchas

- **No test suite wired up.** `e2e/` exists but is empty — verify changes manually in the browser (golden path + edge cases) rather than relying on automated coverage.
- **`lib/auth-client.js` is dead code** — a second, parallel auth API wrapper not imported anywhere in `src/`. The real auth logic lives entirely in `store/useAuthStore.js`. See [01-auth-onboarding notes](../docs/modules/01-auth-onboarding.md).
- **Several "pages" are static placeholders with no backend behind them**: `PortfolioBuilder.jsx`, `ResumeBuilder.jsx`, `ResumeHistory.jsx`, `ResumeSend.jsx`. Don't assume a page existing means the feature is live — check the module doc.
- **SSR is real, not incidental** — `entry-server.jsx` + `ssrReset.js` + `renderStrategy.js` mean state must stay request-scoped; be careful introducing module-level mutable state in stores or components, it will leak across SSR requests.
