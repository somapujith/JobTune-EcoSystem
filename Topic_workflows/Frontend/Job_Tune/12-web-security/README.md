# Web Security Basics — Cheat Sheet

## CORS

| Concept | Fact |
|---------|------|
| Enforced by | Browser only (server still executes the request; CORS just blocks JS from reading the response) |
| Same-origin match | protocol + domain + port, all three must match |
| Preflight (`OPTIONS`) triggered by | Non-simple methods (`PUT`/`DELETE`/etc.), custom headers, `Content-Type: application/json` |
| Simple request (no preflight) | `GET`/`HEAD`/`POST` + safelisted headers + restricted `Content-Type` |
| Key header | `Access-Control-Allow-Origin: <origin>` |
| Credentials + wildcard | Illegal combo — `Allow-Origin: *` + `Allow-Credentials: true` is rejected by spec; must echo specific validated origin |

```
Access-Control-Allow-Origin: https://trusted.com
Access-Control-Allow-Credentials: true
```

## HTTPS / TLS

| Guarantee | Meaning |
|-----------|---------|
| Encryption | Data unreadable in transit |
| Integrity | Tampering detectable |
| Authentication | Cert (CA-signed) proves server identity |

- `Strict-Transport-Security: max-age=...; includeSubDomains; preload` → forces HTTPS-only, prevents downgrade attacks.
- Cert validation checks: signature chain, hostname match, expiry.
- TLS terminates at load balancer/proxy — traffic behind it may be plaintext HTTP (internal network); be deliberate about this.

## CSP

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-<random>'; style-src 'self'
```

| Directive | Purpose |
|-----------|---------|
| `default-src` | Fallback for unlisted fetch directives |
| `script-src` | Allowed script origins |
| `style-src` | Allowed style origins |
| `img-src` | Allowed image origins |

| Anti-pattern | Why it's weak |
|--------------|---------------|
| `script-src 'unsafe-inline'` | Any injected `<script>` executes — defeats XSS defense |
| `default-src *` | No restriction at all |
| Static/hardcoded nonce | Attacker reads it from page source, reuses it |

Rollout: use `Content-Security-Policy-Report-Only` + `report-uri`/`report-to` before enforcing.

## OWASP core three

| Risk | Layer | Root cause | Fix |
|------|-------|-----------|-----|
| XSS | Frontend/output | Unescaped user input rendered as HTML/JS | Escape by default (React/Vue do this); sanitize (DOMPurify) before any raw-HTML render; CSP as defense-in-depth |
| CSRF | Cross-site request | Cookies auto-sent cross-site | CSRF tokens + `SameSite=Strict/Lax` cookies; never allow state changes via `GET` |
| SQL Injection | Backend/query | User input concatenated into query | Parameterized queries/prepared statements; allowlist for identifiers (column/table names, which can't be parameterized) |

### XSS types

| Type | Payload source |
|------|-----------------|
| Stored | Persisted in DB, served to all viewers |
| Reflected | Bounced back from request (e.g., search query) |
| DOM-based | Client JS writes untrusted data (URL/hash) into DOM — server never sees it |

### XSS vulnerable/fixed

```javascript
// VULNERABLE
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// FIXED
<div>{userInput}</div>  // React escapes by default
// or, if raw HTML is required:
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />
```

### SQLi vulnerable/fixed

```javascript
// VULNERABLE
db.query(`SELECT * FROM users WHERE username = '${username}'`);

// FIXED
db.query('SELECT * FROM users WHERE username = ?', [username]);
```

## Likely interview questions

**Q: Does CORS protect the server?**
A: No — it's browser-enforced and protects users by blocking JS from reading unauthorized cross-origin responses. The server still processes the request.

**Q: Why can't you combine `Access-Control-Allow-Origin: *` with credentials?**
A: Spec forbids it — wildcard + credentials would let any site read authenticated responses. Must return a specific, validated origin.

**Q: What does `SameSite=Lax` not protect against?**
A: Top-level `GET` navigations still send cookies cross-site, so state-changing actions must never be exposed via `GET`.

**Q: Why does `'unsafe-inline'` in CSP weaken security?**
A: It allows any inline `<script>` to run, including attacker-injected ones — defeating CSP's main XSS mitigation.

**Q: Difference between stored, reflected, and DOM-based XSS?**
A: Stored = persisted server-side; reflected = echoed immediately from a request; DOM-based = purely client-side, server never sees the tainted data.

**Q: Why are parameterized queries not enough for all SQL injection cases?**
A: They protect values, not identifiers (table/column names) — those need allowlisting since they can't be parameterized.

**Q: What does TLS actually guarantee?**
A: Encryption (confidentiality), integrity (tamper-evidence), and authentication (server identity via CA-signed cert).

**Q: What's HSTS for?**
A: Forces the browser to always use HTTPS for a domain, preventing SSL-stripping/downgrade attacks on the first request.

## Where this fits

Web Security Basics sits after Authentication Strategies and before Web Components / Type Checkers in the frontend roadmap.
