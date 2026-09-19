#!/usr/bin/env node
/**
 * One-shot data migration: Supabase (source) -> Neon (target).
 *
 * Usage:
 *   SOURCE_DATABASE_URL="postgresql://..." TARGET_DATABASE_URL="postgresql://..." \
 *     node scripts/migrate-to-neon.js
 *
 * Required env vars (no hardcoded credentials in this file):
 *   SOURCE_DATABASE_URL  - the OLD Supabase connection string.
 *                          Documented default shape (NOT a real value, must be supplied by caller):
 *                          postgresql://postgres.<project-ref>:<password>@<pooler-host>:6543/postgres
 *   TARGET_DATABASE_URL  - the NEW Neon connection string, e.g.
 *                          postgresql://<user>:<password>@<host>/<db>?sslmode=require&channel_binding=require
 *
 * What this script does:
 *   1. Validates both env vars are present (exits with a clear error if not).
 *   2. Points the app's shared DB config (src/config/database.js) at the Neon target by
 *      temporarily setting process.env.DATABASE_URL = TARGET_DATABASE_URL, then requires
 *      initializeTables.js + runMigrations.js so the target schema is created idempotently
 *      (same as a normal server startup would do).
 *   3. Opens a second, independent pg Pool pointed at the source Supabase DB.
 *   4. Introspects information_schema for all base tables in the `public` schema on the
 *      source DB, topologically sorted by FK dependency (parents before children) so
 *      inserts don't violate foreign keys.
 *   5. For each table, copies all rows from source -> target in batches of 500 using
 *      parameterized INSERT ... ON CONFLICT DO NOTHING statements.
 *   6. Verifies row counts (source vs target) per table.
 *   7. Resets SERIAL/IDENTITY sequences on the target so future inserts don't collide.
 *   8. Prints a final summary and exits 0 on full success, 1 on any error/mismatch.
 */

'use strict';

const SOURCE_URL = process.env.SOURCE_DATABASE_URL;
const TARGET_URL = process.env.TARGET_DATABASE_URL;

if (!SOURCE_URL) {
  console.error(
    '\n[migrate-to-neon] ERROR: SOURCE_DATABASE_URL is not set.\n' +
    'Set it to the OLD Supabase connection string, e.g.:\n' +
    '  export SOURCE_DATABASE_URL="postgresql://postgres.<project-ref>:<password>@<pooler-host>:6543/postgres"\n'
  );
  process.exit(1);
}

if (!TARGET_URL) {
  console.error(
    '\n[migrate-to-neon] ERROR: TARGET_DATABASE_URL is not set.\n' +
    'Set it to the NEW Neon connection string, e.g.:\n' +
    '  export TARGET_DATABASE_URL="postgresql://<user>:<password>@<host>/<db>?sslmode=require&channel_binding=require"\n'
  );
  process.exit(1);
}

const { Pool } = require('pg');

const BATCH_SIZE = 500;

// ---------------------------------------------------------------------------
// Step 1: point the app's shared pool at Neon and run schema setup.
// initializeTables.js and runMigrations.js both do:
//   const { pool } = require('../config/database');
// and database.js builds its Pool from process.env.DATABASE_URL at require-time.
// So we set DATABASE_URL before requiring any of these modules, ensuring the
// *shared* app pool (used only for schema setup here) targets Neon, not Supabase.
// ---------------------------------------------------------------------------
process.env.DATABASE_URL = TARGET_URL;

const { pool: targetSchemaPool } = require('../src/config/database');
const { initializeTables } = require('../src/utils/initializeTables');
const { runMigrations } = require('../src/utils/runMigrations');

// Independent pools for the actual data copy. We reuse targetSchemaPool as the
// target data pool (it's already correctly configured against Neon) and open a
// fresh pool against the source Supabase DB.
const sourcePool = new Pool({
  connectionString: SOURCE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000
});

const targetPool = targetSchemaPool;

function log(msg) {
  console.log(`[migrate-to-neon] ${msg}`);
}

/**
 * Fetch all base tables in the public schema on the source DB.
 */
async function getSourceTables() {
  const { rows } = await sourcePool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  `);
  return rows.map(r => r.table_name);
}

/**
 * Fetch FK dependency edges among the given tables: { child -> [parents] }.
 * Uses information_schema.table_constraints + constraint_column_usage to find,
 * for each FK on a child table, which table it references.
 */
async function getForeignKeyEdges(tableNames) {
  const { rows } = await sourcePool.query(`
    SELECT
      tc.table_name AS child_table,
      ccu.table_name AS parent_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
      AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
  `);

  const edges = new Map(); // child -> Set(parents)
  for (const name of tableNames) edges.set(name, new Set());

  for (const row of rows) {
    const child = row.child_table;
    const parent = row.parent_table;
    if (!edges.has(child)) edges.set(child, new Set());
    if (child !== parent && tableNames.includes(parent)) {
      edges.get(child).add(parent);
    }
  }

  return edges;
}

/**
 * Topologically sort tables so parents (referenced tables) come before children
 * (tables with FKs pointing at them). Falls back to appending any table involved
 * in a cycle at the end, in original order, rather than throwing — real-world
 * schemas can have self-references or awkward cycles we still want to attempt.
 */
function topologicalSort(tableNames, edges) {
  const visited = new Set();
  const visiting = new Set();
  const ordered = [];
  const cyclic = [];

  function visit(name) {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      cyclic.push(name);
      return;
    }
    visiting.add(name);
    const parents = edges.get(name) || new Set();
    for (const parent of parents) {
      if (parent !== name) visit(parent);
    }
    visiting.delete(name);
    visited.add(name);
    ordered.push(name);
  }

  for (const name of tableNames) visit(name);

  // Ensure any table not reached (shouldn't happen) is still included.
  for (const name of tableNames) {
    if (!ordered.includes(name)) ordered.push(name);
  }

  if (cyclic.length > 0) {
    log(`WARNING: FK cycle detected involving: ${[...new Set(cyclic)].join(', ')} (best-effort order used)`);
  }

  return ordered;
}

/**
 * Get column names for a table (in a stable order) from the source DB.
 */
async function getColumns(tableName) {
  const { rows } = await sourcePool.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
    `,
    [tableName]
  );
  return rows.map(r => r.column_name);
}

/**
 * Get the primary key column names for a table, used for ON CONFLICT target.
 */
async function getPrimaryKeyColumns(tableName) {
  const { rows } = await sourcePool.query(
    `
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = $1
    ORDER BY kcu.ordinal_position
    `,
    [tableName]
  );
  return rows.map(r => r.column_name);
}

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Copy all rows of one table from source to target in batches.
 * Returns { copied, sourceCount, targetCountAfter }.
 */
async function copyTable(tableName, columns, pkColumns) {
  const quotedTable = quoteIdent(tableName);
  const quotedCols = columns.map(quoteIdent).join(', ');

  const countResult = await sourcePool.query(`SELECT COUNT(*)::bigint AS count FROM ${quotedTable}`);
  const sourceCount = Number(countResult.rows[0].count);

  if (sourceCount === 0) {
    log(`  ${tableName}: 0 rows in source, nothing to copy`);
    return { copied: 0, sourceCount };
  }

  const conflictClause =
    pkColumns.length > 0
      ? `ON CONFLICT (${pkColumns.map(quoteIdent).join(', ')}) DO NOTHING`
      : 'ON CONFLICT DO NOTHING';

  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const insertSql = `INSERT INTO ${quotedTable} (${quotedCols}) VALUES (${placeholders}) ${conflictClause}`;

  let offset = 0;
  let totalCopied = 0;

  // Cursor-style batching via LIMIT/OFFSET ordered by primary key (or unordered
  // if no PK) — acceptable for a one-shot migration on tables of this size.
  const orderClause = pkColumns.length > 0 ? `ORDER BY ${pkColumns.map(quoteIdent).join(', ')}` : '';

  while (offset < sourceCount) {
    const { rows } = await sourcePool.query(
      `SELECT ${quotedCols} FROM ${quotedTable} ${orderClause} LIMIT ${BATCH_SIZE} OFFSET ${offset}`
    );

    if (rows.length === 0) break;

    const client = await targetPool.connect();
    try {
      await client.query('BEGIN');
      for (const row of rows) {
        const values = columns.map(col => row[col]);
        await client.query(insertSql, values);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    totalCopied += rows.length;
    offset += BATCH_SIZE;
    log(`  ${tableName}: copied ${Math.min(offset, sourceCount)}/${sourceCount} rows`);
  }

  return { copied: totalCopied, sourceCount };
}

/**
 * Reset the SERIAL/IDENTITY sequence for a table's primary key column (if the
 * PK is a single integer column backed by a sequence) so future inserts on
 * Neon don't collide with the copied IDs.
 */
async function resetSequence(tableName, pkColumns) {
  if (pkColumns.length !== 1) return; // only handle simple single-column PKs
  const pkCol = pkColumns[0];
  const quotedTable = quoteIdent(tableName);

  try {
    const seqResult = await targetPool.query('SELECT pg_get_serial_sequence($1, $2) AS seq', [tableName, pkCol]);
    const seqName = seqResult.rows[0] && seqResult.rows[0].seq;
    if (!seqName) {
      return; // not a serial/identity column, nothing to reset
    }

    await targetPool.query(
      `SELECT setval($1, COALESCE((SELECT MAX(${quoteIdent(pkCol)}) FROM ${quotedTable}), 1), true)`,
      [seqName]
    );
    log(`  ${tableName}: sequence ${seqName} reset`);
  } catch (err) {
    log(`  ${tableName}: sequence reset skipped (${err.message})`);
  }
}

async function getTargetRowCount(tableName) {
  const quotedTable = quoteIdent(tableName);
  const { rows } = await targetPool.query(`SELECT COUNT(*)::bigint AS count FROM ${quotedTable}`);
  return Number(rows[0].count);
}

async function main() {
  const startedAt = Date.now();
  log('Starting Supabase -> Neon data migration');

  // Sanity-check connectivity up front.
  await sourcePool.query('SELECT 1');
  log('Connected to SOURCE (Supabase) database');

  await targetPool.query('SELECT 1');
  log('Connected to TARGET (Neon) database');

  // Step: ensure target schema exists (idempotent, mirrors server startup).
  log('Ensuring target schema exists (initializeTables + runMigrations)...');
  await initializeTables();
  await runMigrations();
  log('Target schema ready');

  // Step: introspect source tables + FK order.
  const allTables = await getSourceTables();
  if (allTables.length === 0) {
    log('No user tables found in source public schema. Nothing to migrate.');
    await cleanup();
    process.exit(0);
    return;
  }

  const edges = await getForeignKeyEdges(allTables);
  const orderedTables = topologicalSort(allTables, edges);

  log(`Found ${orderedTables.length} source tables. Migration order:`);
  orderedTables.forEach((t, i) => log(`  ${i + 1}. ${t}`));

  const results = [];
  let anyMismatch = false;
  let totalRowsCopied = 0;

  for (const tableName of orderedTables) {
    log(`\nMigrating table: ${tableName}`);
    try {
      const columns = await getColumns(tableName);
      const pkColumns = await getPrimaryKeyColumns(tableName);

      const { copied, sourceCount } = await copyTable(tableName, columns, pkColumns);
      totalRowsCopied += copied;

      await resetSequence(tableName, pkColumns);

      const targetCount = await getTargetRowCount(tableName);
      const match = targetCount === sourceCount;
      if (!match) anyMismatch = true;

      results.push({ tableName, sourceCount, targetCount, match, error: null });

      log(
        `  RESULT: ${tableName} — source=${sourceCount} target=${targetCount} ` +
        `${match ? 'MATCH' : 'MISMATCH'}`
      );
    } catch (err) {
      anyMismatch = true;
      results.push({ tableName, sourceCount: null, targetCount: null, match: false, error: err.message });
      log(`  ERROR migrating ${tableName}: ${err.message}`);
    }
  }

  // Final summary
  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(70));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(70));
  console.log(
    ['table', 'source_count', 'target_count', 'status']
      .map(h => h.padEnd(20))
      .join('')
  );
  console.log('-'.repeat(70));
  for (const r of results) {
    const status = r.error ? `ERROR: ${r.error}` : r.match ? 'MATCH' : 'MISMATCH';
    console.log(
      [
        r.tableName.padEnd(20),
        String(r.sourceCount === null ? 'n/a' : r.sourceCount).padEnd(20),
        String(r.targetCount === null ? 'n/a' : r.targetCount).padEnd(20),
        status
      ].join('')
    );
  }
  console.log('-'.repeat(70));
  console.log(`Total tables:      ${results.length}`);
  console.log(`Total rows copied: ${totalRowsCopied}`);
  console.log(`Duration:          ${durationSec}s`);
  console.log(`Overall status:    ${anyMismatch ? 'FAILED (mismatch or error present)' : 'SUCCESS'}`);
  console.log('='.repeat(70) + '\n');

  await cleanup();

  process.exit(anyMismatch ? 1 : 0);
}

async function cleanup() {
  try {
    await sourcePool.end();
  } catch (err) {
    console.error(`[migrate-to-neon] Error closing source pool: ${err.message}`);
  }
  try {
    await targetPool.end();
  } catch (err) {
    console.error(`[migrate-to-neon] Error closing target pool: ${err.message}`);
  }
}

main().catch(async err => {
  console.error('\n[migrate-to-neon] FATAL ERROR:', err);
  await cleanup();
  process.exit(1);
});
