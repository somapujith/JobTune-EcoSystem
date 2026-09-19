# Rate limiting on the Worker (ADR-001 section 4.4, task T1.9)

**Status: CONFIG ONLY. Nothing is deployed, no Cloudflare account state was changed, and rate limiting is
currently ABSENT on the Worker.** `express-rate-limit` is deliberately not ported. The Express app keeps
rate limiting on Render until the Worker replacement is provisioned *and verified by being throttled*
(ADR checklist item 18). Do not flip any prefix that includes `/api/auth` to the Worker before that.

## 1. What is being replaced (backend/src/app.js at git HEAD 38d8130a)

| Limiter | Scope | Window | Max | 429 body |
|---|---|---|---|---|
| `apiLimiter` | all `/api/*` (every request, keyed by IP) | 15 min | 100 (500 when `NODE_ENV=development`) | `{"error":"Too many requests, please try again later."}` |
| `authLimiter` | `/api/auth/*` (counts in addition to `apiLimiter`) | 15 min | 20 | `{"error":"Too many authentication attempts, please try again later."}` |

Both use `standardHeaders: true` (draft `RateLimit-*` response headers) and no legacy headers. Keying is
`express-rate-limit`'s default (`req.ip`).

## 2. Constraints that shape the design (read before choosing)

1. **The Workers Rate Limiting binding cannot express "N per 15 minutes".** Verified from the installed
   wrangler 4.131.2 config validator: a `[[ratelimits]]` entry takes `name`, `namespace_id` (string) and
   `simple = { limit, period }` where **`period` must be 10 or 60 (seconds)**. It is a burst limiter, not a
   windowed quota. Any config below is an approximation of Express, not a reproduction.
2. **Cloudflare WAF rate-limiting rules almost certainly do not apply to this Worker today.** They are zone
   features; the Worker is reached as `jobtune-ecosystem.somapujith.workers.dev` (via the Vercel rewrite),
   a hostname you do not control as a zone. They become an option only if the API is served on a custom
   domain proxied by Cloudflare. Their available periods and rule counts also depend on the Cloudflare plan
   (short periods on lower plans). Verify against the current Cloudflare docs before relying on them;
   this was not checked online.
3. **The key problem is the same as ADR 4.2 / checklist item 7.** Traffic arrives through Vercel's rewrite
   proxy. If `CF-Connecting-IP` is Vercel's egress IP rather than the user's, a per-IP key is shared by
   many users (everyone is throttled together, or, if egress IPs are numerous, limiting is diluted). This
   must be measured on the real proxy chain. Until then no per-IP limit on the Worker can be trusted.
4. **Binding semantics are approximate by design** (per Cloudflare's description: counters are local to a
   Cloudflare location and eventually consistent; it is intentionally permissive). Treat it as flood/abuse
   damping, not as an exact quota. It is weaker than Express's single-instance exact counter in some ways
   (multiple locations) and stricter in others (bursts).

## 3. Recommended configuration (config only)

Add to `backend/wrangler.toml` (also present as a commented block there). `namespace_id` values are arbitrary
strings, unique per Cloudflare account:

```toml
[[ratelimits]]
name = "API_LIMITER"
namespace_id = "1001"
simple = { limit = 100, period = 60 }

[[ratelimits]]
name = "AUTH_LIMITER"
namespace_id = "1002"
simple = { limit = 5, period = 60 }
```

Both names are what `src/worker/middleware/rateLimit.js` looks up (`env.API_LIMITER`, `env.AUTH_LIMITER`).
The middleware calls `binding.limit({ key: <CF-Connecting-IP> })` and answers `429` with the Express-identical
JSON body when `success` is false. **This exact config was exercised against local workerd
(`wrangler dev --local`)**: with `AUTH_LIMITER = 5/60`, requests 1 to 5 from one IP returned 200, requests 6 to 8
returned 429 with the auth message, and a second IP was unaffected. That shows the binding shape and code
path work; it does NOT show anything about Cloudflare's production counters or the Vercel IP question.

Why these numbers (state of the approximation):

| Binding | Express | Configured | Sustained ceiling per key | Comment |
|---|---|---|---|---|
| `AUTH_LIMITER` | 20 / 15 min | 5 / 60 s | up to 75 / 15 min | Blocks bursts and fast brute force; a legitimate user typing a wrong password 3 times in a minute is not blocked. About 3.75x looser than Express over a sustained 15 minutes. `2 / 60` would give 30 / 15 min (closest above 20) but blocks a user who mistypes three times quickly. |
| `API_LIMITER` | 100 / 15 min | 100 / 60 s | up to 1500 / 15 min | Flood damping only. It never blocks anything Express would have allowed in a minute. It does NOT reproduce 100 / 15 min. |

If exact fidelity for login matters, the ADR's option 3 is correct: a Durable Object fixed-window counter
keyed by IP (or IP + email) for `/api/auth/login` only. That is a post-cutover hardening item, not part of this
config, and it is the way to get a true 20 / 15 min.

Apply `authRateLimit()` where the auth routes are mounted (wave 3A):

```js
app.use('/api/auth/*', authRateLimit());
mountRoutes(app, '/api/auth', authRoutes);
```

`apiRateLimit()` is already mounted on `/api/*` in `createApp`.

## 4. Optional: zone-level rule if a custom domain is ever used

Only relevant once the API is served from a Cloudflare-proxied custom domain. Rule shape, to be adapted to the
plan's allowed period and rule count:

* Expression: `starts_with(http.request.uri.path, "/api/auth")`
* Characteristic: IP (or `cf.colo.id` + IP on plans that need it)
* Requests per period: as close to 20 per the longest period the plan allows (15 minutes is not available on
  most plans; verify)
* Action: Block (429), with the plan's minimum mitigation timeout
* A second, broader rule for `/api` at ~100 per the longest allowed period

Custom 429 JSON body via a rule response override, if the plan allows, to match the Express bodies above.
Not configured; not verified.

## 5. Alternative worth evaluating: rate limit in front of the Worker

Because production traffic enters through Vercel, a Vercel Firewall rate-limit rule on `/api/auth` would see
the real end-user IP before the rewrite. Whether it is available on the current Vercel plan, and its
windows and counts, were not verified here. It sidesteps the shared-egress-IP problem in section 2.3.

## 6. Verification required before the auth prefix moves (ADR checklist item 18)

1. Deploy the bindings (not done). Send more than 5 `POST /api/auth/login` requests in a minute from one
   client **through the real Vercel path** and confirm a 429 with the Express body, and that a second client
   on a different network is not throttled (this also settles the shared-egress-IP question).
2. Confirm `RateLimit-*` headers are not required by the frontend (Express sent them; this middleware does not).
3. Watch Workers logs for `rate limiting is NOT active: no <BINDING> binding configured`: that warning is the
   only signal that the limiter is missing.
4. Decide whether a binding error should fail open (current behaviour, logged) or closed for `/api/auth`.

## 7. What was and was not done

Done: analysis, the exact binding config above, the enforcement seam in code (inert without the binding), a
Jest test of the seam with a fake binding, a local-workerd check of the binding config and 429 path.
Not done: provisioning anything, deploying, any Cloudflare API or dashboard change, any check of Cloudflare
plan limits, any measurement through Vercel.
