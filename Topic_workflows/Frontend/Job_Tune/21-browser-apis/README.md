# Browser APIs (Job Tune)

## Cheat sheet: Storage

| | localStorage | sessionStorage | IndexedDB |
|---|---|---|---|
| Persistence | Forever | Tab lifetime | Forever |
| Capacity | ~5-10MB | ~5-10MB | Hundreds of MB+ |
| API | Sync (blocks main thread) | Sync | Async |
| Shared across tabs | Yes | No | Yes |
| Data types | Strings only | Strings only | Structured, blobs, files |
| Security note | Readable by any JS on origin — vulnerable to XSS, don't store tokens | Same | Same |

## Cheat sheet: Real-time / push

| | WebSockets | Server-Sent Events (SSE) |
|---|---|---|
| Direction | Bidirectional | Server → client only |
| Protocol | `ws://`/`wss://`, needs upgrade | Plain HTTP |
| Auto-reconnect | No — must implement manually | Yes — built in |
| Data format | Text or binary | Text (UTF-8) only |
| Connection limit | No special per-domain cap | ~6 per domain on HTTP/1.1 (HTTP/2 removes this) |
| Use case | Chat, multiplayer, collab editing | Live feeds, notifications, stock tickers |

## Key facts: other APIs

- **Service Workers**: background script, intercepts `fetch`, core of PWA offline support. Doesn't control the page that registered it until the *next* load. Must version cache names to avoid serving stale content forever.
- **Geolocation**: `navigator.geolocation.getCurrentPosition()`, requires HTTPS + user permission, accuracy varies (GPS vs IP).
- **Notifications**: `Notification.requestPermission()` must be triggered by a user gesture; denial is permanent until the user changes browser settings manually.
- **Device Orientation**: `deviceorientation` event exposes `alpha`/`beta`/`gamma`; iOS 13+ requires `DeviceOrientationEvent.requestPermission()` from a user gesture — silently no-ops otherwise.
- **Payment Request API**: standardized browser checkout UI; inconsistent browser support — always ship a fallback form.
- **Credential Management API**: `navigator.credentials.get()`/`.store()`; HTTPS-only; treat as progressive enhancement.

## Likely interview questions

**Q: When would you use sessionStorage over localStorage?**
A: When data should not survive beyond the current tab — e.g., multi-step form progress that should reset if the user opens a new tab or closes the current one.

**Q: Why shouldn't you store a JWT in localStorage?**
A: It's readable by any JavaScript running on the page's origin, so an XSS vulnerability lets an attacker exfiltrate it directly. `httpOnly` cookies aren't accessible to JS at all, which mitigates this.

**Q: What's the fundamental difference between WebSockets and Server-Sent Events?**
A: WebSockets are bidirectional over their own protocol (`ws://`); SSE is one-way (server → client) over plain HTTP and reconnects automatically, while WebSockets require the client to implement its own reconnect/backoff logic.

**Q: Why is IndexedDB preferred over localStorage for larger datasets?**
A: IndexedDB is asynchronous (doesn't block the main thread) and can store far more data (hundreds of MB, quota-dependent) plus structured objects and blobs, whereas localStorage is synchronous, string-only, and capped around 5-10MB.

**Q: What causes a WebSocket connection to silently "die" without an error?**
A: Network changes, device sleep, or NAT/proxy timeouts can leave a socket in a stale open state client-side with no `onclose`/`onerror` fired — mitigated with a heartbeat/ping-pong mechanism to detect and reconnect.

**Q: Why might a Notification permission prompt not appear when you expect it to?**
A: Browsers require the request to originate from a user gesture (e.g., a click); calling `requestPermission()` on page load is ignored/blocked by most browsers to prevent permission-prompt abuse.

**Q: Why does Device Orientation code that works on Android fail silently on iOS?**
A: iOS Safari 13+ requires an explicit `DeviceOrientationEvent.requestPermission()` call, invoked from a user gesture, before orientation events will fire — this requirement doesn't exist on Android.

---

**Where this fits:** Between Desktop Apps and Measuring & Improving Performance in the roadmap.
