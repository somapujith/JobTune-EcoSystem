# Measuring & Improving Performance (Job Tune)

## Cheat sheet: PRPL

| Letter | Meaning | Key point |
|---|---|---|
| P | Push/Preload | Critical assets only — over-preloading competes with the real critical path |
| R | Render | Get first meaningful paint on screen ASAP |
| P | Pre-cache | Service Worker caches likely-next resources in background — don't cache everything eagerly |
| L | Lazy-load | Defer non-critical routes/assets — never lazy-load the LCP/above-fold element |

## Cheat sheet: RAIL time budgets

| Letter | Area | Budget | Why |
|---|---|---|---|
| R | Response | < 100ms | Perceived as "instant" by users |
| A | Animation | ~10ms/frame (of 16.6ms budget) | Needed to hit 60fps; rest goes to browser rendering |
| I | Idle | Work in < 50ms chunks | Anything longer blocks input; use `requestIdleCallback` |
| L | Load | < 5s on average mobile network | Time to interactive/usable |

## Cheat sheet: Core Web Vitals

| Metric | Measures | Good | Needs improvement | Poor |
|---|---|---|---|---|
| LCP | Largest Contentful Paint (loading) | ≤ 2.5s | ≤ 4s | > 4s |
| INP (replaced FID) | Interaction to Next Paint (responsiveness, worst interaction) | ≤ 200ms | ≤ 500ms | > 500ms |
| CLS | Cumulative Layout Shift (visual stability) | ≤ 0.1 | ≤ 0.25 | > 0.25 |

**Common causes:**
- LCP: render-blocking resources, CSR-only hero content (not in initial HTML), unoptimized images.
- INP: long tasks (>50ms), unthrottled input handlers, heavy third-party scripts.
- CLS: images/embeds without reserved dimensions, FOUT/FOIT web font swaps, `top`/`left` animations instead of `transform`.

## Tooling quick reference

| Tool | What it gives you |
|---|---|
| Lighthouse | Lab-based audit: 0-100 scores + actionable fixes (Performance/Accessibility/Best Practices/SEO) |
| PageSpeed Insights | Lighthouse + real-world field data (CrUX) |
| DevTools Network tab | Per-request waterfall: size, timing, order; throttle network here |
| DevTools Performance tab | Frame-by-frame recording: JS execution (yellow), layout (purple), paint (green); throttle CPU here |

## Likely interview questions

**Q: What does each letter in PRPL stand for and what's the point?**
A: Push/Preload critical resources, Render the initial route fast, Pre-cache likely-next resources via Service Worker, Lazy-load everything else — the goal is fastest possible first meaningful paint, with the rest loaded quietly afterward.

**Q: Why is the RAIL animation budget only ~10ms per frame when a 60fps frame has 16.6ms?**
A: The browser itself needs the remaining time for style recalculation, layout, and paint/composite — leaving only about 10ms of the 16.6ms frame budget for your own JS work.

**Q: What replaced First Input Delay (FID) as a Core Web Vital, and why?**
A: Interaction to Next Paint (INP). FID only measured the delay before the *first* interaction was processed; INP measures responsiveness across *all* interactions during a visit, capturing jank that FID missed entirely.

**Q: Why does a client-side-rendered SPA often score worse on LCP than an SSR/SSG site with identical visuals?**
A: In a CSR app, the LCP element (e.g., hero content) doesn't exist in the initial HTML — it only appears after JS loads, executes, and hydrates, pushing LCP later. SSR/SSG ship the content already in the HTML response.

**Q: Name three common causes of a bad CLS score.**
A: Images/iframes/ads without reserved width+height (or `aspect-ratio`), web fonts causing text reflow on swap (FOUT), and content (banners, ads) injected above existing content without reserved space.

**Q: Why should you animate `transform`/`opacity` instead of `top`/`left`?**
A: `transform`/`opacity` are handled by the compositor (GPU) without triggering layout/reflow; animating `top`/`left` forces layout recalculation on every frame, which is slower and can contribute to jank/CLS-adjacent issues.

**Q: Why shouldn't you trust a single Lighthouse run as ground truth?**
A: Lab results vary run to run (simulated throttling, machine load) and don't reflect real user diversity in devices/networks — cross-check with field data (CrUX/PageSpeed Insights real-user report) and take the median of multiple runs.

**Q: In the DevTools Performance tab, what do the yellow, purple, and green blocks represent?**
A: Yellow = JavaScript execution, purple = rendering/layout, green = painting. Long yellow blocks indicate long tasks blocking the main thread.

---

**Where this fits:** Final topic in the roadmap, following Browser APIs.
