'use strict';

/**
 * Typed configuration failure (ADR-001 section 10: createConfig contract).
 *
 * Thrown by createConfig(env) when the Worker env binding is unusable
 * (missing / too-short JWT_SECRET, no env object). It replaces the Express-era
 * "log FATAL and hard-exit the process" behaviour, which cannot exist on Workers.
 *
 * Callers convert it to a masked 500 response (see app.js onError and
 * middleware/auth.js). The message names WHICH variable is wrong, never its value.
 */
class ConfigError extends Error {
  constructor(message, { missing } = {}) {
    super(message);
    this.name = 'ConfigError';
    this.code = 'CONFIG_ERROR';
    this.status = 500;
    if (missing) this.missing = missing;
  }
}

/**
 * Error carrying an HTTP status, mirroring the `err.status` convention that
 * Express route code and middleware/errorHandler.js rely on.
 * status >= 500 is masked as "Internal Server Error" by onError; 4xx messages
 * are returned to the client verbatim, exactly like the Express errorHandler.
 */
class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    Object.assign(this, extra);
  }
}

module.exports = { ConfigError, HttpError };
