// Cloudflare Workers entrypoint — STUB, not yet wired to the real app.
//
// This is scaffolding only. src/app.js (Express) cannot run in the Workers
// isolate runtime as-is — see ../../docs/CLOUDFLARE_MIGRATION.md for the
// full compatibility assessment and porting plan before building this out.
//
// Once ported, this file replaces src/server.js as the deploy entrypoint:
// Workers has no `app.listen()` — it exports a `fetch` handler that the
// Cloudflare runtime invokes per-request instead.

export default {
  async fetch(request, env, ctx) {
    return new Response(
      JSON.stringify({
        status: 'not_implemented',
        message: 'Cloudflare Workers entrypoint is scaffolding only — see docs/CLOUDFLARE_MIGRATION.md',
      }),
      { status: 501, headers: { 'Content-Type': 'application/json' } }
    );
  },
};
