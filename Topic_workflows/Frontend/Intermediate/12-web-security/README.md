# Web Security Basics — Intermediate Brush-Up

You know what CORS, HTTPS, CSP, and XSS/CSRF/SQLi are. This is a refresher on the misconfigurations and edge cases that trip people up in real codebases and interviews.

## CORS: nuances beyond "add the header"

### Preflight vs simple requests

Not every cross-origin request triggers an `OPTIONS` preflight. A request is a "simple request" (no preflight) only if it meets **all** of: method is `GET`/`HEAD`/`POST`, and only "CORS-safelisted" headers are used (`Accept`, `Accept-Language`, `Content-Language`, `Content-Type` restricted to `application/x-www-form-urlencoded`, `multipart/form-data`, or `text/plain`). Adding a custom header like `Authorization` or using `Content-Type: application/json` forces a preflight.

**Common mistake:** assuming CORS blocks the request from reaching the server. It doesn't — CORS only blocks the **browser from letting JS read the response**. The server-side handler still executes (a common source of confusion when debugging "CORS errors" that turn out to be a real backend bug masked by a misleading console message).

### The `*` + credentials trap

```javascript
// BROKEN combination — browsers reject this
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Credentials', 'true');
// Spec forbids wildcard origin when credentials (cookies) are involved.
// Must echo back a specific origin instead:
res.setHeader('Access-Control-Allow-Origin', req.headers.origin); // validated against an allowlist!
res.setHeader('Access-Control-Allow-Credentials', 'true');
```

**Common mistake:** blindly reflecting `req.headers.origin` back without validating it against an allowlist — this defeats the purpose of CORS entirely, effectively allowing any origin.

## HTTPS/TLS: what's glossed over

- **HSTS** (`Strict-Transport-Security` header) forces browsers to only ever connect via HTTPS for a domain, closing the window where a user's first request over plain HTTP could be intercepted and downgraded (SSL-stripping).
- Certificate validation isn't just "is it signed" — it also checks **hostname match** and **expiration**. Self-signed certs fail validation by design; only override this in local dev, never accept it as a workaround in production.
- TLS terminates connections; what happens *after* the load balancer/reverse proxy (TLS termination point) is a separate question — internal traffic being plaintext HTTP behind your firewall is a common (and often acceptable, but frequently overlooked) architecture decision worth being explicit about.

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

## CSP: misconfiguration examples

CSP is easy to configure in a way that looks secure but isn't.

### `unsafe-inline` defeats the point for scripts

```
// WEAK — allows any inline <script> tag to execute, including injected ones
Content-Security-Policy: script-src 'self' 'unsafe-inline';
```

If an attacker achieves any injection point, `'unsafe-inline'` on `script-src` means CSP does nothing to stop it. Prefer **nonces** or **hashes**:

```
// BETTER — only this specific script (matching the nonce) is allowed to run
Content-Security-Policy: script-src 'self' 'nonce-r4nd0mVal123';
```
```html
<script nonce="r4nd0mVal123">/* trusted inline script */</script>
```

The nonce must be regenerated per-request/response — a static, hardcoded nonce defeats its purpose (an attacker who can inject `<script>` can just read the nonce from the page and reuse it).

### Overly broad `default-src`

```
// WEAK
Content-Security-Policy: default-src *;
```
This effectively disables CSP. Common in projects that added CSP just to "check a compliance box" without actually restricting anything.

### `report-uri` / `report-to` for rollout

Use `Content-Security-Policy-Report-Only` first to catch what would break before enforcing, and wire up a reporting endpoint to catch violations in production without guessing.

```
Content-Security-Policy-Report-Only: default-src 'self'; report-uri /csp-violations
```

**Common mistake:** shipping a strict CSP directly to production without a report-only rollout phase, breaking legitimate third-party widgets/analytics that weren't accounted for.

## XSS: the nuance beyond "escape your output"

There are three flavors, and mitigation differs:

| Type | Where the payload lives | Example |
|------|--------------------------|---------|
| **Stored XSS** | Persisted in the database (comment, profile bio) | Malicious script saved, served to every visitor |
| **Reflected XSS** | Bounced back immediately from a request (e.g., a search query echoed into results) | `?q=<script>...</script>` reflected into the page |
| **DOM-based XSS** | Never touches the server — a client-side script writes untrusted data into the DOM via `innerHTML`, `document.write`, etc. | `element.innerHTML = location.hash.slice(1)` |

**Common mistake:** assuming a framework's default escaping (React's JSX, Vue's `{{ }}`) protects you everywhere, then bypassing it with `dangerouslySetInnerHTML` / `v-html` on user content without sanitization — reintroducing the exact vulnerability the framework was preventing.

```javascript
// Still vulnerable even in React — dangerouslySetInnerHTML is an explicit escape hatch
function Bio({ userBio }) {
  return <div dangerouslySetInnerHTML={{ __html: userBio }} />; // XSS if unsanitized
}

// Fix: sanitize before rendering, or don't render raw HTML at all
import DOMPurify from 'dompurify';
function Bio({ userBio }) {
  return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userBio) }} />;
}
```

**Also common:** DOM-based XSS via URL fragments/query params being written straight into the DOM by client-side JS, which server-side output encoding can't catch at all since the server never sees that data.

## CSRF: what's often missed

`SameSite=Lax` (the modern browser default) blocks CSRF on cross-site `POST`/state-changing requests but **still allows top-level GET navigations** — so a state-changing action exposed via `GET` (e.g., `GET /delete-account?id=5`) is still exploitable. This is why state-changing operations must use non-GET methods, regardless of cookie settings.

**Common mistake:** relying solely on `SameSite=Lax` as "CSRF is solved" while still having destructive actions reachable via `GET`, or while supporting older browsers/contexts (like some webview/embedded contexts) that don't honor `SameSite` consistently.

## SQL Injection: beyond string concatenation

Even ORMs aren't automatically safe if you drop to raw queries or string-build dynamic identifiers (table/column names), which can't be parameterized the same way as values:

```javascript
// Still vulnerable — column name interpolated directly
db.query(`SELECT * FROM users ORDER BY ${sortColumn}`); // sortColumn from user input!

// Fix: allowlist valid values instead of parameterizing
const allowed = ['name', 'created_at', 'email'];
const col = allowed.includes(sortColumn) ? sortColumn : 'created_at';
db.query(`SELECT * FROM users ORDER BY ${col}`);
```

## Common mistakes summary

- Debugging a "CORS error" as if the server didn't run — it did; the browser just blocked reading the response.
- Reflecting `Origin` header back unchecked while also allowing credentials.
- Using `'unsafe-inline'` in `script-src`, silently neutering CSP's main XSS defense.
- Shipping CSP straight to enforce mode without a report-only rollout.
- Trusting `dangerouslySetInnerHTML`/`v-html` with unsanitized user content.
- Treating `SameSite=Lax` as complete CSRF protection while state-changing routes still accept `GET`.
- Parameterizing values but string-interpolating identifiers (column/table names) in SQL.

## Where this fits

Web Security Basics sits after Authentication Strategies and before Web Components / Type Checkers in the frontend roadmap.
