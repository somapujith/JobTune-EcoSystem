// S11 step 1a (Node): the SAME queries through the Neon Pool (WebSocket -> wsproxy -> PG) and `pg` (direct TCP).
// Prints where they differ. Run with different TZ values:  TZ=UTC node spike/s11/node-types.mjs
import ws from 'ws';
import pg from 'pg';
import { neonConfig, Pool as NeonPool } from '@neondatabase/serverless';
import { configureNeon, neonUrl, directUrl } from './lib.mjs';
configureNeon(neonConfig, ws);
const neon = new NeonPool({ connectionString: neonUrl(), max: 1 });
const pgp = new pg.Pool({ connectionString: directUrl(), max: 1 });

const desc = (v) => {
  if (v === null) return 'null';
  if (v instanceof Date) return `Date(${Number.isNaN(v.getTime()) ? 'Invalid' : v.toISOString()})`;
  if (Array.isArray(v)) return `array[${v.map(desc).join(',')}]`;
  if (typeof v === 'object') return `object ${JSON.stringify(v)}`;
  return `${typeof v} ${JSON.stringify(v)}`;
};
const exprs = {
  count: 'SELECT COUNT(*) AS v FROM users',
  int4: 'SELECT 42::int AS v',
  int8: 'SELECT 9007199254740993::bigint AS v',
  sumBigint: 'SELECT SUM(id) AS v FROM users',
  numeric: "SELECT '12.3400'::numeric(10,4) AS v",
  float8: 'SELECT 1.5::float8 AS v',
  real: 'SELECT 1.5::real AS v',
  date: "SELECT DATE '2026-09-20' AS v",
  timestamp: "SELECT TIMESTAMP '2026-09-20 12:34:56.789' AS v",
  timestamptz: "SELECT TIMESTAMPTZ '2026-09-20 12:34:56.789+00' AS v",
  timestamptzOffset: "SELECT TIMESTAMPTZ '2026-09-20 12:34:56+05:30' AS v",
  nowIsDate: 'SELECT now() AS v',
  time: "SELECT TIME '12:34:56' AS v",
  interval: "SELECT INTERVAL '1 day 2 hours' AS v",
  json: `SELECT '{"a":[1,2,{"b":null}]}'::json AS v`,
  jsonb: `SELECT '{"a":[1,2,{"b":null}]}'::jsonb AS v`,
  jsonbScalarStr: `SELECT '"str"'::jsonb AS v`,
  bool: 'SELECT true AS v',
  nullv: 'SELECT NULL::text AS v',
  textArr: "SELECT ARRAY['a','b']::text[] AS v",
  intArr: 'SELECT ARRAY[1,2,3]::int[] AS v',
  bigintArr: 'SELECT ARRAY[1,2]::bigint[] AS v',
  jsonbArr: `SELECT ARRAY['{"x":1}'::jsonb] AS v`,
  uuid: "SELECT '6b13a1c2-0000-4000-8000-000000000001'::uuid AS v",
  bytea: "SELECT '\x0102ff'::bytea AS v",
  serialId: 'SELECT id AS v FROM users ORDER BY id LIMIT 1',
  createdAt: 'SELECT created_at AS v FROM users ORDER BY id LIMIT 1',
  extractEpoch: "SELECT EXTRACT(EPOCH FROM TIMESTAMPTZ '2026-09-20 00:00:00+00') AS v",
  countFilter: 'SELECT COUNT(*) FILTER (WHERE id > 1)::int AS v FROM users',
  avg: 'SELECT AVG(id) AS v FROM users',
  hstore: "SELECT 'a=>1'::text AS v",
};
const diffs = [];
console.log(`TZ=${process.env.TZ || '(unset)'}  neon=1.1.0 pg=${pg.native ? 'native' : 'js'}`);
console.log('key'.padEnd(20), 'neon'.padEnd(46), 'pg');
for (const [k, sql] of Object.entries(exprs)) {
  const [a, b] = await Promise.all([neon.query(sql), pgp.query(sql)]);
  const da = desc(a.rows[0].v), db = desc(b.rows[0].v);
  const same = da === db;
  if (!same) diffs.push(k);
  console.log((same ? '  ' : '!!') + k.padEnd(18), da.padEnd(46), same ? '(same)' : db);
}
console.log('DIFFS:', diffs.length ? diffs.join(', ') : 'none');

// result shape
const shape = (r) => ({ keys: Object.keys(r), command: r.command, rowCount: r.rowCount, rowsIsArray: Array.isArray(r.rows),
  fields: (r.fields || []).map((f) => `${f.name}:${f.dataTypeID}`), rowAsArray: r.rowAsArray, ctor: r.constructor.name });
for (const sql of ['SELECT 1 AS x, 2 AS y', 'SELECT 1 AS x WHERE false', "UPDATE users SET email = email WHERE id = 1", "DELETE FROM users WHERE id = -1", 'SELECT * FROM generate_series(1,3) g(n)']) {
  const [a, b] = await Promise.all([neon.query(sql), pgp.query(sql)]);
  console.log('SHAPE', JSON.stringify(sql));
  console.log('  neon', JSON.stringify(shape(a)));
  console.log('  pg  ', JSON.stringify(shape(b)));
}
await Promise.all([neon.end(), pgp.end()]);
