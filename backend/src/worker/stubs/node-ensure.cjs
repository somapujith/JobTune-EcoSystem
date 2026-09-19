// Replacement for node-ensure (ADR-001 spike S1). pdf.js v1.10.100 (bundled inside pdf-parse) does
//   require.ensure = require('node-ensure')
// node-ensure/package.json has "browser": {"./index.js": "./browser.js"}; wrangler resolves the browser field,
// and browser.js is `module.exports = function(){ require.ensure.apply(this, arguments) }` which, once assigned
// to require.ensure, calls itself forever -> "Maximum call stack size exceeded".
// This is the behaviour of the Node entry (index.js): run the callback asynchronously.
// Wired in backend/wrangler.toml [alias]. Copied from backend/spike/docs/stubs/ (proven there).
module.exports = function ensure(modules, callback) {
  (typeof setImmediate === 'function' ? setImmediate : (f) => setTimeout(f, 0))(callback);
};
