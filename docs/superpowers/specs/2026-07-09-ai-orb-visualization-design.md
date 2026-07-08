# AI Orb Visualization — Design Spec

Date: 2026-07-09

## Goal

Recreate the Siri-style "AI speaking" orb shown in `REC-20260709043749.mp4` (a swirly blue/purple/pink sphere with faint particles, floating on a white background) as a reusable React component, and expose it on a standalone demo page.

## Reference

`REC-20260709043749.mp4` (repo root). Frame capture: smooth glowing sphere, blue/purple/pink noise-swirl surface, soft rim glow, subtle particles near the surface, white backdrop, no visible ground/shadow — feels like a floating idle "AI is present" indicator.

## Scope

- New component: `frontend/src/components/AIOrb.jsx`
- New demo page: `frontend/src/pages/AIOrbDemo.jsx`, mounted at route `/ai-orb-demo`
- New dependency: `three` (only)
- Idle animation only — no audio reactivity in this iteration
- Not wired into MockInterview / AICareerCoach / AITutor yet — those are future integration points once the component is validated standalone

## Component: AIOrb

**Rendering approach:** raw Three.js (no `@react-three/fiber`), managed imperatively inside a `useEffect` + `useRef`, matching the plain-React style already used throughout this codebase (no other Three.js/R3F usage exists in the repo).

**Scene:**
- `PerspectiveCamera`, transparent `WebGLRenderer` (`alpha: true`) composited over a plain white CSS background — no floor/ground/shadow plane.
- Canvas sized to its container via `ResizeObserver`; capped max pixel size so it doesn't blow up on wide viewports.

**Sphere mesh:**
- `IcosahedronGeometry` (subdivided, e.g. detail 4+) for a smooth organic base.
- Custom `ShaderMaterial`:
  - Vertex shader displaces vertices using simplex 3D noise (time-driven) for the organic swirl/turbulence look.
  - Fragment shader mixes blue/purple/pink based on the same noise field plus a fresnel term for rim glow (brighter, more saturated at grazing angles, like the reference).
- Slow continuous rotation + gentle scale pulse driven by the animation clock (idle loop, no external input).

**Particles:**
- ~150–300 point sprites (`THREE.Points`) using a soft circular sprite generated on an off-screen `<canvas>` (no external image asset).
- Positioned in a thin shell just outside the sphere radius, each with independent slow drift/rotation so they read as ambient dust rather than a dense swarm — matches the reference's subtlety, not a heavy particle-cloud look.

**Animation loop:** manual `requestAnimationFrame` loop started on mount, cancelled on unmount; noise/time uniforms and particle positions updated per frame.

**Props (minimal, for later reuse):**
- `size` (px, default fills container)
- `className` (for placement/layout by consumers)

No audio-input prop in this iteration — can be added later as a follow-up when wiring into MockInterview/AICareerCoach.

## Demo page: AIOrbDemo

- Full-viewport plain white background, `AIOrb` centered, nothing else on the page — mirrors the framing of the reference video.
- Route: `/ai-orb-demo`, added to `frontend/src/App.jsx` alongside existing page routes.

## Out of scope (future work, not this iteration)

- Audio-reactive pulsing (Web Audio API hookup to mic or TTS playback)
- Wiring the orb into MockInterview.jsx / AICareerCoach.jsx / AITutor.jsx as a live "AI speaking" indicator
- Configurable color palette (currently hardcoded to reference's blue/purple/pink)

## Testing

- Manual verification: run dev server, visit `/ai-orb-demo`, confirm orb renders, animates smoothly, resizes with viewport, and unmounts cleanly (no WebGL context leak on navigating away — verified by navigating to the route and back and checking no console warnings about multiple contexts).
- No unit tests planned for shader/animation code itself (visual, not logic-bearing); component prop handling (size/className) can get a light render test if useful.
