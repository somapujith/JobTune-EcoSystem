// E1 (static import) -- reproduces ADR 4.1 exactly: a module-scope process.env read + process.exit(1)
// guard (lines 5-9 of src/middleware/auth.js, extracted verbatim by run.mjs into generated-guard.mjs)
// that is loaded via a STATIC import, i.e. evaluated when the isolate starts, before any request.
//
// Outcomes this reveals:
//   - worker fails to start / every request errors  => process.exit at load kills or throws (ADR right)
//   - worker starts, guardResult.jwtSecretSeen=false => process.exit is a no-op AND module-scope env read is empty
//   - worker starts, jwtSecretSeen=true              => module-scope process.env sees the secret (ADR wrong)
import { guardResult } from './generated-guard.mjs';

export default {
  async fetch() {
    return new Response(JSON.stringify({ loaded: true, guardResult, typeofProcessExit: typeof process.exit }), {
      headers: { 'content-type': 'application/json' },
    });
  },
};
