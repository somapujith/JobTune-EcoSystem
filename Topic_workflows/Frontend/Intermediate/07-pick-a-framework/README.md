# Pick a Framework — Intermediate Brush-Up

You've used at least one framework already. This is a refresher on the reactivity models under the hood, the gotchas each one has, and how to actually reason about tradeoffs instead of picking by popularity alone.

## Part 1: Why frameworks exist — the nuance people miss

### Declarative UI isn't "no imperative code" — it's imperative code you don't write

The DOM updates are still imperative under the hood (`setAttribute`, `appendChild`, etc.) — the framework writes and executes that code *for you*, based on a diff between what changed and what's currently rendered. What you gain is a stable mental model: "UI = f(state)" instead of tracking manual mutations by hand. This matters when debugging: performance problems usually come from the framework doing *more* imperative DOM work than necessary (e.g. unnecessary re-renders), not less.

### Virtual DOM vs no virtual DOM — what's actually being traded off

| Approach | How updates are found | Tradeoff |
|---|---|---|
| Virtual DOM (React) | Re-run component function, diff old vs new virtual tree, patch real DOM | Simple mental model, but pays a diffing cost even for small changes unless you optimize (memoization) |
| Fine-grained reactivity (Solid, Svelte, Vue 3, Qwik) | Track exactly which DOM node depends on which piece of state at a granular level | No diffing needed — updates go directly to the affected node, but requires careful dependency tracking (can miss reactivity if you destructure signals incorrectly) |
| Change detection (Angular, classic) | Walk the whole component tree checking for changes (zone.js triggers checks on async events) | Simpler to reason about but can be wasteful; Angular Signals (17+) moved this toward fine-grained too |

---

## Part 2: Reactivity gotchas per framework

### React — stale closures and the dependency array trap

```jsx
function Timer() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setCount(count + 1); // BUG: `count` is captured from the render when the effect ran — always 0 + 1
    }, 1000);
    return () => clearInterval(id);
  }, []); // empty deps — effect runs once, closure over `count` never updates

  return <p>{count}</p>;
}
```

Fix: use the updater-function form, which doesn't rely on the closed-over value.

```jsx
setCount((prev) => prev + 1);
```

This "stale closure" trap is one of the most common React bugs and a frequent interview topic.

### React — object/array state and referential equality

```jsx
const [user, setUser] = useState({ name: "Alex" });

// WRONG: mutating state directly doesn't trigger a re-render
user.name = "Sam";
setUser(user); // same reference — React bails out (Object.is comparison)

// RIGHT: create a new object
setUser({ ...user, name: "Sam" });
```

React (and most frameworks using reference equality checks) compares state by reference, not deep value — mutating in place silently breaks reactivity.

### Vue — losing reactivity by destructuring

```js
import { reactive } from "vue";
const state = reactive({ count: 0 });

// WRONG: destructuring breaks the reactive connection
const { count } = state;

// RIGHT: use toRefs, or access state.count directly
import { toRefs } from "vue";
const { count } = toRefs(state);
```

Vue's `reactive()` wraps an object in a Proxy; plain destructuring extracts the raw value and loses the Proxy's tracking. `ref()`/`toRefs` exist specifically to make individual values destructurable while staying reactive.

### Svelte — reactivity is statement-based, not value-based

```svelte
<script>
  let count = 0;
  $: doubled = count * 2; // reactive statement — reruns when count changes

  function increment() {
    count += 1; // triggers reactivity — direct assignment
  }

  function badIncrement(arr) {
    arr.push(1); // does NOT trigger reactivity — no assignment happened
  }
</script>
```

Svelte's compiler detects **assignments** to trigger updates — calling a mutating array method like `.push()` without a subsequent reassignment won't trigger a re-render. You must reassign: `arr = [...arr, 1]` or `arr = arr` after mutating.

### Solid JS — calling signals, not reading them like variables

```jsx
const [count, setCount] = createSignal(0);

console.log(count);   // logs the function itself, not the value — common mistake
console.log(count()); // correct — call it to read the current value
```

Coming from React, forgetting the `()` call is the single most common Solid mistake — signals are accessor functions, not plain variables.

### Angular — change detection and `OnPush`

By default, Angular's change detection walks the whole component tree on nearly every async event (click, timer, HTTP response) via `zone.js`. `ChangeDetectionStrategy.OnPush` restricts a component to only re-check when its `@Input()` references change or an event originates inside it — a critical performance lever in large apps, and one people forget to opt into.

### Qwik — the `$` boundary is not optional decoration

```jsx
const Counter = component$(() => {
  const count = useSignal(0);
  return <button onClick$={() => count.value++}>{count.value}</button>;
});
```

The `$` suffix (`component$`, `onClick$`) marks lazy-loading boundaries the Qwik Optimizer uses to split code at build time. Forgetting it, or restructuring code so a closure captures something the serializer can't lazy-load, breaks resumability — this is the most common Qwik-specific mistake for people used to React/Solid syntax.

---

## Part 3: Choosing with intention

### Comparison for practical decision-making

| Framework | Bundle size (typical) | SSR story | Best niche | Biggest risk |
|---|---|---|---|---|
| React | Medium-large | Strong (Next.js) | General purpose, largest hiring pool | Re-render performance requires discipline (memoization) |
| Vue.js | Medium | Strong (Nuxt) | Teams wanting cohesive official tooling | Smaller hiring pool outside certain regions |
| Angular | Large | Good (Angular Universal) | Enterprise, large teams, long-term maintenance | Steep onboarding, verbose boilerplate |
| Svelte | Small | Strong (SvelteKit) | Performance-sensitive, smaller teams | Smaller ecosystem, fewer senior hires available |
| Solid JS | Small | Growing (SolidStart) | Performance-critical apps wanting JSX | Small ecosystem, less battle-tested at scale |
| Qwik | Smallest initial payload | Core design goal (Qwik City) | Content-heavy sites, fast TTI | Newest, smallest community, steepest conceptual shift |

### Signals are converging across frameworks

Note that React (via community libraries and increasing core interest), Vue 3, Angular 17+, Solid, Svelte 5 ("runes"), and Qwik all now use some form of fine-grained signal-based reactivity. This convergence is one of the more interesting framework trends of the last few years — worth mentioning if asked "where is the industry heading" in an interview.

---

## Common Mistakes

1. **Mutating state directly** in React/Preact instead of creating new objects/arrays — silently breaks re-renders.
2. **Stale closures in `useEffect`** — capturing outdated state instead of using the functional updater or including correct dependencies.
3. **Destructuring reactive Vue state** without `toRefs`, losing reactivity.
4. **Mutating arrays/objects in Svelte without reassignment** — the compiler only tracks assignments.
5. **Forgetting to call a Solid signal** (`count` instead of `count()`).
6. **Not using `OnPush` in Angular** for performance-critical component trees, leaving default (expensive) change detection everywhere.
7. **Removing/misplacing Qwik's `$` boundaries**, breaking the lazy-loading/resumability model.
8. **Picking a framework purely on hype/performance benchmarks** without weighing ecosystem size, hiring pool, and team familiarity — the "best" framework is highly context-dependent.

---

**Where this fits:** JavaScript → Version Control (Git) → Package Managers → Pick a Framework → Writing CSS → ...
