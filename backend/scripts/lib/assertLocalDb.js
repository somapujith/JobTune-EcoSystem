'use strict';

/**
 * Safety guard for local-dev scripts that WRITE data (schema init, learning-topic import, the known-password test
 * user). backend/.env may point at the production Neon database, and these scripts would happily run against it:
 * create_test_user.js sets a publicly documented password on user@gmail.com and grants the top plan.
 *
 * Call right after `require('dotenv').config()`. Allows only local hosts (localhost, 127.0.0.1, ::1, the compose
 * service name "db"); anything else aborts unless ALLOW_REMOTE=1 is set explicitly. Prints the host only, never the URL.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'db']);

function targetHost() {
  const url = process.env.DATABASE_URL;
  if (url) {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }
  return process.env.DB_HOST || 'localhost';
}

function assertLocalDb(scriptName) {
  if (process.env.ALLOW_REMOTE === '1') return;
  const host = targetHost();
  if (host && LOCAL_HOSTS.has(host.toLowerCase())) return;
  console.error(
    `Refusing to run ${scriptName}: it writes data and the configured database host is not local (${host || 'unparseable DATABASE_URL'}).
` +
      'Point DATABASE_URL at the local compose database (see docs/SETUP.md), or set ALLOW_REMOTE=1 if you really mean it.'
  );
  process.exit(1);
}

module.exports = { assertLocalDb, LOCAL_HOSTS };
