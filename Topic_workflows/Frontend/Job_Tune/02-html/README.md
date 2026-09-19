# HTML — Job Tune Cheat Sheet

Dense recall reference. No hand-holding.

## Document Skeleton

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>...</title>
</head>
<body>...</body>
</html>
```

## Display Defaults

| Type | Width | Line break | Examples |
|---|---|---|---|
| Block | Fills parent | Yes | `div`, `p`, `h1-h6`, `section`, `ul`, `li` |
| Inline | Content-sized | No | `span`, `a`, `strong`, `em` |
| Inline-block | Content-sized, respects box model | No | `img`, `input`, `button` |

Void elements (no closing tag, no children): `img`, `br`, `hr`, `input`, `meta`, `link`.

## Semantic Tags Quick Reference

| Tag | Use when |
|---|---|
| `header` | Intro content for page/section |
| `nav` | Navigation links |
| `main` | Unique main content — one per page, never nested in header/footer/nav/aside |
| `article` | Self-contained, syndicatable content (test: "could this stand alone in an RSS feed?") |
| `section` | Thematic grouping *with a heading* — not a styling wrapper (use `div` for that) |
| `aside` | Tangential content (sidebar, pull quote) |
| `footer` | Footer/copyright/contact |
| `figure`/`figcaption` | Image/diagram + caption |

**article vs section test:** stands alone → article. Only makes sense in page context → section.

## Forms

```html
<form action="/submit" method="POST" novalidate>
  <label for="email">Email</label>
  <input id="email" name="email" type="email" required minlength="5" pattern="...">
  <button type="submit">Go</button>
  <button type="button" onclick="x()">Non-submit action</button>
</form>
```

- `name` (not `id`) is the key sent in submission — missing `name` = silently absent from payload.
- `<button>` inside `<form>` defaults to `type="submit"` — must explicitly set `type="button"` to avoid unwanted submission.
- `novalidate` disables native browser validation UI.
- Client-side validation (`required`, `pattern`, `min`/`max`) = UX only, never a security boundary. Always re-validate server-side.

**Input types:** `text`, `email`, `password`, `number`, `checkbox`, `radio`, `date`, `file`, `tel`, `url`, `search`, `color`, `range`.

**Validation attrs:** `required`, `minlength`/`maxlength`, `min`/`max`, `pattern`, `step`.

**CSS hooks:** `:valid`, `:invalid`, `:user-invalid` (only after interaction — avoids red-on-load), `:required`, `:optional`, `:placeholder-shown`.

## Accessibility

| Concept | Rule |
|---|---|
| `alt` | Descriptive for meaningful images; `alt=""` (empty, present) for decorative |
| Keyboard access | Use native `button`/`a`; a `div onclick` isn't focusable or Enter/Space-activatable |
| Focus order | Follows DOM order, NOT CSS visual order (flex/grid `order`, `row-reverse`) |
| `tabindex="0"` | Adds non-focusable el to tab order |
| `tabindex="-1"` | Removes from tab order but allows `.focus()` (modals, skip links) |
| `tabindex="1+"` | Anti-pattern — overrides natural order |
| `aria-hidden="true"` | Hides from AT only, still visible/in layout |
| `display:none` | Hidden from everyone, removed from a11y tree |
| `visibility:hidden` | Invisible, still occupies layout space |
| `aria-live="polite"/"assertive"` | Announces dynamic content changes to screen readers |
| ARIA golden rule | "No ARIA is better than bad ARIA" — prefer native elements |

## SEO

| Tag | Purpose |
|---|---|
| `<title>` | Search result headline, ~60 char budget |
| `<meta name="description">` | Search snippet, doesn't affect ranking directly but affects CTR |
| `<link rel="canonical">` | Declares the authoritative URL among duplicates |
| `<meta name="robots" content="noindex">` | Page-level "don't index" — requires crawler to actually visit the page |
| `robots.txt` | Site-wide crawl directives — blocking here can prevent the crawler from ever seeing `noindex` |
| `og:*` properties | Social share preview (Open Graph) |
| JSON-LD (`schema.org`) | Structured data for rich search results |
| `width`/`height` on `img` | Prevents layout shift (CLS, Core Web Vitals) |
| `loading="lazy"` | Defers off-screen image loading |

**Gotcha:** `robots.txt` block + `noindex` together can fail — crawler never reaches the page to read the noindex tag.

## Likely Interview Questions

**Q: `<section>` vs `<div>`?**
A: `section` = thematic grouping, typically with a heading, semantically meaningful. `div` = generic, no semantic meaning, purely structural/styling.

**Q: `article` vs `section`?**
A: `article` is self-contained and independently distributable (blog post, news item). `section` groups related content within a larger context and doesn't stand alone.

**Q: Why does `id="x"` alone not get submitted with a form?**
A: Form submission uses the `name` attribute as the key, not `id`. `id` is for CSS/JS/label targeting.

**Q: What's the difference between `aria-hidden`, `display:none`, and `visibility:hidden`?**
A: `aria-hidden` hides from assistive tech only (still visible/in layout). `display:none` removes from layout and the accessibility tree entirely. `visibility:hidden` hides visually but preserves layout space; screen reader behavior varies but it's generally excluded from the a11y tree too.

**Q: Why is client-side HTML5 validation not sufficient for security?**
A: It's fully bypassable (disabled JS, direct API calls via curl/Postman) — server must always independently validate and sanitize input.

**Q: Why does visual reordering via CSS break accessibility if not careful?**
A: Keyboard tab order follows DOM source order, not CSS visual order (`order`, `flex-direction: row-reverse`, grid areas) — creates a mismatch between what's seen and what's focused.

**Q: What does `<link rel="canonical">` solve?**
A: Prevents duplicate-content SEO penalties by declaring the authoritative URL when the same content is reachable via multiple URLs.

**Q: `tabindex` values and their meaning?**
A: `0` = adds to natural tab order; `-1` = removes from tab order, focusable only via JS; positive values = anti-pattern, manually overrides order.

---

**Where this fits:** Second topic in the Frontend roadmap (Internet → HTML → CSS → JavaScript → Version Control → ...).
