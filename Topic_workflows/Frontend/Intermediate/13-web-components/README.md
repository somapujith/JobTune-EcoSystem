# Web Components — Intermediate Brush-Up

You know Custom Elements, `<template>`, and Shadow DOM exist. This covers the gotchas: lifecycle timing, styling encapsulation edge cases, and where the framework-agnostic pitch breaks down in practice.

## Custom Elements: timing gotchas

### `connectedCallback` can fire more than once

It fires every time the element is (re)inserted into the DOM — including when it's moved (e.g., via `appendChild` on an already-connected node, which detaches then reattaches). Don't assume it's a one-time "mount" hook the way `componentDidMount` implicitly is.

```javascript
class MyWidget extends HTMLElement {
  connectedCallback() {
    if (this._initialized) return; // guard against re-init on move
    this._initialized = true;
    this.render();
  }
}
```

### The constructor can't touch attributes or children yet

Custom Element spec restricts what you can do in the constructor — no reading attributes, no adding children. The element isn't guaranteed to be fully parsed at that point.

```javascript
class MyWidget extends HTMLElement {
  constructor() {
    super();
    // WRONG — attribute may not be set yet during upgrade
    // console.log(this.getAttribute('name'));
  }

  connectedCallback() {
    // CORRECT — safe to read attributes here
    console.log(this.getAttribute('name'));
  }
}
```

**Common mistake:** doing setup work in the constructor that depends on attributes or light-DOM children — this breaks specifically for elements that are "upgraded" (i.e., already present in HTML before `customElements.define` runs) since the constructor executes before attributes are guaranteed parsed.

### `attributeChangedCallback` requires explicit opt-in

Forgetting `static get observedAttributes()` is a common silent bug — attribute changes just don't trigger anything, with no error.

```javascript
class Counter extends HTMLElement {
  static get observedAttributes() { return ['count']; } // required, or callback never fires

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return; // guard: fires even on initial set from parsed HTML
    this.render(newVal);
  }
}
```

## HTML Templates: the "inert" nuance

Content inside `<template>` is parsed but **inert** — scripts don't execute, images don't fetch, custom elements inside don't upgrade — until cloned into the live document. This is frequently misunderstood: people expect `document.querySelector` from outside to find elements inside a template, but it won't, because template content lives in a separate `DocumentFragment` (`template.content`), not the main document tree.

```javascript
// Common mistake: querying the template's content from the main document
document.querySelector('.card-title'); // returns null if only inside <template>, not cloned yet

// Correct: query inside template.content, or after cloning
const clone = document.getElementById('card-template').content.cloneNode(true);
clone.querySelector('.card-title'); // works
```

## Shadow DOM: encapsulation edge cases

### `open` vs `closed` mode

```javascript
this.attachShadow({ mode: 'open' });   // this.shadowRoot accessible from outside
this.attachShadow({ mode: 'closed' }); // this.shadowRoot returns null externally
```

`closed` mode is rarely worth it — it breaks legitimate tooling (testing libraries, browser extensions, some analytics) without providing real security, since the content is still inspectable via devtools. Prefer `open` unless you have a specific, deliberate reason.

### Styles aren't fully sealed — CSS custom properties pierce the boundary

```css
/* Page-level CSS */
user-card { --title-color: red; }
```
```javascript
shadow.innerHTML = `
  <style>.title { color: var(--title-color, blue); }</style>
  <div class="title">Name</div>
`;
```

CSS custom properties (`--*`) **inherit through** the shadow boundary by design — this is the sanctioned way to let a host page theme a component without breaking full encapsulation. Regular selectors from the page still cannot reach in, and shadow-internal styles still cannot leak out.

### `::part` and `::slotted` for controlled external styling

```html
<style>
  user-card::part(title) { color: purple; } /* page CAN style parts explicitly exposed */
</style>
```
```javascript
shadow.innerHTML = `<div class="title" part="title">Name</div>`;
```

**Common mistake:** reaching for `mode: 'closed'` or fighting the encapsulation with `!important` hacks, instead of using `part`/`::part` or CSS custom properties — the sanctioned escape hatches for controlled external styling.

### Slots for content projection

```html
<!-- Component definition -->
<template id="panel-template">
  <div class="panel">
    <slot name="header"></slot>
    <slot></slot> <!-- default slot -->
  </div>
</template>
```
```html
<!-- Usage — light DOM children get projected into the shadow tree's slots -->
<my-panel>
  <h2 slot="header">Title</h2>
  <p>Body content goes to the default slot</p>
</my-panel>
```

**Common mistake:** assuming slotted (light DOM) content is styled by the shadow tree's `<style>` block — it isn't. Slotted content keeps the styling context of the *light* DOM (the outer page), not the shadow tree, except through `::slotted()` selectors.

## Where the framework-agnostic pitch breaks down

- **No built-in reactive state/data binding** — you're manually calling `render()` on attribute/property changes; frameworks like Lit exist specifically to paper over this.
- **SSR story is weaker** — Declarative Shadow DOM (`<template shadowrootmode="open">`) solves server-rendering Shadow DOM content, but browser/tooling support and framework integration are newer and less battle-tested than React/Vue SSR.
- **Form participation requires extra API** — Custom Elements don't automatically work with `<form>` submission; you need `ElementInternals`/`attachInternals()` and `formAssociated = true` to participate properly.
- **Testing/tooling maturity** — fewer established patterns compared to React Testing Library-style ecosystems; closed shadow roots specifically hurt here.

## Common mistakes summary

- Treating `connectedCallback` as a one-time mount hook.
- Reading attributes/children inside the constructor instead of `connectedCallback`.
- Forgetting `observedAttributes`, silently breaking `attributeChangedCallback`.
- Querying template content from the main document instead of `template.content`.
- Defaulting to `mode: 'closed'` shadow roots without a real reason.
- Fighting encapsulation with `!important` instead of using CSS custom properties or `::part`.
- Assuming slotted content picks up shadow-tree styles.

## Where this fits

Web Components sits alongside Type Checkers, after Web Security Basics, in the frontend roadmap.
