'use strict';

/**
 * Jest setup (jest.config.js `setupFiles`): make the suite runnable on a fresh clone with no backend/.env, and keep
 * unit tests away from any real database.
 *
 * config/database.js throws at require time when neither DATABASE_URL nor DB_* is set, and several Express tests
 * load it transitively (they mock the pool, not the config). This only fills in a value when NONE is present. Because
 * dotenv never overrides an already-set variable, having this default set also means a developer's real backend/.env
 * (which may point at production) is not picked up by the test processes' `dotenv.config()` calls.
 * Port 1 is unroutable on purpose: a test that forgot to mock the pool fails fast instead of touching a database.
 */
if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
  process.env.DATABASE_URL = 'postgres://jest:jest@127.0.0.1:1/jest?sslmode=disable';
}
