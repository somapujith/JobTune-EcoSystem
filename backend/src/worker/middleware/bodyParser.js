'use strict';

/**
 * Body parsing equivalent to the two Express app-level parsers in app.js:
 *   app.use(express.json({ limit: '1mb' }))
 *   app.use(express.urlencoded({ extended: false, limit: '1mb' }))
 * (T1.3, ADR-001 section 7)
 *
 * The parsed body is stored as c.get('body') (read it with lib/http.js getBody(c)),
 * mirroring Express 5's parsed-body property:
 *   - `undefined` when the request has no body or a non-JSON/urlencoded content type
 *     (multipart uploads are NOT touched and are NOT subject to the 1 MB limit:
 *     the per-route 5 MB / 10 MB upload limits apply to them, ADR 6.6)
 *   - `{}` for an empty JSON body
 *   - the parsed value for JSON (body-parser "strict" mode: top level must be an
 *     object or array) or a null-prototype object for urlencoded (repeated keys
 *     become arrays)
 * Errors are thrown as objects with a `status`, so onError renders them the way the
 * Express errorHandler did:
 *   - body > 1 MiB  -> 413 {"error":"request entity too large"}
 *   - invalid JSON  -> 400 {"error":"<V8 JSON.parse message>"}  (Express leaked the same text)
 *
 *   - urlencoded body with more than 1000 pairs -> 413 {"error":"too many parameters"} (body-parser's parameterLimit;
 *     also what keeps the parser's CPU bounded)
 *
 * NOT replicated: 415 for non-UTF charsets, gzip/deflate request-body inflation.
 * None are used by the JobTune frontend.
 */
const { bodyLimit } = require('hono/body-limit');
const { HttpError } = require('../lib/errors');
const { parseFormEncoded, MAX_FORM_PAIRS } = require('../lib/http');
const { tagMiddleware } = require('../lib/tag');

const LIMIT_BYTES = 1024 * 1024; // '1mb' as understood by the `bytes` package

const FIRST_CHAR = /^[\x20\x09\x0a\x0d]*([^\x20\x09\x0a\x0d])/; // eslint-disable-line no-control-regex

function mediaType(contentType) {
  return (contentType || '').split(';')[0].trim().toLowerCase();
}

function hasBody(request) {
  // same test as type-is hasBody(): transfer-encoding present or numeric content-length;
  // additionally treat a request that exposes a body stream as having a body
  const te = request.headers.get('transfer-encoding');
  const cl = request.headers.get('content-length');
  return te !== null || (cl !== null && !Number.isNaN(Number(cl))) || request.body != null;
}

/**
 * body-parser's createStrictSyntaxError: build the message V8 would give for the
 * offending character by parsing a placeholder string, then put the real text back.
 */
function strictViolationMessage(text, char) {
  const index = text.indexOf(char);
  let partial = '';
  if (index !== -1) partial = text.substring(0, index) + '#'.repeat(text.length - index);
  try {
    JSON.parse(partial);
    return 'strict violation';
  } catch (e) {
    return e.message.replace(/#+/g, (placeholder) => text.substring(index, index + placeholder.length));
  }
}

function parseJson(text) {
  if (text.length === 0) return {};
  const match = FIRST_CHAR.exec(text);
  const first = match ? match[1] : undefined;
  if (first !== '{' && first !== '[') {
    throw new HttpError(400, strictViolationMessage(text, first), { type: 'entity.parse.failed' });
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new HttpError(400, e.message, { type: 'entity.parse.failed' });
  }
}

function bodyParser() {
  const limiter = bodyLimit({
    maxSize: LIMIT_BYTES,
    onError: () => {
      throw new HttpError(413, 'request entity too large', { type: 'entity.too.large' });
    },
  });

  const mw = async (c, next) => {
    const type = mediaType(c.req.header('content-type'));
    const isJson = type === 'application/json';
    const isForm = type === 'application/x-www-form-urlencoded';

    if ((!isJson && !isForm) || !hasBody(c.req.raw)) {
      return next();
    }

    return limiter(c, async () => {
      const text = await c.req.text();
      if (isForm && text.split('&').length > MAX_FORM_PAIRS) {
        throw new HttpError(413, 'too many parameters', { type: 'parameters.too.many' });
      }
      c.set('body', isJson ? parseJson(text) : parseFormEncoded(new URLSearchParams(text)));
      return next();
    });
  };

  return tagMiddleware(mw, 'bodyParser', { kind: 'body' });
}

module.exports = { bodyParser, LIMIT_BYTES };
