# Archive — Historical / Planning Docs

These are the project's original planning, design, and architecture docs. They are **not guaranteed to match current code** — several describe features that were planned but never built, or built differently than described (see [../README.md](../README.md#cross-module-findings-from-code-not-speculation) for specific known mismatches, e.g. the ATS Checker/Resume Analyzer "LLM critic stage" docs below describe a pipeline that doesn't exist; the real one is rule-based).

**For accurate, code-grounded documentation, use [docs/modules/](../modules/) instead.** Keep these for historical context (why a decision was made, what the original scope was) — not as a source of truth for current behavior.

| File | Original purpose |
|---|---|
| [00_START_HERE.md](00_START_HERE.md) | Original onboarding/orientation doc |
| [ABOUT_PROJECT.md](ABOUT_PROJECT.md) | Project pitch/overview |
| [API_DOCUMENTATION.md](API_DOCUMENTATION.md) | Earlier hand-written API reference (superseded by per-module API tables in `docs/modules/`) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Earlier system architecture writeup |
| [ATS_CHECKER_V2_IMPLEMENTATION.md](ATS_CHECKER_V2_IMPLEMENTATION.md) | ATS Checker V2 design doc — describes an LLM-based critic stage not present in the actual (rule-based) implementation |
| [ATS_CHECKER_V2_UX_GUIDE.md](ATS_CHECKER_V2_UX_GUIDE.md) | ATS Checker V2 UX spec — claims "no paywall," but live routes require a paid plan tier |
| [CONTEXT.md](CONTEXT.md) | Project context/background notes |
| [DESIGN.md](DESIGN.md) | Early design notes |
| [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md) | Index of the docs below (superseded by `docs/README.md`) |
| [FEATURES_DETAILED.md](FEATURES_DETAILED.md) | Detailed feature spec/description |
| [GITHUB_README_GENERATOR_PLAN.md](GITHUB_README_GENERATOR_PLAN.md) | Plan for the GitHub README generator feature (part of Module 09) |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | Implementation notes |
| [IMPLEMENTATION_QUICK_START.md](IMPLEMENTATION_QUICK_START.md) | Earlier setup/quick-start guide (superseded by `docs/SETUP.md`) |
| [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) | Implementation summary |
| [PROJECT_ARCHITECTURE_GUIDE.md](PROJECT_ARCHITECTURE_GUIDE.md) | Comprehensive architecture guide |
| [RESUME_ANALYZER_V2_IMPLEMENTATION.md](RESUME_ANALYZER_V2_IMPLEMENTATION.md) | Resume Analyzer V2 design doc — same LLM-critic-stage caveat as the ATS Checker doc above |
| [ROADMAP.md](ROADMAP.md) | Product roadmap |
| [SUBSCRIPTION_ONBOARDING_PLAN.md](SUBSCRIPTION_ONBOARDING_PLAN.md) | Original plan for the subscription/onboarding flow (see [01-auth-onboarding](../modules/01-auth-onboarding.md) for what was actually built) |
| [SUPABASE_SETUP.md](SUPABASE_SETUP.md) | Original Supabase database setup walkthrough — still broadly useful, referenced from `docs/SETUP.md` |
| [TECH_STACK_VISUAL_GUIDE.md](TECH_STACK_VISUAL_GUIDE.md) | Tech stack visual reference |
| [TIER1_AI_FEATURES_PLAN.md](TIER1_AI_FEATURES_PLAN.md) | Plan for tier-1 AI features |
| [UX_IMPROVEMENTS.md](UX_IMPROVEMENTS.md) | UX improvement proposals |
