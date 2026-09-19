# Writing CSS — Cheat Sheet

## Quick comparison

| Approach | Type | Scoping mechanism | Written where | Build step? |
|---|---|---|---|---|
| Tailwind CSS | Utility-first framework | N/A (atomic classes) | HTML/JSX `className` | Yes (scans + generates) |
| BEM | Naming convention | Manual, via naming discipline | `.css` files | No |
| Sass | Preprocessor language | N/A (still global CSS) | `.scss` files | Yes (compiles to CSS) |
| PostCSS | Plugin pipeline | N/A | Plugin config | Yes |
| CSS Modules | Build-time scoping | Auto-hashed class names | `.module.css` | Yes |
| Styled Components / CSS-in-JS | Runtime or build-time scoping | Auto-generated class names | Inside `.jsx`/`.tsx` | Yes (often runtime too) |

---

## Tailwind CSS

**Core idea**: compose UI from small, single-purpose utility classes instead of authoring custom CSS.

```html
<div class="flex items-center gap-2 bg-white p-4 rounded-lg shadow-md">
  <img class="w-10 h-10 rounded-full" src="a.jpg" />
  <span class="font-semibold text-gray-800">Jane Doe</span>
</div>
```

**Mechanism**: build-time scanner reads source files → matches literal class-name strings → emits only used utilities into final CSS.

| Config | Purpose |
|---|---|
| `content` (v3) / auto-detect (v4) | Which files to scan for class names |
| `theme.extend` | Add/override design tokens |
| `@apply` | Compose utilities into a custom class |
| `!util` | Force `!important` |

**Gotchas**:
- Dynamic class strings (`` `text-${color}-500` ``) are invisible to the static scanner — write full literal names.
- Missing file in `content` glob → classes silently dropped in prod build only.
- Autoprefixer/PostCSS plugin order matters; Tailwind plugin should run before Autoprefixer.

---

## BEM (Block Element Modifier)

```
.block { }
.block__element { }
.block--modifier { }
.block__element--modifier { }
```

```html
<div class="card card--featured">
  <h2 class="card__title card__title--large">Title</h2>
</div>
```

| Rule | Detail |
|---|---|
| Block | Standalone reusable component |
| Element | `block__element`, only meaningful inside block, never nested (`block__el__el` is wrong) |
| Modifier | `block--mod` or `block__el--mod`, always paired with the base class |

Pure convention — no tooling enforces it; consistency is the whole value proposition.

---

## Sass

| Feature | Syntax | Compiles to |
|---|---|---|
| Variables | `$color: blue;` | Literal value inlined |
| Nesting | `.a { .b { } }` | `.a .b { }` |
| Parent ref | `&:hover` | `.a:hover` |
| Mixin | `@mixin x { } / @include x;` | Inlined block |
| Modern import | `@use 'file' as f;` | Namespaced, single-load |
| Legacy import (avoid) | `@import 'file';` | Global namespace, deprecated |

```scss
@use 'vars' as v;
.btn {
  color: v.$primary;
  &:hover { color: darken(v.$primary, 10%); }
}
```

Key fact: Sass variables resolve at **compile time** (not runtime-changeable); CSS custom properties (`--x`) resolve at **runtime**.

---

## PostCSS

Plugin pipeline that transforms CSS. Tailwind itself is a PostCSS plugin.

```js
// postcss.config.js
module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

| Plugin | Job |
|---|---|
| Autoprefixer | Adds vendor prefixes based on `browserslist` |
| postcss-preset-env | Lets you use future CSS syntax today |
| tailwindcss | Generates utility CSS |

Requires `browserslist` config (package.json or `.browserslistrc`) for Autoprefixer to target the right browsers.

---

## CSS Modules / CSS-in-JS / Styled Components

```jsx
// CSS Modules
import s from './Card.module.css';
<div className={s.title} />   // → Card_title__a3F2x (auto-scoped)
```

```jsx
// Styled Components
const Title = styled.h2`color: blue;`;
```

| Aspect | CSS Modules | Styled Components / CSS-in-JS |
|---|---|---|
| Scoping | Build-time class hashing | Runtime (or build-time w/ Babel plugin) generated classes |
| Perf cost | None extra | Runtime style injection cost on large pages |
| Escape hatch | `:global()` | Plain `<style>` / theme objects |
| Modern alt | — | Zero-runtime: vanilla-extract, Panda CSS |

---

## Likely interview questions

**Q: How does Tailwind keep bundle size small?**
A: Build-time content scanning — it only emits CSS for utility classes actually found as literal strings in source files.

**Q: Why can't you build Tailwind class names dynamically with template strings?**
A: The scanner does static text matching, not JS evaluation; it can't resolve runtime variables, so unmatched classes never get generated.

**Q: What problem does BEM solve?**
A: Global CSS namespace collisions — encodes component/element/variant directly into the class name so nothing accidentally overrides another block's styles.

**Q: `@use` vs `@import` in Sass?**
A: `@import` is deprecated, pollutes a global namespace, and can double-include partials. `@use` namespaces imports and loads each file once.

**Q: What does PostCSS actually do?**
A: Runs CSS through a configurable pipeline of plugins (e.g. Autoprefixer, Tailwind) that each transform the CSS — it's a transformation engine, not a CSS language of its own.

**Q: Sass variable vs CSS custom property — key difference?**
A: Sass `$var` resolves at compile time and is gone from output; CSS `--var` exists in the browser at runtime and can change dynamically (e.g. theming, media queries, JS).

**Q: Downside of runtime CSS-in-JS (e.g. classic Styled Components)?**
A: Style computation/injection happens in the browser at render time, adding runtime overhead — mitigated by zero-runtime alternatives or build-time extraction.

---

**Where this fits**: Pick a Framework → **Writing CSS** → Build Tools → Testing → Authentication Strategies.
