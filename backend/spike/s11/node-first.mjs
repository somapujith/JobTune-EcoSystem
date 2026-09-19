import ws from 'ws';
import { neonConfig, Pool } from '@neondatabase/serverless';
import { configureNeon, neonUrl } from './lib.mjs';
configureNeon(neonConfig, ws);
const pool = new Pool({ connectionString: neonUrl() });
pool.on('error', (e) => console.log('pool error event:', e.message));
const r = await pool.query('SELECT COUNT(*) AS c, current_database() AS db, version() AS v');
console.log(r.rows, r.rowCount, r.command);
await pool.end();
