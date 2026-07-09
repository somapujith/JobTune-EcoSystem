# Onboarding Gate: Signup → Survey → Dashboard

## Problem

Today, signup redirects to `/onboarding` — a legacy questionnaire+plan-selection
page that duplicates the newer Survey → CareerDiscovery → CareerPreview →
SubscriptionGate chain. Neither flow actually gates the dashboard:

- `/dashboard`'s `ProtectedRoute` accepts a `requireOnboarding` prop but it's
  never passed `true` anywhere (`App.jsx:169`) — dead code. Any authenticated
  user reaches `/dashboard` regardless of survey/plan status.
- `/survey`, `/career-discovery`, `/career-preview`, `/subscription-gate` are
  unguarded top-level routes, reachable by direct URL even logged out.
- No backend route checks onboarding state except the individual `requirePlan`
  gates on specific tool routes — dashboard and most API routes are wide open
  to any authenticated user, incomplete or not.
- There is no persisted "onboarding complete" flag. The old `/onboarded`
  endpoint infers it by checking whether an `onboarding_responses` row or a
  `user_subscriptions` row exists — two joins on every check.
- `SubscriptionGate.jsx:15` calls `setOnboardingComplete(true)` on
  `useSubscriptionStore`, but that store never defines that action (only
  `useAuthStore` does) — this throws today. The "Unlock" button is broken and
  never persists anything server-side.

Goal: a new user must go signup → survey chain → dashboard, in that order,
with nothing else rendered client-side and nothing else served server-side
until the chain is complete.

## Design

### 1. Persisted flag

Add `onboarding_completed BOOLEAN NOT NULL DEFAULT false` to `users`
(migration in `backend/src/migrations/`). Set to `true` in one place: the
`POST /subscriptions/select-plan` handler, after `planService.assignPlan`
succeeds. This becomes the single source of truth, replacing the
`onboarding_responses`/`user_subscriptions` inference in the current
`GET /subscriptions/onboarded`.

### 2. Fix the broken unlock call

`SubscriptionGate.jsx`'s "Unlock My Career Plan" button currently fakes
completion client-side (`setOnboardingComplete` — undefined on that store,
throws) and never calls the plan API. There's also no `planId` available to
give it: `CareerDiscovery.jsx` never calls `POST /subscriptions/recommend`,
and `CareerPreview.jsx` doesn't forward `answers` anywhere (`location.state`
is read but unused — "In a real app we'd calculate from this"). Two changes,
both within existing endpoints (no backend API changes):

- `CareerPreview.jsx` forwards `answers` via route state when it navigates to
  `/subscription-gate` (same pattern it already receives from
  `CareerDiscovery.jsx:404`).
- `SubscriptionGate.jsx` calls `useSubscriptionStore.getRecommendation(...)`
  (already exists, POSTs `/subscriptions/recommend`, saves an
  `onboarding_responses` row) on mount to get a `recommendedPlan`, then on
  "Unlock" calls `selectPlan(recommendedPlan.id)` (already exists, POSTs
  `/subscriptions/select-plan`, sets `onboardingComplete` in both stores)
  instead of the undefined `setOnboardingComplete`. This is what actually
  persists `users.onboarding_completed`.

### 3. Backend middleware: `requireOnboarding`

New file `backend/src/middleware/requireOnboarding.js`, same shape as the
existing `requirePlan.js`:

```
async (req, res, next) => {
  const { rows } = await db.query('SELECT onboarding_completed FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]?.onboarding_completed) {
    return res.status(403).json({ error: 'Complete onboarding first', code: 'ONBOARDING_REQUIRED' });
  }
  next();
}
```

Runs after `authenticateToken`. One indexed lookup, only on routes that need
it — not global — so auth and survey-chain routes never pay the query.

Apply to every route currently reachable by an authenticated user that isn't
part of auth or the survey chain itself: dashboard-data routes, skills,
resume, interview, cover-letter, projects, career-roadmap, progress,
`/subscriptions/my-plan`, `/subscriptions/select-plan` (POST is the
completion trigger itself, so it's exempt — see note below), dashboard
settings. Left ungated: `/auth/*`, `/subscriptions/plans`,
`/subscriptions/recommend`, `/subscriptions/select-plan`, `/subscriptions/onboarded`
(kept temporarily for backward compat, now backed by the new column).

### 4. Frontend gate

Replace the dead `requireOnboarding` prop pattern in `App.jsx`'s
`ProtectedRoute`/`ProtectedToolRoute` with one check, always on: after auth
resolves, if `!onboardingComplete`, redirect to `/survey` (not `/onboarding`).
Reuse the existing `onboardingChecked`/`checkOnboarded()` flow already in
`useSubscriptionStore` (called once on app load, same place `checkAuth` runs)
— no new fetch machinery needed, just remove the opt-in prop and make it
unconditional for all routes under `Layout`.

`/survey`, `/career-discovery`, `/career-preview`, `/subscription-gate`
become reachable only when authenticated AND `!onboardingComplete` — wrap
them in a small `SurveyRoute` guard: redirect to `/login` if not
authenticated, redirect to `/dashboard` if already `onboardingComplete` (so a
returning user can't re-run the survey and land on a stale plan-selection
screen).

### 5. Signup redirect

`Login.jsx:28-32` (`redirectAfterAuth`) changes its post-signup target from
`/onboarding` to `/survey`. Login (existing user) keeps going to `/dashboard`
or `/survey` depending on `onboardingComplete`, handled by the `SurveyRoute`/
`ProtectedRoute` guards above rather than a hardcoded branch at login time.

### 6. Delete the legacy flow

Remove `frontend/src/pages/Onboarding.jsx`, `frontend/src/components/OnboardingQuestionnaire.jsx`,
`frontend/src/components/PlanSelection.jsx`, and the `/onboarding` route in
`App.jsx:151`. Confirmed unused elsewhere (`OnboardingQuestionnaire` and
`PlanSelection` are only imported by `Onboarding.jsx`). Not related to
`PreparationOnboarding.jsx`/`JobPreparation.jsx`, which is a distinct
per-track in-dashboard feature keyed on a separate `prepOnboardingDone`
preference — left untouched.

## Data flow (happy path)

```
POST /auth/signup → users row created, onboarding_completed=false
  → frontend redirect /survey
/survey → /career-discovery → /career-preview (Q&A, POST /subscriptions/recommend
  saves onboarding_responses row, returns recommendation)
  → /subscription-gate, "Unlock" → POST /subscriptions/select-plan
    → assignPlan() writes user_subscriptions, sets users.onboarding_completed=true
  → frontend selectPlan() updates onboardingComplete in both stores
  → navigate /dashboard
ProtectedRoute sees onboardingComplete=true → renders dashboard
Every API call from dashboard now passes requireOnboarding middleware
```

## Error handling / edge cases

- User closes tab mid-survey: `onboarding_completed` stays `false`. Next
  login, `ProtectedRoute` redirects `/survey` again. Prior `onboarding_responses`
  row (if `/recommend` was reached) is overwritten on next attempt — acceptable,
  no partial-resume requirement was asked for.
- Direct URL hit to `/dashboard` or any gated API route while incomplete:
  frontend redirects to `/survey`; backend independently 403s with
  `ONBOARDING_REQUIRED` if the API is called directly (e.g. via curl) —
  defense in depth, matches the "nothing must be available" requirement.
  No global interceptor handling needed: like the existing `PLAN_UPGRADE_REQUIRED`
  (`requirePlan.js`), this code has no special-cased client handling today —
  routing already prevents a normal user from triggering it, so a stray 403
  just surfaces as a failed request on whatever page's local error handling
  catches it (same as any other API error).
- Returning completed user hits `/survey` directly: `SurveyRoute` redirects
  `/dashboard`.
- `/subscriptions/select-plan` called twice (retry): idempotent — `assignPlan`
  upserts, setting `onboarding_completed=true` again is a no-op.

## Testing

- Backend: `requireOnboarding.test.js` (mirrors existing `requirePlan.test.js`
  pattern in `backend/tests/`) — 403 when flag false, next() when true, 500
  handling on DB error.
- Backend: `subscriptions.routes.test.js` — `select-plan` sets
  `onboarding_completed=true`.
- Frontend: manual verification via dev server — signup → confirm landing on
  `/survey`, complete chain → confirm landing on `/dashboard`, attempt direct
  `/dashboard` nav mid-chain → confirm redirect back to `/survey`.

## Out of scope

- Resuming a partially-completed survey (saving progress mid-chain).
- Payment/checkout integration (`SubscriptionGate` "Unlock" already simulates
  this; real billing is a separate effort).
- Changing `PreparationOnboarding`/`JobPreparation` per-track onboarding.
