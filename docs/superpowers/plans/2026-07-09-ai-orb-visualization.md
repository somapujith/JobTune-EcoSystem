# AI Orb Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Siri-style animated AI orb (swirly blue/purple/pink sphere with subtle particles, floating on white) as a reusable React component, and expose it on a standalone chrome-free demo route.

**Architecture:** Raw Three.js (no `@react-three/fiber`) managed imperatively inside a React `useEffect`/`useRef`. A custom `ShaderMaterial` on an `IcosahedronGeometry` produces the noise-displaced, fresnel-glowing swirl surface; a sparse `THREE.Points` shell adds ambient drifting particles. The component mounts as a full-viewport orb on a new top-level route (sibling to `/login`, outside the app `Layout`, so there's no nav chrome) at `/ai-orb-demo`.

**Tech Stack:** React 18, Three.js (new dependency), Vite. No `@react-three/fiber`, no audio APIs (idle animation only, per spec).

## Global Constraints

- Only new dependency: `three` (spec: "New dependency: `three` (only)")
- No `@react-three/fiber` — raw Three.js, imperative `useEffect`/`useRef`, matching existing plain-React style (spec: "Integration style" decision)
- Idle animation only — no Web Audio / mic / TTS reactivity in this iteration (spec: "Idle animation only")
- Color palette hardcoded to reference video's blue/purple/pink — not configurable in this iteration (spec: "Out of scope")
- Particle density: subtle/sparse (~150–300 points), not a dense swarm (spec: "Particle style")
- Demo route `/ai-orb-demo` must render with no app nav chrome — full white background, orb only (spec: "Demo page")
- Component not wired into MockInterview/AICareerCoach/AITutor in this iteration (spec: "Not wired into ... yet")

---

### Task 1: Add Three.js dependency

**Files:**
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `three` package available for import in `frontend/src/**`

- [ ] **Step 1: Install the dependency**

Run: `cd frontend && npm install three`

Expected: `package.json` gains `"three": "^<version>"` under `dependencies`, `package-lock.json` updates, no install errors.

- [ ] **Step 2: Verify import resolves**

Run: `cd frontend && node -e "require.resolve('three')" && echo OK`

Expected: prints `OK`

- [ ] **Step 3: Commit**

```bash
cd frontend && git add package.json package-lock.json
git commit -m "chore: add three.js dependency for AI orb visualization"
```

---

### Task 2: Build the particle sprite texture helper

**Files:**
- Create: `frontend/src/components/aiOrb/particleTexture.js`

**Interfaces:**
- Produces: `createParticleTexture(): THREE.Texture` — a soft circular radial-gradient sprite generated on an off-screen `<canvas>`, used by Task 4 for `THREE.PointsMaterial.map`.

- [ ] **Step 1: Write the module**

```javascript
// frontend/src/components/aiOrb/particleTexture.js
import * as THREE from 'three';

export function createParticleTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd frontend && npx vite build --mode development 2>&1 | tail -20`

Expected: build completes with no errors referencing `particleTexture.js` (pre-existing unrelated build warnings, if any, are fine).

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/components/aiOrb/particleTexture.js
git commit -m "feat: add particle sprite texture helper for AI orb"
```

---

### Task 3: Build the orb shader material

**Files:**
- Create: `frontend/src/components/aiOrb/orbShader.js`

**Interfaces:**
- Produces: `createOrbMaterial(): THREE.ShaderMaterial` with a `uniforms.uTime` (`{ value: number }`) uniform that Task 5's animation loop updates each frame to drive the noise/swirl and pulse.

- [ ] **Step 1: Write the shader module**

```javascript
// frontend/src/components/aiOrb/orbShader.js
import * as THREE from 'three';

// Simplex 3D noise (Ashima Arts / Stefan Gustavson, public domain)
const noiseGLSL = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

const vertexShader = `
${noiseGLSL}
uniform float uTime;
varying vec3 vNormal;
varying float vNoise;

void main() {
  vNormal = normalize(normalMatrix * normal);
  float n = snoise(position * 1.5 + uTime * 0.15);
  vNoise = n;
  vec3 displaced = position + normal * n * 0.12;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`;

const fragmentShader = `
varying vec3 vNormal;
varying float vNoise;

void main() {
  vec3 blue   = vec3(0.30, 0.45, 0.95);
  vec3 purple = vec3(0.55, 0.30, 0.85);
  vec3 pink   = vec3(0.95, 0.40, 0.75);

  float t = smoothstep(-0.6, 0.6, vNoise);
  vec3 color = mix(blue, purple, t);
  color = mix(color, pink, smoothstep(0.2, 1.0, vNoise));

  float fresnel = pow(1.0 - abs(vNormal.z), 2.5);
  color += fresnel * vec3(0.6, 0.5, 0.9);

  gl_FragColor = vec4(color, 1.0);
}
`;

export function createOrbMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader,
    fragmentShader,
  });
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd frontend && npx vite build --mode development 2>&1 | tail -20`

Expected: build completes with no errors referencing `orbShader.js`.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/components/aiOrb/orbShader.js
git commit -m "feat: add noise-displaced swirl shader for AI orb"
```

---

### Task 4: Build the AIOrb component (scene, mesh, particles, resize)

**Files:**
- Create: `frontend/src/components/AIOrb.jsx`

**Interfaces:**
- Consumes: `createOrbMaterial()` from `./aiOrb/orbShader.js` (Task 3), `createParticleTexture()` from `./aiOrb/particleTexture.js` (Task 2)
- Produces: default export `AIOrb({ size, className })` — a React component rendering a `<div>` container with a Three.js canvas inside, exported for use by `AIOrbDemo` (Task 6)

- [ ] **Step 1: Write the component**

```jsx
// frontend/src/components/AIOrb.jsx
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createOrbMaterial } from './aiOrb/orbShader';
import { createParticleTexture } from './aiOrb/particleTexture';

const PARTICLE_COUNT = 220;
const SPHERE_RADIUS = 1.4;

function buildParticles() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const speeds = new Float32Array(PARTICLE_COUNT);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const radius = SPHERE_RADIUS * (1.05 + Math.random() * 0.25);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);

    speeds[i] = 0.05 + Math.random() * 0.1;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    size: 0.045,
    map: createParticleTexture(),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: new THREE.Color(0xcdb8ff),
  });

  return { points: new THREE.Points(geometry, material), speeds };
}

export default function AIOrb({ size, className }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 4.2;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const geometry = new THREE.IcosahedronGeometry(SPHERE_RADIUS, 24);
    const material = createOrbMaterial();
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    const { points, speeds } = buildParticles();
    scene.add(points);

    const resize = () => {
      const width = size ?? container.clientWidth;
      const height = size ?? container.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    let frameId;
    const clock = new THREE.Clock();

    const animate = () => {
      const elapsed = clock.getElapsedTime();

      material.uniforms.uTime.value = elapsed;
      sphere.rotation.y = elapsed * 0.15;
      sphere.rotation.x = Math.sin(elapsed * 0.1) * 0.1;
      const pulse = 1 + Math.sin(elapsed * 0.6) * 0.03;
      sphere.scale.setScalar(pulse);

      points.rotation.y = elapsed * 0.08;
      const positions = points.geometry.attributes.position.array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const idx = i * 3 + 2;
        positions[idx] += Math.sin(elapsed * speeds[i]) * 0.0006;
      }
      points.geometry.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      geometry.dispose();
      material.dispose();
      points.geometry.dispose();
      points.material.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [size]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={size ? { width: size, height: size } : { width: '100%', height: '100%' }}
    />
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd frontend && npx vite build --mode development 2>&1 | tail -20`

Expected: build completes with no errors referencing `AIOrb.jsx`.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/components/AIOrb.jsx
git commit -m "feat: add AIOrb component with shader sphere and particle shell"
```

---

### Task 5: Build the demo page

**Files:**
- Create: `frontend/src/pages/AIOrbDemo.jsx`

**Interfaces:**
- Consumes: default export `AIOrb` from `../components/AIOrb.jsx` (Task 4)
- Produces: default export `AIOrbDemo()` — full-viewport white page rendering the orb, consumed by `App.jsx` routing (Task 6)

- [ ] **Step 1: Write the page**

```jsx
// frontend/src/pages/AIOrbDemo.jsx
import AIOrb from '../components/AIOrb';

export default function AIOrbDemo() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white">
      <AIOrb size={360} />
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd frontend && npx vite build --mode development 2>&1 | tail -20`

Expected: build completes with no errors referencing `AIOrbDemo.jsx`.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/pages/AIOrbDemo.jsx
git commit -m "feat: add AI orb demo page"
```

---

### Task 6: Wire the demo route into App.jsx

**Files:**
- Modify: `frontend/src/App.jsx:60` (import block, after existing page imports)
- Modify: `frontend/src/App.jsx:207` (route block, sibling to `/login`, outside `Layout`)

**Interfaces:**
- Consumes: default export `AIOrbDemo` from `./pages/AIOrbDemo.jsx` (Task 5)

- [ ] **Step 1: Add the import**

In `frontend/src/App.jsx`, after the existing `import ComingSoon from './pages/ComingSoon';` line (line 60), add:

```javascript
import AIOrbDemo from './pages/AIOrbDemo';
```

- [ ] **Step 2: Add the route outside Layout**

In `frontend/src/App.jsx`, the routes block currently ends like this:

```jsx
        </Route>
        <Route path="/login" element={<Login />} />
      </Routes>
```

Change it to add the new route as a sibling of `/login` (outside the `Layout`-wrapped `<Route path="/">`, so no nav chrome renders):

```jsx
        </Route>
        <Route path="/login" element={<Login />} />
        <Route path="/ai-orb-demo" element={<AIOrbDemo />} />
      </Routes>
```

- [ ] **Step 3: Verify the build**

Run: `cd frontend && npx vite build --mode development 2>&1 | tail -20`

Expected: build completes with no errors.

- [ ] **Step 4: Manual verification**

Run: `cd frontend && npm run dev` (leave running), then open `http://localhost:5173/ai-orb-demo` in a browser (or use the `run`/`glance` tooling available in this environment to screenshot it).

Expected: full white screen, no nav header/footer, a rotating blue/purple/pink swirled sphere centered on screen with faint drifting particles near its surface — no console errors about WebGL context or missing uniforms. Resize the browser window and confirm the orb's canvas resizes without distortion. Navigate away (e.g. to `/`) and back to confirm no console warnings about duplicate WebGL contexts (verifies the `useEffect` cleanup in Task 4 disposes the renderer correctly).

Stop the dev server after verifying.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/App.jsx
git commit -m "feat: wire AI orb demo page into /ai-orb-demo route"
```

---

## Post-plan notes

- Future integration (not this plan): pass an `intensity`/`audioLevel` prop into `AIOrb` and wire it to Web Audio analyser output when adding this as a live "AI speaking" indicator to `MockInterview.jsx`, `AICareerCoach.jsx`, or `AITutor.jsx`.
- Future: make the blue/purple/pink palette configurable via props/uniforms if reused with a different brand look elsewhere.
