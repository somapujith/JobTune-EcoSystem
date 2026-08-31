# Build Tools — Cheat Sheet

## Why build tools exist

| Job | Solves |
|---|---|
| Bundling | Too many files/requests → combine into optimized output |
| Transpiling | New/special syntax (TS, JSX) → browser-compatible JS |
| Tree-shaking | Removes unused code (requires static ESM `import`/`export`, not CommonJS) |
| Dev server + HMR | Instant in-browser updates without full reload / state loss |

---

## Bundler comparison

| Tool | Language | Dev strategy | Prod strategy | Best for |
|---|---|---|---|---|
| Vite | JS/TS config; esbuild + Rollup internally | No bundling — native ESM served on demand | Delegates to Rollup | Default choice for new apps |
| Webpack | JS | Bundles up front, even in dev | Webpack itself | Large/legacy/highly custom apps |
| Rollup | JS | N/A (mainly a build/prod tool) | Rollup | Publishing libraries (clean, tree-shaken output) |
| Parcel | JS | Zero-config bundling | Zero-config bundling | Prototypes, minimal setup |
| esbuild | Go | Extremely fast transpile/bundle | Used as an engine inside other tools | Speed-critical internal tooling |

**SWC**: Rust-based transpiler (like Babel, but fast). Used inside Next.js etc. Not a bundler itself.

---

## Key gotchas (fast reference)

| Symptom | Cause | Fix |
|---|---|---|
| Vite: works in dev, breaks in `build` | Dev = esbuild, prod = Rollup (different engines) | Test `vite build && vite preview` before shipping |
| Vite: env var is `undefined` client-side | Missing `VITE_` prefix | Prefix with `VITE_` |
| Vite: stale dependency errors after `npm install` | Stale `node_modules/.vite` pre-bundle cache | Delete cache, restart dev server |
| Webpack: CSS not applied correctly | Loader order wrong | Loaders apply right-to-left/bottom-to-top; order accordingly |
| Tree-shaking not working | Code uses CommonJS `require` | Use ESM `import`/`export` |

---

## ESLint vs Prettier

| | ESLint | Prettier |
|---|---|---|
| Type | Linter | Formatter |
| Catches | Bugs, unused vars, undefined refs, code smells | Spacing, quotes, semicolons, line length |
| Auto-fixes everything | No (some rules only) | Yes (its whole job) |
| Conflict fix | Install `eslint-config-prettier` (disables clashing style rules) | Run as separate step, not via `eslint-plugin-prettier` unless needed |

```json
// .eslintrc.json
{ "extends": ["eslint:recommended", "eslint-config-prettier"] }
```

```json
// .prettierrc
{ "semi": true, "singleQuote": true, "tabWidth": 2 }
```

CI enforcement:
```bash
eslint . --max-warnings=0
prettier --check .
```

---

## Likely interview questions

**Q: Why can't Webpack tree-shake CommonJS as well as ESM?**
A: Tree-shaking relies on static analysis of `import`/`export`; `require()` is dynamic/runtime-resolved, so the bundler can't always prove what's unused.

**Q: How does Vite achieve near-instant dev server startup on large apps?**
A: It skips bundling in dev entirely, serving native ES modules on demand and transforming only requested files via esbuild, instead of building the full dependency graph upfront like Webpack.

**Q: Why does Vite use esbuild in dev but Rollup for production builds?**
A: esbuild is extremely fast for transforms/pre-bundling but has less mature production code-splitting/plugin ecosystem; Rollup produces more optimized, plugin-extensible production bundles. Trade-off: speed in dev, robustness in prod.

**Q: What's the difference between ESLint and Prettier, precisely?**
A: ESLint analyzes code semantics/quality (bugs, unused vars); Prettier only rewrites formatting/whitespace. They can overlap on stylistic rules, which is why `eslint-config-prettier` is used to disable ESLint's stylistic rules and avoid conflicts.

**Q: When would you choose Rollup over Webpack?**
A: Publishing a library/package — Rollup produces leaner, more tree-shaken output well-suited to being consumed by other bundlers, versus Webpack's app-oriented runtime overhead.

**Q: What is SWC and why did tools like Next.js adopt it?**
A: A Rust-based JS/TS/JSX compiler, functionally similar to Babel but much faster due to being compiled/native rather than JS-based — adopted for build speed.

**Q: Env variables not showing up in Vite client code — likely cause?**
A: Missing the required `VITE_` prefix; only prefixed vars are exposed to client bundles (deliberate security boundary).

---

**Where this fits**: Pick a Framework → Writing CSS → **Build Tools** → Testing → Authentication Strategies.
