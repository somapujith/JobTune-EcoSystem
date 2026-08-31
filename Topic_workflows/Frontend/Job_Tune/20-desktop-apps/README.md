# Desktop Apps (Job Tune)

## Cheat sheet

| Aspect | Electron | Tauri | Flutter Desktop |
|---|---|---|---|
| Bundles | Full Chromium + Node.js | Nothing — uses OS WebView | Own rendering engine (Skia/Impeller) |
| Bundle size | 100+ MB | Single-digit to low tens of MB | Tens of MB |
| Memory | High — separate Chromium per window/app | Low — shares OS WebView | Medium |
| Backend language | Node.js (JS/TS) | Rust | Dart |
| Frontend | HTML/CSS/JS, any framework | HTML/CSS/JS, any framework | Dart widgets (no HTML/CSS) |
| Cross-OS render consistency | High (always Chromium) | Lower (WKWebView/WebKitGTK/WebView2 differ) | High (self-drawn) |
| Native API access | Broad by default; must lock down (`contextIsolation`) | Explicit allowlist/capabilities config | Plugin-based |
| Notable apps | VS Code, Slack, Discord | Growing adoption (newer) | Fewer mainstream examples yet |
| Maturity | Very mature | Newer, fast-growing | Maturing |

## Key facts

- Electron = Chromium (renderer) + Node.js (main process), multi-process like a real browser — each `BrowserWindow` ≈ a Chromium tab process. This is the root cause of high memory use.
- Tauri backend is Rust; frontend renders in the **OS-native WebView** (WebView2/WKWebView/WebKitGTK) — no bundled browser engine, hence small binaries.
- Tauri's rendering is *not* pixel-identical across OSes (different WebView engines); Electron's is (always Chromium).
- Security: Electron renderers must run with `contextIsolation: true` and `nodeIntegration: false`, exposing only needed APIs via `preload.js` + `contextBridge`. Tauri uses an explicit capabilities/allowlist system — nothing native is exposed unless declared.
- Flutter Desktop shares Flutter's mobile rendering engine — no HTML/CSS/DOM at all, fully native-window Dart widgets.
- macOS requires code signing + notarization for distributed desktop apps regardless of framework.

## Likely interview questions

**Q: Why is memory usage high in Electron apps?**
A: Each `BrowserWindow` runs as its own near-full Chromium renderer process; running multiple Electron apps means multiple separate Chromium engine instances in memory, with no shared runtime across apps.

**Q: How does Tauri achieve much smaller binaries than Electron?**
A: It doesn't bundle a browser engine — it uses the WebView already installed on the OS (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux), shipping only the compiled Rust backend and app assets.

**Q: What's the security risk of enabling `nodeIntegration` in an Electron renderer?**
A: The renderer gets direct access to Node.js APIs (filesystem, process spawning, etc.), so any XSS vulnerability becomes remote code execution on the user's machine. Mitigate with `contextIsolation: true` and a `preload.js` + `contextBridge` exposing only a minimal safe API surface.

**Q: Why might a Tauri app render differently on macOS vs. Windows, when an Electron app wouldn't?**
A: Tauri relies on each OS's native WebView, and WKWebView (Safari engine) supports a different CSS/JS feature set than Chromium-based WebView2 — Electron avoids this entirely by always bundling the same Chromium version.

**Q: When would you pick Electron over Tauri despite the size/memory cost?**
A: Mature ecosystem/tooling needs, team has zero Rust experience and no time to acquire it, guaranteed identical Chromium rendering across all OSes is required, or reliance on Electron-specific plugins/APIs.

**Q: How does Flutter Desktop differ fundamentally from Electron and Tauri?**
A: It doesn't use a browser engine or WebView at all — it self-renders every pixel via its own engine (same as Flutter mobile), so there's no HTML/CSS/DOM and no web-skills transfer, but rendering is fully consistent across platforms.

---

**Where this fits:** Between Mobile Apps and Browser APIs in the roadmap.
