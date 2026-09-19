'use strict';

/**
 * WORKED EXAMPLE of a ported route module. NOT MOUNTED in createApp; it exists to be
 * copied, and tests/worker/exampleRoute.test.js keeps it working so it cannot rot.
 *
 * The Express original this imitates (shape of routes/atsCheckerV2.js + atsExport.js):
 *
 *   const router = express.Router();
 *   const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5*1024*1024 }, fileFilter });
 *   router.post('/v2/parse', auth, requirePlan(2), upload.single('resume'), async (req, res) => { ... });
 *   router.post('/export/docx', authenticateToken, async (req, res, next) => { ...; res.send(buffer) });
 *   module.exports = router;
 *
 * Checklist for every port (also in ../README.md):
 *   1. router = createRouter(); module.exports = router  (no other exports needed)
 *   2. same middleware, same ORDER, same requirePlan(n) numbers as the Express file
 *   3. every handler RETURNS its Response (a missing `return` is a silent 404/500)
 *   4. errors: `throw` instead of next(err); do not catch-and-mask, onError does that
 *   5. no process globals, no fs, no Express request-address property: config, db,
 *      services and the client IP all come from the context (getClientIp(c))
 *   6. response bodies and status codes byte-identical to the original
 *   7. mount in app.js with mountRoutes(app, '/api/<prefix>', router) in Express order
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { getServices } = require('../lib/context');
const { getDb } = require('../db');
const { getBody, getQuery } = require('../lib/http');
const { readUpload } = require('../lib/upload');

const router = createRouter();

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // preserve the original limit (5 MB here; resume.js used 10 MB)

// --- 1. Public route using an injected SERVICE (no auth) ---------------------------------
// Express:  router.get('/plans', async (req, res) => res.json(await planService.getAllPlans()))
router.get('/plans', async (c) => {
  const { planService } = getServices(c); // lazily built, request-scoped
  return c.json(await planService.getAllPlans());
});

// --- 2. Authenticated + plan-gated route using the DB directly and path/query params -----
// Express:  router.get('/items/:id', authenticateToken, requirePlan(1), async (req, res) => {...})
router.get('/items/:id', authenticateToken, requirePlan(1), async (c) => {
  const userId = c.get('user').id; //             req.user.id
  const id = c.req.param('id'); //                req.params.id
  const { verbose } = getQuery(c); //             req.query (querystring semantics)
  const result = await getDb(c).query(
    'SELECT id, title FROM items WHERE id = $1 AND user_id = $2', // always $n params
    [id, userId]
  );
  if (result.rows.length === 0) {
    return c.json({ error: 'Item not found' }, 404); // res.status(404).json({...})
  }
  return c.json(verbose ? { ...result.rows[0], verbose: true } : result.rows[0]);
});

// --- 3. JSON body ----------------------------------------------------------------------
// Express:  const { title } = req.body;   (req.body is undefined when there was no JSON body)
router.post('/items', authenticateToken, requirePlan(1), async (c) => {
  const { title } = getBody(c);
  if (!title) return c.json({ error: 'Title required' }, 400);
  const result = await getDb(c).query('INSERT INTO items (user_id, title) VALUES ($1, $2) RETURNING id', [
    c.get('user').id,
    title,
  ]);
  return c.json({ id: result.rows[0].id }, 201);
});

// --- 4. Multipart upload with size + mimetype checks (multer replacement) ---------------
// Express:  router.post('/v2/parse', auth, requirePlan(2), upload.single('resume'), handler)
// Auth and the plan gate run BEFORE the body is read, as multer did.
router.post('/upload', authenticateToken, requirePlan(2), async (c) => {
  const file = await readUpload(c, {
    field: 'resume',
    maxBytes: MAX_UPLOAD_BYTES,
    allowedMimeTypes: ALLOWED_TYPES,
  });
  if (!file) {
    return c.json({ status: 'error', message: 'No file uploaded' }, 400);
  }

  // file.buffer is a Uint8Array. Text example; real ports hand it to the (Workers-ready)
  // parsers from the doc-processing wave.
  const text = file.mimetype === 'text/plain' ? new TextDecoder().decode(file.buffer) : '';
  return c.json({ status: 'success', name: file.originalname, mimetype: file.mimetype, size: file.size, text });
});

// --- 5. Binary download (res.setHeader + res.send(buffer)) ------------------------------
// Express:  res.setHeader('Content-Type', ...); res.setHeader('Content-Disposition', ...);
//           res.send(docxBuffer);
router.get('/export.txt', authenticateToken, async (c) => {
  const bytes = new TextEncoder().encode('exported resume text\n');
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename="optimized-resume.txt"',
      'Content-Length': String(bytes.byteLength),
    },
  });
  // Middleware-set headers (security headers, CORS) are merged onto this Response by Hono.
});

// --- 6. File-level guard (Express: router.use(authenticateToken, requireAdmin)) ---------
// Use router.use('*', ...) BEFORE the routes it must protect, e.g. in an admin router:
//   router.use('*', authenticateToken, requireAdmin);
// It is intentionally not used here because it would guard the public /plans route above.

module.exports = router;
