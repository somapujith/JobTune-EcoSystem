'use strict';

/**
 * Harness for the tests that run the Worker's services against a REAL PostgreSQL (tests/worker/pg/*.test.js).
 *
 * They run only when the environment variable JT_VALIDATE_DB_URL is set; otherwise every suite is skipped.
 * These tests WRITE: they are refused unless the host is local (localhost / 127.0.0.1 / ::1 / db). All writes go to a
 * scratch schema that is created for the run and dropped afterwards; nothing outside it is touched.
 *
 * The scratch schema is built from the repository's own DDL, exactly what `check-schema.js --print-fix-sql` prints for
 * "everything the Worker needs" (Express boot DDL: initializeTables, runMigrations, sessionService, the per-route
 * module-load blocks, database.sql/migrations as the checker's model knows them).
 */
const path = require('path');
const crypto = require('node:crypto');
const { Pool, Client } = require('pg');

const URL_ENV = 'JT_VALIDATE_DB_URL';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'db']);
const BACKEND_DIR = path.resolve(__dirname, '..', '..', '..');

const dbUrl = () => process.env[URL_ENV] || '';
const enabled = () => !!dbUrl();
/** `describe` that skips cleanly when no database is configured. */
const describePg = (name, fn) => (enabled() ? describe : describe.skip)(name, fn);

function assertLocal(url) {
  let host;
  try { host = new URL(url).hostname; } catch (e) { throw new Error(`${URL_ENV} is not a URL`); }
  if (!LOCAL_HOSTS.has(host.toLowerCase())) {
    throw new Error(`refusing to run write tests against non-local host ${host}`);
  }
}

/** The executable statements that create everything the Worker needs (unique indexes and seeds included). */
function workerSchemaStatements() {
  const { buildResult, missingForFix } = require(path.join(BACKEND_DIR, 'scripts', 'migration', 'check-schema.js'));
  const { buildFixSql } = require(path.join(BACKEND_DIR, 'scripts', 'migration', 'schema', 'liveCheck.js'));
  const { model, resolved } = buildResult({ backendDir: BACKEND_DIR, useGit: false });
  return buildFixSql(model, missingForFix(resolved, null)).statements;
}

/**
 * Create a scratch schema and apply `statements` (default: the Worker's whole schema) into it.
 * Returns { name, url, newPool(), query(sql, params), drop() }. Every connection made through it has the scratch
 * schema as its only search_path entry, so unqualified table names in the services resolve there.
 */
async function createScratchSchema({ statements = null } = {}) {
  const url = dbUrl();
  assertLocal(url);
  const name = `jt_pg_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
  const options = `-c search_path=${name}`;
  const admin = new Client({ connectionString: url });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${name}`);
  const applied = [];
  try {
    const setup = new Client({ connectionString: url, options });
    await setup.connect();
    try {
      for (const st of statements || workerSchemaStatements()) {
        try {
          await setup.query(st);
          applied.push(st);
        } catch (e) {
          throw new Error(`scratch schema DDL failed: ${e.message}\n${st.slice(0, 200)}`);
        }
      }
    } finally {
      await setup.end();
    }
  } catch (e) {
    await admin.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`);
    await admin.end();
    throw e;
  }
  const pools = [];
  return {
    name,
    url,
    applied,
    /** A pool factory for createRequestDb (max 4 connections). */
    newPool: (max = 4) => {
      const p = new Pool({ connectionString: url, options, max });
      pools.push(p);
      return p;
    },
    async query(sql, params) { return admin.query(`SET search_path TO ${name}`).then(() => admin.query(sql, params)); },
    async drop() {
      for (const p of pools) { try { await p.end(); } catch (e) { /* already ended */ } }
      try { await admin.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`); } finally { await admin.end(); }
    },
  };
}

/** A request-scoped db (the real createRequestDb from src/worker/db.js) over a real pg.Pool in the scratch schema. */
function requestDb(schema, max = 4) {
  const { createRequestDb } = require(path.join(BACKEND_DIR, 'src', 'worker', 'db.js'));
  return createRequestDb(() => schema.newPool(max));
}

module.exports = { URL_ENV, enabled, describePg, assertLocal, createScratchSchema, requestDb, workerSchemaStatements, dbUrl };
