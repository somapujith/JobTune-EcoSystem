# Wave notes: `docs` slice (uploads and document generation, ADR-001 6.6 / wave 3G)

Ports `/api/resume` (`routes/resume.js` then `routes/resumeV2.js`, Express order) and `/api/ats` (`routes/atsExport.js`
then `routes/atsCheckerV2.js`), plus the services `resumeExport`, `v2/resumeExportEngine` and `resumeDatabase`.
Render (Express) is untouched. Nothing was deployed; no secret, account or production access was used.

## What was ported

| Express | Worker (`backend/src/worker/`) | Endpoints |
|---|---|---|
| `routes/resume.js` | `routes/resume.js` | 8 (`POST /upload`, `GET /list`, `GET /scores`, `GET /:id`, `DELETE /:id`, `POST /tune`, `POST /ai-edit`, `POST /build`), all auth only |
| `routes/resumeV2.js` | `routes/resumeV2.js` | 5 (`POST /v2/analyze`, `/v2/feedback`, `/v2/export` all auth + `requirePlan(2)`; `GET /v2/history`, `GET /v2/:resumeId` auth) |
| `routes/atsExport.js` | `routes/atsExport.js` | 3 (`POST /export/docx`, `POST /export/txt`, `GET /history`), auth only |
| `routes/atsCheckerV2.js` | `routes/atsCheckerV2.js` | 1 (`POST /v2/parse`, auth + `requirePlan(2)`) |
| `services/resumeDatabase.js` | `services/resumeDatabase.js` | `createResumeDatabase({ db })` |
| `services/resumeExport.js` | `services/resumeExport.js` | `createResumeExport()` |
| `services/v2/resumeExportEngine.js` | `services/v2/resumeExportEngine.js` | `createResumeExportEngine()` |

Registry (`services/registry/docs.js`): `resumeDatabase`, `resumeExport`, `resumeExportEngine`. Mount
(`routes/mounts/docs.js`): `/api/resume` <- resume, resumeV2; `/api/ats` <- atsExport, atsCheckerV2. The pure analyzers
(`resumeAnalysisEngine`, `resumeCriticEngine`) are read from `getServices(c)` (infra slice; original static
`analyze` / `generateQuickFeedback` API). `aiClient.callAI` comes from `getServices(c)` too.

Slice-local helper files (not in the brief's file list, all under a directory only this slice uses):
`services/docs/docLibs.js` (the only place that names the heavy libraries, lazy `await import()`),
`services/docs/pdfParse.js` (pinned pdf.js v1.10.100 wrapper), `services/docs/docText.js` (mammoth / UTF-8 / base64
helpers), `services/docs/multipart.js` (`readMultipart`, see below). Stubs: `stubs/aws-sdk-client-s3.mjs`,
`stubs/node-ensure.cjs` (copied from `backend/spike/docs/stubs/`). `backend/wrangler.toml`: added the `[alias]` section
only (`@aws-sdk/client-s3` and `node-ensure` stubs, `pdfkit` -> `./node_modules/pdfkit/js/pdfkit.standalone.js`);
`[observability]` and the commented `[[ratelimits]]` block are unchanged.

## Verification actually run

1. **Jest** (`npx jest tests/worker/docs --coverage=false`): 9 suites, 181 tests, all green. `tests/worker` as a whole
   (109 suites, 4199 tests) and `tests/worker/sourceTree.test.js` were green at the end of the session.
   * `parity.test.js` (36 tests) is a **differential test against the real Express code**: the original
     `resume.js`, `resumeV2.js`, `atsCheckerV2.js`, `atsExport.js` (read from `src/`, evaluated in-process, never
     modified) run behind a real `express()` with the real multer, body parsers, `errorHandler`, real
     `resumeExport` / `resumeDatabase` / v2 analyzers; `config/database.js`, auth, `requirePlan` and `aiClient` are stubbed
     (the loader refuses to load anything else under `src/config/`). The same HTTP request goes to both sides, each with an
     identically seeded fake db; status, JSON body, download headers and resulting rows are compared. It surfaced two real
     differences during the session: multer's exclusive size limit and the Buffer / Uint8Array pdf.js defect (deviation 2).
   * Not proven by Jest: SQL against Postgres, Neon, workerd, real `authenticateToken` / `requirePlan` on the Express side
     (Worker-side gating is asserted per route: 401, 403 `PLAN_UPGRADE_REQUIRED` shape, ok at threshold).
2. **Real `wrangler dev --local` (workerd, wrangler 4.131.2)** with the real `backend/wrangler.toml` (so the real `[alias]`
   section was exercised) and a throwaway entry `backend/.wrangler/tmp-docs/entry.mjs` that mounts only this slice's routers
   through `routes/mounts/docs.js`, the real registry, a fake db, the pure v2 analyzers, port 8790, a per-run random
   synthetic JWT secret (temp env file, deleted after the run), the spike fixtures (`backend/spike/docs/fixtures/`: 7 + 2
   pdfkit PDFs, 17 DOCX of which 12 are real Word / LibreOffice-authored files, plus the text / markdown inputs). **96/96 checks passed**
   (`.wrangler/tmp-docs/run.mjs`, results in `results.json`):
   * `POST /api/ats/v2/parse`: extracted text **equals the Node reference** (`pdf-parse` fed a Uint8Array; `mammoth` `{ buffer }`)
     for 9/9 PDFs (the blank one answers 400 like Express) and 17/17 DOCX, plus 2 text files; 9 PDFs in parallel x 2 rounds equal too.
   * `POST /api/resume/v2/analyze` (PDF, DOCX, JSON): the v2 analyzers give the same scores / overall score as Node.
   * Downloads: `POST /api/resume/v2/export` pdf / txt / docx-quirk, `POST /api/ats/export/docx|txt`, `POST /api/resume/build`
     and `/tune` (base64 output): generated PDFs start `%PDF-`, end `%%EOF`, re-parse; the pdf text equals the Node
     `ResumeExportEngine` PDF's text; the ATS DOCX is a valid zip whose **every entry equals Node `ResumeExport.toDOCX`** (dates
     masked); headers are `Content-Type` / `Content-Disposition` exactly as Express (txt/docx checked byte-for-byte; see the
     Content-Length note below).
   * Gating (tier 1 user -> 403 `PLAN_UPGRADE_REQUIRED` with `requiredPlan`/`currentPlan`, no token -> 401, tier 2 -> 200) on all four
     `requirePlan(2)` endpoints; upload limits (5 MB - 1 ok, 5 MB and 5 MB + 1 masked 500, disallowed type masked 500, wrong field name
     masked 500, no file 400, non-ASCII file name latin1-mangled like multer).
   * Local wall times (client side; local workerd enforces no CPU limit): PDF parse median 14 ms (first request 140 ms, cold pdf.js init),
     DOCX parse 14 ms, PDF export 12 ms, `/tune` docx 71 ms / pdf 134 ms, 9 parallel PDF parses about 190 ms each.
3. **`wrangler deploy --dry-run`** (never deployed): the real production entry `src/worker-entry.js` with the real
   `backend/wrangler.toml` builds: **10162 KiB raw / 1869.6 KiB gzip** (the Free limit is 3 MB gzip, Paid 10 MB). A copy of `src/` with this
   slice's mount and registry emptied builds at 2555 KiB / 569.6 KiB, so this slice adds about **7.4 MiB raw / 1.29 MiB gzip** (spike:
   1.38 MiB gzip). The other three pdf.js versions are absent from the bundle, and the bundle contains **zero** references to
   `initializeTables|runMigrations|ensureTables` (grep of the built file).
4. Manifest checker: `generate-worker-manifest.js --only-prefix /api/resume --only-prefix /api/ats` -> 17 endpoints, 17 auth, 4 plan-gated (all tier 2);
   `compare-manifests.js` against `manifest.render.json` for those prefixes: **PASS, 0 critical / error / warn / info**. A jest test
   (`mounts.test.js`) asserts the same against the manifest, including registration order.

All wrangler / workerd processes started for this were killed (verified: nothing listening on 8790 / 9790, no process with `tmp-docs`
in its command line). Nothing outside `backend/.wrangler/tmp-docs/` (gitignored) was created for the runtime proof.
To repeat: `cd backend && node .wrangler/tmp-docs/run.mjs` (needs the spike fixtures; regenerate with `node spike/docs/make-fixtures.mjs`).

## How the spike requirements were applied

* `pdf-parse` -> `services/docs/pdfParse.js`: verbatim port of `pdf-parse/lib/pdf-parse.js` that imports only
  `pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js` (avoids the 4-version glob, about 8 MB raw) and always passes a private plain `Uint8Array`.
* `mammoth.extractRawText({ arrayBuffer })` (never `{ buffer }`): `docText.extractDocxRawText`.
* `pdfkit` standalone alias, `node-ensure` and `@aws-sdk/client-s3` stubs: `wrangler.toml [alias]` (proven again by the run above:
  pdf.js and pdfkit work only because of them). `unzipper` / `xml2js` / `fileParser.js` are not used by any route (`utils/fileParser.js` has
  no caller in `src/`) and were not ported; the `@aws-sdk/client-s3` alias is kept because the brief asks for it and it costs nothing.
* Lazy loading: pdf.js, mammoth, pdfkit and docx are loaded with `await import()` inside `services/docs/docLibs.js` from handler / service
  code only. Jest cannot run dynamic `import()`, so tests replace that one module with `jest.mock` + `require()` of the same libraries
  (`tests/worker/docs/helpers/realDocLibs.js`; its mammoth shim maps `{ arrayBuffer }` onto the Node build, which only understands `{ buffer }`).
  A test asserts no other file in the slice names a doc library or calls `import()`.

## Deviations forced by the platform or by the port (each one deliberate)

1. **Multipart text fields.** `lib/upload.js` `readUpload` returns only the file, but Express `req.body` also carried the multipart text fields
   (`/tune` needs `jobDescription` + `outputFormat`; `/v2/analyze` reads `resumeText` when no file is sent; `/upload` reads `fileName`).
   `services/docs/multipart.js` `readMultipart` wraps `readUpload` unchanged, captures the parsed `FormData` and returns `{ file, fields }`.
   It also restores three multer behaviours `readUpload` does not model (all masked 500s like every multer error): the size limit is **exclusive**
   (multer 2.1.1 rejects a file of exactly 5 / 10 MB; `readUpload` accepts it), a file part under another field name (or a second file) is
   `LIMIT_UNEXPECTED_FILE`, and non-ASCII file names are latin1-mangled (see preserved bugs).
2. **PDF parsing now succeeds on documents Render cannot parse.** Render called `pdf-parse(req.file.buffer)` with multer's Node `Buffer`;
   pdf.js v1.10.100 throws `bad XRef entry` on some documents given a Node `Buffer` (data-dependent: pdfkit PDFs of about 3.5, 5.4 and 9.2 KB failed
   while 1.5 and 16.8 KB parsed; spike finding 6, root cause not established). The same bytes as a `Uint8Array` always parse. The Worker uses a
   `Uint8Array` (spike S1), so `/api/ats/v2/parse` and `/v2/analyze` succeed where Render answered 500 / 400, and `/upload` / `/tune` score the
   real text where Render fell back to scoring the raw PDF bytes. Not replicable and not desirable. **Worth checking on Render whether real
   resumes are hit.** The Express reference in `parity.test.js` deliberately feeds `pdf-parse` a `Uint8Array` so the differential tests the routes, not this defect;
   the defect itself is pinned in the last test of that file.
3. `Content-Length` on text downloads: workerd (and the Cloudflare edge) compress `text/plain` responses for clients that send `Accept-Encoding`, which
   replaces `Content-Length` by `Content-Encoding` (observed in `wrangler dev`). The route still sets `Content-Length` explicitly (as Express did); PDF and DOCX
   responses keep it. The decoded body is byte-identical. No weak `ETag`, JSON without `; charset=utf-8` (README section 4).
4. `Date.now()` does not advance inside workerd during CPU-bound work, so `analysis.processingTimeMs` is about 0 (cosmetic).
5. Error text for a request with no JSON body: `const { x } = body` throws a V8 TypeError whose message names the expression (`... of 'getBody(...)' ...` instead of
   `... of 'req.body' ...`). It is echoed in the `details` field of the four resumeV2 routes' own 500 shapes. Status and shape identical; only reachable without a JSON body.
6. `resumeExport.buildDocumentParagraphs` / `createSectionHeader` are async (the `docx` library is loaded lazily); nothing calls them outside `toDOCX`.
7. Dead code not ported: `resume.js` module-load DDL (ADR 6.5), the unused `titleCase`, the unused `extractJSON` import, the unused `lineHeight`; `resumeExport.js` `fs` / `path`
   imports (ADR 4.3.2); `resumeExportEngine.js` `require('stream')` and `Readable.from([])`.
8. On an export failure Express answered with a stale `Content-Disposition: attachment` header already set on the JSON error response (headers were set before the
   failing `saveExport` await). The Worker builds the `Response` last, so the error response is a plain masked-500 JSON without it. The header cannot be
   reproduced from a route without bypassing the global `onError`; no client-visible function depends on it.

## Preserved pre-existing bugs (ADR 4.3: not fixed)

* `POST /api/resume/v2/analyze` **never persists anything**: the persist step reads `analysis.analysis.keywords.keywords`, but the engine's `analysis` object has no
  `keywords` key, so a TypeError is swallowed by the inner catch and `resumeId` is always `null` (`ResumeDatabase.saveResume` is never reached). Therefore
  `GET /v2/history`, `GET /v2/:resumeId` and the `/api/ats/export/*` routes only ever see rows written by other means. Identical on both sides in `parity.test.js`.
* `POST /v2/export` with `format: "docx"` returns the plain text under the DOCX mime type (the engine's own comment admits it).
* `resumeExport.parseResume`: un-anchored section patterns (any body line containing "experience", "skills", "summary" ... starts a new section and is dropped),
  everything before the first recognised header is dropped, and paragraph options such as `bold` / `size` / `color` are ignored by docx at paragraph level.
* `extractText` has no DOCX branch: `/upload` scores an empty string for DOCX / msword and `/tune` answers 422 for them. A corrupt PDF falls back to its raw bytes as text.
* `atsScore` in `/tune` and `/build` is clamped to at least 90.
* multer decodes multipart file names as latin1, so non-ASCII names ("resume" with accents) are stored / echoed as mojibake in `resumes.file_name` and `/v2/parse`
  `fileName`. Reproduced on purpose (`MULTER_LATIN1_FILENAMES = true` in `services/docs/multipart.js`, verified against real multer) so new and existing rows agree;
  flip it in the post-cutover fix PR.
* multer's size limit is exclusive, an off-by-one nobody would design, kept (see deviation 1).
* `GET /api/resume/v2` (one segment) is captured by `GET /:id` (id = "v2") and answers whatever the id lookup answers (a DB error on Render); routing order preserved.
* `POST /v2/export` with `format: null` throws (`null.toLowerCase()`) and answers 500 "Export failed"; a `resumeText` under 100 characters is "Export validation failed" (500).
* Upload errors (wrong type, too large, unexpected field) are masked 500s, not 400 / 413, on both sides.

## Needs orchestrator action or a decision

* **infra slice must register** `resumeAnalysisEngine` and `resumeCriticEngine` with the original static API (`analyze(text, fileContent)`, `generateQuickFeedback(analysis)`);
  until then `/v2/analyze` and `/v2/feedback` answer their own 500 "Resume analysis failed" / "Feedback generation failed" (the tests and the runtime run inject the
  original modules) and `/api/resume/ai-edit` needs `getServices(c).aiClient.callAI`.
* Config: no change needed (`LM_STUDIO_MODEL_RESUME` is already in `PASSTHROUGH_VARS`).
* `lib/upload.js` `readUpload`: (a) accepts a file of exactly `maxBytes` while multer rejected it (compensated in `readMultipart`); (b) drops multipart text fields (worked
  around by `readMultipart`). If you fix (a) in the lib, the wrapper's extra check becomes a no-op.
* Packages: none to install (`pdf-parse`, `pdfkit`, `docx`, `mammoth`, `jszip` already declared; `jszip` is only used by tests).
* Plan: document routes need the Workers **Paid** plan (spike: 24-180 ms per document operation; local `wrangler dev` does not enforce CPU limits, so real CPU time is unmeasured).

## Not verified (do not read the green tests as evidence for these)

* Behaviour on the deployed runtime and CPU time / memory limits there (a 5-10 MB PDF is buffered several times: the request `FormData`, the `Uint8Array`, the pdf.js copy).
* SQL against real Postgres / Neon (`resumes`, `resume_embeddings`, `resume_exports` statements are copied verbatim, but the fake db only matches whole statements), the Neon driver's
  `rowCount` / JSONB / `TIMESTAMP` typing for the `resumes` rows returned to clients, and that the `resumes` table has every column the Express boot DDL added.
* A generated DOCX opening in Microsoft Word / a browser downloading a file (only structure, XML well-formedness and text were checked); real resume PDFs (only synthetic pdfkit and
  Word / LibreOffice DOCX fixtures were available; there are no real resume PDFs in the repo).
* Uploads through the Vercel rewrite in front of the Worker (body size limits of the proxy for 5 / 10 MB uploads are untested).
* `authenticateToken` / `requirePlan` against real tokens and plans (foundation tests only); the Express side of the differential stubs them.
