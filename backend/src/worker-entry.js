// Cloudflare Workers entrypoint for the JobTune API port (ADR-001, docs/migration/).
//
// This is the ONLY ES module in the Worker path. Everything under ./worker/ is
// CommonJS like the rest of the backend (so Jest can require it directly); wrangler's
// bundler (esbuild) resolves the CJS/ESM mix at build time.
//
// Status: all 41 Express route files are mounted (createApp({ mountSlices: true }) below; 184 endpoints plus the
// /admin page). Render (src/server.js) stays authoritative. Do not route production traffic here, and do not set
// JWT_SECRET / DATABASE_URL on the deployed Worker, until the ADR checklist passes (see the warning in wrangler.toml):
// without secrets every route fails closed; with them the public workers.dev URL serves the whole API unthrottled.
//
// The app is constructed once per isolate at module scope. That is safe: createApp()
// only builds the middleware chain and reads no environment. Secrets and vars arrive
// per request via `env` (see worker/config.js).

import workerApp from './worker/app.js';

const app = workerApp.createApp({ mountSlices: true });

// Last-resort guard: anything that escapes the app's own onError (for example a driver-level
// WebSocket failure such as Neon's "Network connection lost", which can surface as a rejection of
// fetch() itself) must not reach the client as the runtime's error page (a stack trace under
// `wrangler dev`, a bare 1101 page in production). Same masked body as middleware/errorHandler.
// The message is logged for operators; never the stack, never returned.
export default {
  async fetch(request, env, ctx) {
    try {
      return await app.fetch(request, env, ctx);
    } catch (err) {
      console.error('unhandled worker error:', err && err.message);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      });
    }
  },
};
