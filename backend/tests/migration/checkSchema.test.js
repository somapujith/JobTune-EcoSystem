/**
 * check-schema.js: static SQL extraction, the known-DDL model, resolution, the --check logic (mock pg client,
 * no network) and the read-only guard.
 *
 * Fully offline: fixtures are synthetic SQL/JS snippets and throw-away directories in the OS temp dir. The real
 * repository files are only READ (database.sql, initializeTables.js, runMigrations.js, routes/*.js, the Worker).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const SCHEMA_DIR = path.join(BACKEND_DIR, 'scripts', 'migration', 'schema');

const { tokenize } = require(path.join(SCHEMA_DIR, 'sqlTokens'));
const { scanSource } = require(path.join(SCHEMA_DIR, 'jsSql'));
const { analyzeSql } = require(path.join(SCHEMA_DIR, 'sqlAnalyze'));
const {
  buildKnownDdl, parseDdlText, computeDrift, lineIndex, gitDdlStatus, DdlModel,
} = require(path.join(SCHEMA_DIR, 'ddlModel'));
const { extractRequirements, resolveRequirements } = require(path.join(SCHEMA_DIR, 'requirements'));
const live = require(path.join(SCHEMA_DIR, 'liveCheck'));
const render = require(path.join(SCHEMA_DIR, 'render'));
const cli = require(path.join(BACKEND_DIR, 'scripts', 'migration', 'check-schema.js'));

/* ------------------------------------------------------------------------------------------------- */
/* helpers                                                                                            */
/* ------------------------------------------------------------------------------------------------- */

/** analyze one SQL string */
const an = (sql) => analyzeSql(sql, lineIndex(sql));
const tableNames = (a) => [...new Set(a.tables.map((t) => t.name))].sort();
const colSet = (a, table) => [...new Set(a.columns.filter((c) => c.table === table).map((c) => c.column))].sort();
const uses = (a, table) => a.tables.filter((t) => t.name === table).map((t) => t.use);

/** scan a JS snippet and return the SQL texts (one per site alternative) */
function scan(source, mode = 'sql') {
  const r = scanSource(source, { file: 'fixture.js', mode });
  return { ...r, texts: r.sites.map((s) => s.alt.text.replace(/\s+/g, ' ').trim()) };
}

function tmpBackend(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-schema-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return dir;
}
const rmrf = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* ignore */ } };

/** A pg-style client answering the catalog queries from plain data. Records every statement it receives. */
function mockPg({
  tables = [], columns = {}, uniques = [], indexes = [], connectError = null, identity = { db: 'branch_db', schema: 'public', version: '16.2' },
} = {}) {
  const seen = [];
  return {
    seen,
    connected: false,
    async connect() {
      if (connectError) throw new Error(connectError);
      this.connected = true;
    },
    async end() { this.connected = false; },
    async query(sql) {
      seen.push(sql);
      if (/current_database\(\)/.test(sql)) return { rows: [identity] };
      if (/FROM information_schema\.tables/.test(sql)) {
        return { rows: tables.map((t) => ({ table_schema: 'public', table_name: t, table_type: 'BASE TABLE' })) };
      }
      if (/FROM information_schema\.columns/.test(sql)) {
        return {
          rows: Object.entries(columns).flatMap(([t, cs]) => cs.map((c) => ({
            table_schema: 'public', table_name: t, column_name: c, data_type: 'text', is_nullable: 'YES',
          }))),
        };
      }
      if (/FROM pg_constraint/.test(sql)) {
        return { rows: uniques.map((u) => ({ table_schema: 'public', table_name: u.table, constraint_name: u.name || `${u.table}_uq`, constraint_type: u.kind === 'primary' ? 'p' : 'u', columns: u.columns })) };
      }
      if (/FROM pg_indexes/.test(sql)) return { rows: indexes };
      throw new Error(`mock pg: unexpected statement: ${sql}`);
    },
  };
}

/** What a database that Express boot had fully initialised would look like, derived from the known DDL. */
function catalogFromModel(model, { drop = {} } = {}) {
  const tables = [];
  const columns = {};
  const uniques = [];
  for (const [name] of model.tables) {
    if (!model.tables.get(name).variants.some((v) => v.dialect !== 'mysql')) continue; // MySQL-only DDL never existed
    tables.push(name);
    columns[name] = [...model.columnsOf(name).keys()];
    for (const u of model.uniquesOf(name)) if (u.dialect !== 'mysql' && !u.where) uniques.push({ table: name, kind: u.kind === 'primary' ? 'primary' : 'unique', columns: u.columns, name: `${name}_${u.columns.join('_')}_key` });
  }
  return { tables: tables.filter((t) => !(drop.tables || []).includes(t)), columns, uniques };
}

function capture() {
  const lines = [];
  return { out: (s) => lines.push(String(s)), err: (s) => lines.push(`[stderr] ${s}`), lines, text: () => lines.join('\n') };
}

/* ------------------------------------------------------------------------------------------------- */
/* tokenizer                                                                                          */
/* ------------------------------------------------------------------------------------------------- */

describe('sqlTokens', () => {
  it('handles comments, strings with escapes, quoted identifiers, params and casts', () => {
    const t = tokenize("SELECT \"current_role\", 'it''s' -- trailing\n /* block */ FROM t WHERE a = $1::int AND b -> 'k' = $2");
    const kinds = t.map((x) => `${x.k}:${x.v}`);
    expect(kinds).toContain('qid:current_role');
    expect(kinds).toContain("str:it's");
    expect(kinds).toContain('param:$1');
    expect(kinds).toContain('op:::');
    expect(kinds).toContain('op:->');
    expect(kinds.join(' ')).not.toMatch(/trailing|block/);
  });

  it('treats a dollar-glued placeholder as a parameter and a dollar-quoted body as one string', () => {
    const t = tokenize('SELECT $__$DYN_3$__ , $$DROP TABLE x$$');
    expect(t[1].k).toBe('param');
    expect(t[1].dynParam).toBe(true);
    expect(t.filter((x) => x.k === 'str')).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------------------------------------- */
/* JS scanning: where the SQL strings are                                                             */
/* ------------------------------------------------------------------------------------------------- */

describe('scanSource: finding SQL in JavaScript', () => {
  it('reads multi-line template literals and reports the true line of each token', () => {
    const src = [
      'async function f(db) {',
      '  return db.query(`',
      '    SELECT id,',
      '           email',
      '    FROM users',
      '    WHERE id = $1',
      '  `, [1]);',
      '}',
    ].join('\n');
    const r = scanSource(src, { file: 'a.js' });
    expect(r.sites).toHaveLength(1);
    const a = analyzeSql(r.sites[0].alt.text, r.sites[0].alt.lineAt);
    expect(a.tables[0]).toMatchObject({ name: 'users', use: 'FROM', line: 5 });
    expect(a.columns.find((c) => c.column === 'email').line).toBe(4);
  });

  it('substitutes const strings and marks unresolvable ${} as dynamic fragments', () => {
    const src = [
      "const TABLE = 'community_threads';",
      "const COLS = 'id, title';",
      'async function f(db, order) {',
      '  await db.query(`SELECT ${COLS} FROM ${TABLE} WHERE category = $1 ORDER BY ${order}`, [1]);',
      '}',
    ].join('\n');
    const r = scanSource(src, { file: 'a.js' });
    expect(r.sites).toHaveLength(1);
    expect(r.sites[0].alt.text).toContain('SELECT id, title FROM community_threads');
    expect(r.sites[0].alt.dyns.map((d) => d.expr)).toEqual(['order']);
  });

  it('follows a let built up with += and array.push(...).join(), and both branches of a conditional', () => {
    const src = [
      'async function a(db, x) {',
      "  let query = 'SELECT id FROM audit_logs a';",
      "  if (x) query += ' WHERE a.user_id = $1';",
      "  query += ' ORDER BY a.created_at DESC';",
      '  return db.query(query, []);',
      '}',
      'async function b(db, x) {',
      '  const updates = [];',
      "  if (x) updates.push('status = $1');",
      "  if (x) updates.push('notes = $2');",
      '  return db.query(`UPDATE project_workspace SET ${updates.join(", ")} WHERE id = $3`, []);',
      '}',
      'async function c(db, dir) {',
      "  return db.query(`SELECT * FROM t ORDER BY ${dir ? 'a ASC' : 'b DESC'}`);",
      '}',
    ].join('\n');
    const { texts } = scan(src);
    expect(texts).toContain('SELECT id FROM audit_logs a WHERE a.user_id = $1 ORDER BY a.created_at DESC');
    expect(texts).toContain('UPDATE project_workspace SET status = $1, notes = $2 WHERE id = $3');
    expect(texts).toContain('SELECT * FROM t ORDER BY a ASC');
    expect(texts).toContain('SELECT * FROM t ORDER BY b DESC');
  });

  it('expands for-of loops over a literal array (boot ALTER TABLE column loops)', () => {
    const src = [
      "const cols = [['a', 'TEXT'], ['b', 'INTEGER DEFAULT 0']];",
      'async function f(pool) {',
      '  for (const [col, def] of cols) {',
      '    await pool.query(`ALTER TABLE resumes ADD COLUMN IF NOT EXISTS ${col} ${def}`);',
      '  }',
      '}',
    ].join('\n');
    const { texts } = scan(src, 'ddl');
    expect(texts).toEqual([
      'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS a TEXT',
      'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS b INTEGER DEFAULT 0',
    ]);
  });

  it('does not treat comments as SQL, and finds SQL literals that are not direct .query() arguments', () => {
    const src = [
      '// SELECT * FROM commented_out_table',
      '/* INSERT INTO block_comment_table (a) VALUES (1) */',
      "const checks = [{ key: 'x', query: 'SELECT EXISTS(SELECT 1 FROM skill_assessments WHERE user_id = $1) AS e' }];",
      "const prose = 'Select the best option from the list';",
      'async function f(db) { for (const c of checks) await db.query(c.query, [1]); }',
    ].join('\n');
    const r = scanSource(src, { file: 'a.js' });
    const all = r.sites.map((s) => s.alt.text).join('\n');
    expect(all).toContain('skill_assessments');
    expect(all).not.toMatch(/commented_out_table|block_comment_table|best option/);
    expect(r.sites[0].kind).toBe('literal');
    expect(r.unresolved.map((u) => u.expr)).toEqual(['c.query']);
  });

  it('does not let a shadowing parameter resolve to an outer const, and flags try/catch guarded queries', () => {
    const src = [
      "const sql = 'SELECT 1 FROM outer_table';",
      'async function f(db, sql) { return db.query(sql); }',
      'async function g(db) { try { await db.query(`SELECT a FROM guarded_t`); } catch (e) { /* ignore */ } await db.query(`SELECT a FROM open_t`); }',
    ].join('\n');
    const r = scanSource(src, { file: 'a.js' });
    // the parameter `sql` shadows the outer const: the call is unresolved, not silently resolved to the outer text
    expect(r.sites.filter((s) => s.kind === 'query').map((s) => s.alt.text)).not.toContain('SELECT 1 FROM outer_table');
    expect(r.unresolved.map((u) => u.expr)).toEqual(['sql']);
    const guarded = r.sites.find((s) => /guarded_t/.test(s.alt.text));
    const open = r.sites.find((s) => /open_t/.test(s.alt.text));
    expect(guarded.inTry).toBe(true);
    expect(open.inTry).toBe(false);
  });
});

/* ------------------------------------------------------------------------------------------------- */
/* SQL analysis: tables and columns                                                                   */
/* ------------------------------------------------------------------------------------------------- */

describe('analyzeSql: tables and columns', () => {
  it('extracts every table role: FROM, JOIN, INSERT INTO, UPDATE, DELETE FROM, USING', () => {
    expect(uses(an('SELECT * FROM users'), 'users')).toEqual(['FROM']);
    const j = an('SELECT a.id FROM resumes a LEFT JOIN analyses b ON b.resume_id = a.id INNER JOIN resume_exports e ON e.resume_id = a.id');
    expect(tableNames(j)).toEqual(['analyses', 'resume_exports', 'resumes']);
    expect(uses(j, 'analyses')).toEqual(['JOIN']);
    expect(uses(an('INSERT INTO plan_orders (order_ref) VALUES ($1)'), 'plan_orders')).toEqual(['INTO']);
    expect(uses(an('UPDATE users SET role = $1 WHERE id = $2'), 'users')).toEqual(['UPDATE']);
    expect(uses(an('DELETE FROM user_sessions WHERE id = $1'), 'user_sessions')).toEqual(['DELETE FROM']);
    const d = an('DELETE FROM orders o USING users u WHERE o.user_id = u.id AND u.role = $1');
    expect(uses(d, 'users')).toEqual(['USING']);
    const u = an('UPDATE a SET x = b.x FROM b WHERE a.id = b.id');
    expect(tableNames(u)).toEqual(['a', 'b']);
  });

  it('attributes INSERT column lists, SET targets and qualified columns as certain', () => {
    const ins = an('INSERT INTO daily_activity (user_id, activity_date, tool_name) VALUES ($1, CURRENT_DATE, $2)');
    expect(colSet(ins, 'daily_activity')).toEqual(['activity_date', 'tool_name', 'user_id']);
    expect(ins.columns.every((c) => c.confidence === 'certain')).toBe(true);
    const upd = an('UPDATE users SET onboarding_completed = true, role = $1 WHERE id = $2 RETURNING id');
    expect(colSet(upd, 'users')).toEqual(['id', 'onboarding_completed', 'role']);
    expect(upd.columns.find((c) => c.column === 'role').confidence).toBe('certain');
    expect(upd.columns.find((c) => c.column === 'id' && c.use === 'WHERE').confidence).toBe('inferred');
  });

  it('resolves aliases in joins and marks unqualified names in multi-table queries as ambiguous, not asserted', () => {
    const a = an('SELECT e.name, u.email, created_at FROM employees e JOIN users u ON u.id = e.user_id WHERE e.active = true');
    expect(colSet(a, 'employees')).toEqual(['active', 'name', 'user_id']);
    expect(colSet(a, 'users')).toEqual(['email', 'id']);
    expect(a.ambiguous.map((m) => m.column)).toEqual(['created_at']);
    expect(a.ambiguous[0].candidates.sort()).toEqual(['employees', 'users']);
  });

  it('reads simple single-table select lists as inferred columns and ignores output aliases, functions and casts', () => {
    const a = an("SELECT COUNT(*) AS total, MAX(score)::int AS best, COALESCE(name, 'x') label FROM study_sessions WHERE created_at >= NOW() - INTERVAL '7 days' GROUP BY 1 ORDER BY total DESC");
    expect(colSet(a, 'study_sessions')).toEqual(['created_at', 'name', 'score']);
    expect(a.columns.every((c) => c.confidence === 'inferred')).toBe(true);
    expect(a.ambiguous).toHaveLength(0);
  });

  it('handles ON CONFLICT targets: column list, DO UPDATE SET with EXCLUDED, DO NOTHING, partial and constraint forms', () => {
    const a = an('INSERT INTO srs_cards (user_id, deck_id, front, back) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, deck_id, front) DO UPDATE SET back = EXCLUDED.back, difficulty = EXCLUDED.difficulty');
    expect(a.conflicts).toHaveLength(1);
    expect(a.conflicts[0]).toMatchObject({ table: 'srs_cards', columns: ['user_id', 'deck_id', 'front'], action: 'update', where: false });
    expect(colSet(a, 'srs_cards')).toEqual(['back', 'deck_id', 'difficulty', 'front', 'user_id']);
    const n = an('INSERT INTO t (a) VALUES (1) ON CONFLICT DO NOTHING');
    expect(n.conflicts[0]).toMatchObject({ columns: [], action: 'nothing' });
    const p = an('INSERT INTO t (a) VALUES (1) ON CONFLICT (a) WHERE deleted_at IS NULL DO NOTHING');
    expect(p.conflicts[0]).toMatchObject({ columns: ['a'], where: true });
    const c = an('INSERT INTO t (a) VALUES (1) ON CONFLICT ON CONSTRAINT t_a_key DO NOTHING');
    expect(c.conflicts[0]).toMatchObject({ constraint: 't_a_key' });
    const e = an('INSERT INTO t (a) VALUES (1) ON CONFLICT (lower(a)) DO NOTHING');
    expect(e.conflicts[0]).toMatchObject({ exprTarget: true });
  });

  it('does not count CTE names as tables and analyses the CTE bodies', () => {
    const a = an(`
      WITH RECURSIVE tree AS (SELECT id, parent_id FROM categories WHERE parent_id IS NULL
                              UNION ALL SELECT c.id, c.parent_id FROM categories c JOIN tree t ON c.parent_id = t.id),
           recent AS (SELECT user_id FROM daily_activity WHERE activity_date > CURRENT_DATE - 7)
      SELECT * FROM tree JOIN recent r ON true JOIN users u ON u.id = r.user_id`);
    expect(tableNames(a)).toEqual(['categories', 'daily_activity', 'users']);
  });

  it('analyses sub-selects in every position (IN, EXISTS, scalar, FROM alias) and correlated references', () => {
    const a = an(`
      SELECT u.id,
             (SELECT COUNT(*) FROM community_replies r WHERE r.thread_id = t.id) AS n
      FROM community_threads t
      JOIN (SELECT user_id, MAX(score) AS s FROM practice_submissions GROUP BY user_id) best ON best.user_id = t.user_id
      JOIN users u ON u.id = t.user_id
      WHERE t.id IN (SELECT thread_id FROM community_votes WHERE direction = $1)
        AND EXISTS (SELECT 1 FROM study_groups g WHERE g.creator_id = u.id)`);
    expect(tableNames(a)).toEqual(['community_replies', 'community_threads', 'community_votes', 'practice_submissions', 'study_groups', 'users']);
    expect(colSet(a, 'community_threads')).toEqual(['id', 'user_id']);
    expect(colSet(a, 'community_replies')).toEqual(['thread_id']);
    expect(colSet(a, 'study_groups')).toEqual(['creator_id']);
    // best.* is a sub-select alias, never a table column
    expect(a.columns.some((c) => c.table === 'best')).toBe(false);
  });

  it('ignores FROM inside EXTRACT / IS DISTINCT FROM / SUBSTRING, function tables and type words after ::', () => {
    const a = an(`SELECT EXTRACT(EPOCH FROM (now() - created_at)) AS age, SUBSTRING(title FROM 1 FOR 5) AS s
                  FROM study_sessions
                  WHERE score IS DISTINCT FROM 0 AND data::jsonb ? 'x' AND topic = ANY($1::text[])`);
    expect(tableNames(a)).toEqual(['study_sessions']);
    expect(colSet(a, 'study_sessions')).toEqual(['created_at', 'data', 'score', 'title', 'topic']);
    const f = an('SELECT g FROM generate_series(1, 3) AS g JOIN users u ON u.id = g');
    expect(tableNames(f)).toEqual(['users']);
  });

  it('reads INSERT ... SELECT, RETURNING, quoted identifiers and schema-qualified names', () => {
    const a = an('INSERT INTO public.career_roadmaps (user_id, "current_role") SELECT s.user_id, s.role FROM skill_assessments s RETURNING id');
    expect(tableNames(a)).toEqual(['career_roadmaps', 'skill_assessments']);
    expect(colSet(a, 'career_roadmaps')).toEqual(['current_role', 'id', 'user_id']);
    expect(colSet(a, 'skill_assessments')).toEqual(['role', 'user_id']);
  });

  it('reports system catalogs separately, statement kinds, and any DDL', () => {
    const a = an('SELECT table_name FROM information_schema.tables WHERE table_schema = $1');
    expect(a.tables[0]).toMatchObject({ name: 'information_schema.tables', system: true });
    const d = an('CREATE TABLE IF NOT EXISTS t (id INT); ALTER TABLE t ADD COLUMN x INT');
    expect(d.ddl.map((x) => x.kind)).toEqual(['CREATE', 'ALTER']);
  });

  it('flags a placeholder in table position as a dynamic table and ignores computed parameter indexes', () => {
    const src = 'async function f(db, t, i) { return db.query(`SELECT a FROM ${t} WHERE b = $${i}`); }';
    const r = scanSource(src, { file: 'a.js' });
    const a = analyzeSql(r.sites[0].alt.text, r.sites[0].alt.lineAt);
    expect(a.tables).toHaveLength(0);
    expect(a.dynamics).toHaveLength(1);
    expect(a.dynamics[0].kind).toBe('table');
  });
});

/* ------------------------------------------------------------------------------------------------- */
/* DDL parsing + known-DDL model                                                                      */
/* ------------------------------------------------------------------------------------------------- */

describe('parseDdlText', () => {
  const ddl = (text) => parseDdlText(text, lineIndex(text));

  it('parses columns, inline and table-level UNIQUE / PRIMARY KEY, and quoted identifiers', () => {
    const [ev] = ddl(`CREATE TABLE IF NOT EXISTS t (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      "current_role" VARCHAR(255),
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day DATE DEFAULT CURRENT_DATE,
      UNIQUE(user_id, day),
      CONSTRAINT t_pk2 PRIMARY KEY (email, day)
    )`);
    expect(ev.type).toBe('create-table');
    expect(ev.columns.map((c) => c.name)).toEqual(['id', 'email', 'current_role', 'user_id', 'day']);
    expect(ev.columns[1]).toMatchObject({ notNull: true, unique: true, type: 'VARCHAR(255)' });
    expect(ev.columns[3].references).toBe('users');
    expect(ev.columns[4].hasDefault).toBe(true);
    const keys = ev.uniques.map((u) => `${u.kind}(${u.columns.join(',')})`).sort();
    expect(keys).toEqual(['primary(email,day)', 'primary(id)', 'unique(email)', 'unique(user_id,day)']);
  });

  it('parses ALTER TABLE ADD COLUMN (with several actions), unique indexes and INSERT seeds', () => {
    const ev = ddl(`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false, ADD COLUMN x INT;
      ALTER TABLE t ADD CONSTRAINT t_u UNIQUE (a, b);
      CREATE UNIQUE INDEX IF NOT EXISTS uq ON t (a, b) WHERE deleted IS NULL;
      CREATE INDEX idx ON t (lower(a));
      INSERT INTO subscription_plans (name) VALUES ('x') ON CONFLICT (name) DO NOTHING;`);
    expect(ev.filter((e) => e.type === 'add-column').map((e) => `${e.table}.${e.column.name}`)).toEqual(['users.onboarding_completed', 'users.x']);
    expect(ev.find((e) => e.type === 'add-constraint')).toMatchObject({ table: 't', kind: 'unique', columns: ['a', 'b'] });
    const idx = ev.filter((e) => e.type === 'index');
    expect(idx[0]).toMatchObject({ unique: true, columns: ['a', 'b'], where: true });
    expect(idx[1]).toMatchObject({ unique: false, expr: true });
    expect(ev.find((e) => e.type === 'seed').table).toBe('subscription_plans');
  });
});

describe('known DDL model built from the real repository files', () => {
  let model;
  beforeAll(() => { model = buildKnownDdl({ backendDir: BACKEND_DIR }); }, 30000);

  const kindsOf = (t) => [...model.kindsOf(t)].sort();
  const files = (t) => model.tables.get(t).variants.map((v) => v.source.file);

  it('scans database.sql, every migration file and the Express boot / route / service DDL, but not the Worker', () => {
    expect(model.sourcesScanned).toContain('database.sql');
    expect(model.sourcesScanned).toContain('src/migrations/add-github-analyses.sql');
    expect(model.sourcesScanned).toContain('src/utils/initializeTables.js');
    expect(model.sourcesScanned).toContain('src/utils/runMigrations.js');
    expect(model.sourcesScanned).toContain('src/services/sessionService.js');
    expect(model.sourcesScanned.some((f) => f.startsWith('src/worker/'))).toBe(false);
    expect(model.errors).toEqual([]);
  });

  it('resolves tables to the right kind of source', () => {
    expect(kindsOf('users')).toEqual(['boot', 'database.sql']);
    expect(files('users')).toEqual(expect.arrayContaining(['database.sql', 'src/utils/initializeTables.js']));
    expect(kindsOf('github_analyses')).toEqual(['migration']); // only in src/migrations/add-github-analyses.sql
    expect(kindsOf('learning_roadmaps')).toEqual(['boot']);
    expect(files('learning_roadmaps')).toEqual(expect.arrayContaining(['src/utils/initializeTables.js', 'src/routes/learning.js']));
    expect(files('mock_interviews')).toEqual(expect.arrayContaining(['src/utils/initializeTables.js', 'src/routes/interview.js']));
    expect(files('code_reviews')).toEqual(['src/routes/aiCoach.js']);
    expect(files('career_coach_sessions')).toEqual(['src/routes/aiCoach.js']);
    for (const t of ['practice_submissions', 'assessment_submissions', 'practice_bookmarks']) expect(files(t)).toEqual(['src/routes/practice.js']);
    expect(files('user_progress')).toEqual(['src/services/sessionService.js']);
    expect(files('job_guides')).toEqual(['src/utils/initializeTables.js']);
    expect(files('scorer_benchmarks')).toEqual(['src/utils/initializeTables.js']);
    expect(model.has('interview_sessions')).toBe(false);
    expect(model.has('profiles')).toBe(false);
  });

  it('knows the working-tree runMigrations.js additions: career_discovery_responses and users.onboarding_completed', () => {
    expect(files('career_discovery_responses')).toEqual(['src/utils/runMigrations.js']);
    const col = model.columnsOf('users').get('onboarding_completed');
    expect(col).toBeDefined();
    expect(col[0]).toMatchObject({ via: 'alter' });
    expect(col[0].source.file).toBe('src/utils/runMigrations.js');
    expect(col[0].column).toMatchObject({ notNull: true, hasDefault: true });
    // the users table itself never declares it: ALTER only
    expect(model.tables.get('users').variants.every((v) => !v.columns.some((c) => c.name === 'onboarding_completed'))).toBe(true);
  });

  it('expands the column-migration loops of runMigrations.js and routes/resume.js', () => {
    const cols = model.columnsOf('resumes');
    for (const c of ['original_resume', 'optimized_resume', 'keyword_coverage', 'suggestions', 'file_name', 'updated_at']) expect(cols.has(c)).toBe(true);
    expect(cols.get('keyword_coverage').some((x) => x.via === 'alter')).toBe(true);
  });

  it('knows the unique constraints that ON CONFLICT targets rely on', () => {
    const has = (t, cols) => model.uniquesOf(t).some((u) => u.columns.slice().sort().join() === cols.slice().sort().join());
    expect(has('user_progress', ['user_id', 'context_key'])).toBe(true);
    expect(has('user_subscriptions', ['user_id'])).toBe(true);
    expect(has('daily_activity', ['user_id', 'activity_date', 'tool_name', 'activity_type'])).toBe(true);
    expect(has('learning_streaks', ['user_id', 'subject'])).toBe(true); // initializeTables shape
    expect(has('learning_streaks', ['user_id'])).toBe(true); // courses.js shape
  });

  it('records seed inserts and marks database.sql as MySQL dialect', () => {
    expect(model.seeds.has('subscription_plans')).toBe(true);
    expect(model.tables.get('users').variants.find((v) => v.source.kind === 'database.sql').dialect).toBe('mysql');
    expect(model.tables.get('users').variants.find((v) => v.source.file === 'src/utils/initializeTables.js').dialect).toBe('postgres');
  });

  it('detects drift: learning_streaks has two incompatible shapes; mock_interviews and resumes differ too', () => {
    const drift = computeDrift(model);
    const ls = drift.find((d) => d.table === 'learning_streaks');
    expect(ls).toBeDefined();
    const cols = ls.columnDiffs.map((c) => c.column);
    expect(cols).toEqual(expect.arrayContaining(['current', 'longest', 'last_date', 'daily_goal', 'current_streak', 'longest_streak', 'last_active_date', 'subject']));
    expect(ls.uniqueDiffs.length).toBeGreaterThan(0);
    // mock_interviews.feedback was drift until runMigrations began adding it (additive, IF NOT EXISTS): both shapes
    // now end up with it, so it must no longer be reported as a column that only one shape has.
    const mi = drift.find((d) => d.table === 'mock_interviews');
    expect(mi ? mi.columnDiffs.map((c) => c.column) : []).not.toContain('feedback');
    expect(drift.map((d) => d.table)).toEqual(expect.arrayContaining(['resumes', 'learning_roadmaps']));
    // identical repeated definitions (linkedin_analyses in a migration, initializeTables and runMigrations) are not drift
    expect(drift.map((d) => d.table)).not.toContain('linkedin_analyses');
  });
});

/* ------------------------------------------------------------------------------------------------- */
/* resolution: labelling every requirement with where its DDL comes from                              */
/* ------------------------------------------------------------------------------------------------- */

describe('resolveRequirements on a synthetic repository', () => {
  let dir;
  let result;
  beforeAll(() => {
    dir = tmpBackend({
      'database.sql': 'CREATE TABLE IF NOT EXISTS legacy (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(10));',
      'src/migrations/add-a.sql': 'CREATE TABLE IF NOT EXISTS mig_only (id SERIAL PRIMARY KEY, user_id INT UNIQUE, note TEXT);',
      'src/utils/initializeTables.js': [
        'const tables = [{ name: "b", query: `CREATE TABLE IF NOT EXISTS boot_only (id SERIAL PRIMARY KEY, user_id INT, a TEXT, UNIQUE(user_id, a))` },',
        '  { name: "m", query: `CREATE TABLE IF NOT EXISTS mig_only (id SERIAL PRIMARY KEY, user_id INT UNIQUE, note TEXT)` }];',
        'module.exports = { tables };',
      ].join('\n'),
      'src/utils/runMigrations.js': [
        'async function run(pool) {',
        "  await pool.query('ALTER TABLE boot_only ADD COLUMN IF NOT EXISTS late TEXT');",
        '}',
        'module.exports = { run };',
      ].join('\n'),
      'src/worker/routes/x.js': [
        'async function f(db) {',
        "  await db.query('SELECT id, note, ghost_col FROM mig_only WHERE user_id = $1', [1]);",
        "  await db.query('INSERT INTO boot_only (user_id, a, late) VALUES ($1, $2, $3) ON CONFLICT (user_id, a) DO UPDATE SET late = $3', []);",
        "  await db.query('INSERT INTO boot_only (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', []);",
        "  await db.query('SELECT name FROM legacy', []);",
        "  await db.query('SELECT x FROM nowhere_tbl', []);",
        '}',
        'module.exports = { f };',
      ].join('\n'),
    });
    const model = buildKnownDdl({ backendDir: dir });
    const req = extractRequirements({ backendDir: dir });
    result = resolveRequirements(req, model);
  });
  afterAll(() => rmrf(dir));

  const T = (n) => result.tables.find((t) => t.name === n);

  it('labels each table: database.sql / migration file / Express boot only / NOT FOUND ANYWHERE', () => {
    expect(T('legacy').ddl.category).toBe('database.sql');
    expect(T('legacy').ddl.mysqlOnly).toBe(true);
    expect(T('legacy').ddl.existsOnlyBecauseBoot).toBe(false);
    expect(T('mig_only').ddl.category).toBe('migration');
    expect(T('mig_only').ddl.kinds).toEqual(['boot', 'migration']);
    expect(T('mig_only').ddl.existsOnlyBecauseBoot).toBe(false); // a standalone Postgres DDL file exists
    expect(T('boot_only').ddl.category).toBe('boot-only');
    expect(T('boot_only').ddl.existsOnlyBecauseBoot).toBe(true);
    expect(T('nowhere_tbl').ddl.category).toBe('not-found');
    expect(T('nowhere_tbl').ddl.defined).toBe(false);
    expect(result.summary).toMatchObject({
      tablesReferenced: 4, inDatabaseSql: 1, inDatabaseSqlMysqlOnly: 1, inMigrationFileNotDatabaseSql: 1, bootOnly: 1, notFound: 1, existsOnlyBecauseBoot: 1,
    });
    expect(result.findings.notFoundTables).toEqual(['nowhere_tbl']);
    expect(result.findings.mysqlOnlyTables).toEqual(['legacy']);
  });

  it('labels each column, including ALTER-added ones, and reports columns declared nowhere', () => {
    const col = (t, c) => T(t).columns.find((x) => x.name === c);
    expect(col('boot_only', 'late')).toMatchObject({ status: 'found', bootOnly: true, alterOnly: true });
    expect(col('mig_only', 'note').status).toBe('found');
    expect(col('mig_only', 'ghost_col').status).toBe('not-found');
    expect(result.findings.notFoundColumns.map((c) => `${c.table}.${c.column}`)).toEqual(['mig_only.ghost_col']);
    expect(col('mig_only', 'ghost_col').evidence[0]).toMatchObject({ file: 'src/worker/routes/x.js', line: 2 });
  });

  it('checks each ON CONFLICT target against the unique constraints known for the table', () => {
    const cf = T('boot_only').conflicts;
    expect(cf).toHaveLength(2);
    const two = cf.find((c) => c.columns.length === 2);
    const one = cf.find((c) => c.columns.length === 1);
    expect(two.status).toBe('satisfied');
    expect(two.bootOnly).toBe(true);
    expect(two.satisfiedBy[0].source.file).toBe('src/utils/initializeTables.js');
    expect(one.status).toBe('not-found');
    expect(result.findings.conflictsNoUnique.map((c) => c.columns.join())).toEqual(['user_id']);
  });

  it('records which Worker files use a table and with what access', () => {
    expect(T('boot_only').workerFiles.map((w) => w.file)).toEqual(['src/worker/routes/x.js']);
    expect(T('boot_only').access).toBe('W');
    expect(T('mig_only').access).toBe('R');
  });
});

describe('uncommitted DDL detection (git injected, read-only)', () => {
  it('flags tables and columns that exist only in a modified file relative to HEAD', () => {
    const dir = tmpBackend({
      'src/utils/runMigrations.js': [
        'async function run(pool) {',
        "  await pool.query('CREATE TABLE IF NOT EXISTS new_tbl (id SERIAL PRIMARY KEY, a TEXT)');",
        "  await pool.query('CREATE TABLE IF NOT EXISTS old_tbl (id SERIAL PRIMARY KEY)');",
        "  await pool.query('ALTER TABLE old_tbl ADD COLUMN IF NOT EXISTS b TEXT');",
        '}',
      ].join('\n'),
      'src/worker/routes/x.js': "async function f(db) { await db.query('SELECT a FROM new_tbl'); await db.query('SELECT b FROM old_tbl'); }",
    });
    try {
      const headText = "async function run(pool) { await pool.query('CREATE TABLE IF NOT EXISTS old_tbl (id SERIAL PRIMARY KEY)'); }";
      const calls = [];
      const git = (args) => {
        calls.push(args.join(' '));
        if (args[0] === 'rev-parse') return `${path.dirname(dir)}\n`;
        if (args[0] === 'status') return ` M ${path.basename(dir)}/src/utils/runMigrations.js\n`;
        if (args[0] === 'show') return headText;
        throw new Error('unexpected git call');
      };
      const model = buildKnownDdl({ backendDir: dir });
      const g = gitDdlStatus({ backendDir: dir, files: model.sourcesScanned, git });
      expect(g.available).toBe(true);
      const r = resolveRequirements(extractRequirements({ backendDir: dir }), model, { git: g });
      expect(r.findings.workingTreeOnly.tables.map((t) => t.table)).toEqual(['new_tbl']);
      expect(r.findings.workingTreeOnly.columns.map((c) => `${c.table}.${c.column}`)).toEqual(['old_tbl.b']);
      // only read-only git verbs
      expect(calls.every((c) => /^(rev-parse|status|show) /.test(c))).toBe(true);
    } finally { rmrf(dir); }
  });

  it('is silent when git is not available', () => {
    const g = gitDdlStatus({ backendDir: BACKEND_DIR, files: [], git: () => { throw new Error('no git'); } });
    expect(g.available).toBe(false);
  });
});

/* ------------------------------------------------------------------------------------------------- */
/* the real Worker tree                                                                               */
/* ------------------------------------------------------------------------------------------------- */

describe('extraction from the real Worker tree', () => {
  let req;
  let resolved;
  beforeAll(() => {
    const model = buildKnownDdl({ backendDir: BACKEND_DIR });
    req = extractRequirements({ backendDir: BACKEND_DIR });
    resolved = resolveRequirements(req, model);
  }, 30000);

  it('scans the Worker files and finds tables with file:line evidence', () => {
    expect(req.files.length).toBeGreaterThan(50);
    expect(req.files.every((f) => f.startsWith('src/worker/'))).toBe(true);
    expect(req.files).not.toContain('src/worker/routes/_example.js');
    const names = resolved.tables.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['users', 'user_sessions', 'subscription_plans', 'audit_logs']));
    for (const t of resolved.tables) {
      expect(t.workerFiles.length).toBeGreaterThan(0);
      for (const w of t.workerFiles) { expect(w.file).toMatch(/^src\/worker\/.+\.js$/); expect(w.lines.every((l) => l > 0)).toBe(true); }
    }
    const users = resolved.tables.find((t) => t.name === 'users');
    expect(users.columns.find((c) => c.name === 'email').evidence[0].line).toBeGreaterThan(0);
  });

  it('every table the Worker uses is either defined somewhere or listed as a finding', () => {
    const undef = resolved.tables.filter((t) => !t.ddl.defined).map((t) => t.name).sort();
    expect(undef).toEqual([...resolved.findings.notFoundTables].sort());
    expect(resolved.summary.tablesReferenced).toBe(resolved.tables.length);
    const s = resolved.summary;
    expect(s.inDatabaseSql + s.inMigrationFileNotDatabaseSql + s.bootOnly + s.notFound).toBe(s.tablesReferenced);
  });

  it('users.onboarding_completed is known only through the boot ALTER, and the ON CONFLICT targets are all checked', () => {
    const col = resolved.tables.find((t) => t.name === 'users').columns.find((c) => c.name === 'onboarding_completed');
    if (col) { // present once the auth slice's planService is in the tree
      expect(col.status).toBe('found');
      expect(col.bootOnly).toBe(true);
    }
    const oc = resolved.tables.flatMap((t) => t.conflicts.filter((c) => c.needsUnique));
    expect(oc.length).toBeGreaterThan(5);
    for (const c of oc) expect(['satisfied', 'not-found']).toContain(c.status);
  });

  it('is deterministic: two extractions give identical JSON', () => {
    const model = buildKnownDdl({ backendDir: BACKEND_DIR });
    const again = resolveRequirements(extractRequirements({ backendDir: BACKEND_DIR }), model);
    expect(JSON.stringify(again)).toBe(JSON.stringify(resolved));
  });

  it('a simulated fully-booted database has exactly the tables the repository cannot create missing', () => {
    const model = buildKnownDdl({ backendDir: BACKEND_DIR });
    const cat = mockCatalog(catalogFromModel(model));
    const res = live.checkCatalog(resolved, cat);
    const undefinedTables = resolved.findings.notFoundTables;
    expect(res.missingTables.map((t) => t.table).sort()).toEqual([...undefinedTables, ...resolved.findings.mysqlOnlyTables].sort());
    expect(res.missingUniques).toEqual([]);
    // every missing column is one the repository never declares
    const declaredNowhere = new Set(resolved.findings.notFoundColumns.map((c) => `${c.table}.${c.column}`));
    for (const m of res.missingColumns) expect(declaredNowhere.has(`${m.table}.${m.column}`)).toBe(true);
  });
});

/** build the in-memory catalog structure checkCatalog consumes, from mockPg-style data (no client involved) */
function mockCatalog({ tables, columns, uniques }) {
  const cat = { identity: {}, tables: new Map(), columns: new Map(), uniques: new Map(), constraintNames: new Set() };
  for (const t of tables) cat.tables.set(t, { schema: 'public', type: 'BASE TABLE' });
  for (const [t, cs] of Object.entries(columns)) if (cat.tables.has(t)) cat.columns.set(t, new Map(cs.map((c) => [c, { type: 'text' }])));
  for (const u of uniques) {
    if (!cat.tables.has(u.table)) continue;
    if (!cat.uniques.has(u.table)) cat.uniques.set(u.table, []);
    cat.uniques.get(u.table).push({ name: u.name, kind: u.kind, columns: u.columns, partial: false, expr: false });
    cat.constraintNames.add(u.name);
  }
  return cat;
}

/* ------------------------------------------------------------------------------------------------- */
/* read-only guard                                                                                    */
/* ------------------------------------------------------------------------------------------------- */

describe('read-only guard', () => {
  it('accepts every fixed catalog query this tool sends', () => {
    for (const [name, sql] of Object.entries(live.CATALOG_SQL)) {
      expect(() => live.assertReadOnlySql(sql)).not.toThrow();
      expect(name).toBeTruthy();
    }
    expect(() => live.assertReadOnlySql("SELECT 'DROP TABLE users' AS harmless")).not.toThrow(); // inside a string literal
    expect(() => live.assertReadOnlySql('  select 1;  ')).not.toThrow();
  });

  it.each([
    ['INSERT', "INSERT INTO users (email) VALUES ('a')"],
    ['UPDATE', 'UPDATE users SET role = 1'],
    ['DELETE', 'DELETE FROM users'],
    ['DROP', 'DROP TABLE users'],
    ['CREATE', 'CREATE TABLE t (id int)'],
    ['ALTER', 'ALTER TABLE users ADD COLUMN x int'],
    ['TRUNCATE', 'TRUNCATE users'],
    ['GRANT', 'GRANT ALL ON users TO public'],
    ['multiple statements', 'SELECT 1; DROP TABLE users'],
    ['stacked after comment', 'SELECT 1; -- x\nDELETE FROM users'],
    ['comment hiding the verb', '/* SELECT */ DROP TABLE users'],
    ['line comment hiding the verb', '-- SELECT 1\nDELETE FROM users'],
    ['CTE with DML', 'WITH x AS (DELETE FROM users RETURNING id) SELECT * FROM x'],
    ['SELECT INTO creates a table', 'SELECT * INTO copy_of_users FROM users'],
    ['locking select', 'SELECT * FROM users FOR UPDATE'],
    ['set_config', "SELECT set_config('search_path', 'evil', false)"],
    ['nextval', "SELECT nextval('users_id_seq')"],
    ['pg_terminate_backend', 'SELECT pg_terminate_backend(123)'],
    ['dollar quoting', 'SELECT $$ x $$'],
    ['EXPLAIN ANALYZE', 'EXPLAIN ANALYZE SELECT 1'],
    ['transaction control', 'BEGIN'],
    ['SET', 'SET search_path = evil'],
    ['COPY', 'COPY users TO STDOUT'],
    ['empty', '   '],
  ])('refuses %s', (_label, sql) => {
    expect(() => live.assertReadOnlySql(sql)).toThrow(live.ReadOnlyViolation);
  });

  it('makeReadOnlyClient never forwards a refused statement to the underlying client', async () => {
    const pg = mockPg({ tables: [] });
    const ro = live.makeReadOnlyClient(pg);
    await expect(ro.query('DROP TABLE users')).rejects.toThrow(live.ReadOnlyViolation);
    await expect(ro.query('DELETE FROM users')).rejects.toThrow(/only SELECT/);
    expect(pg.seen).toEqual([]);
    await ro.query(live.CATALOG_SQL.identity);
    expect(pg.seen).toHaveLength(1);
    expect(ro.executed).toHaveLength(1);
    expect(Object.keys(ro)).not.toContain('raw');
  });
});

/* ------------------------------------------------------------------------------------------------- */
/* live catalog logic against a mock pg client                                                        */
/* ------------------------------------------------------------------------------------------------- */

describe('--check logic with a mock pg client (no network)', () => {
  let dir;
  let resolved;
  let model;
  beforeAll(() => {
    dir = tmpBackend({
      'src/utils/initializeTables.js': [
        'const tables = [',
        '  { name: "a", query: `CREATE TABLE IF NOT EXISTS alpha (id SERIAL PRIMARY KEY, user_id INT NOT NULL, kind TEXT, UNIQUE(user_id, kind));',
        '                          CREATE INDEX IF NOT EXISTS idx_alpha_user ON alpha(user_id);` },',
        '  { name: "b", query: `CREATE TABLE IF NOT EXISTS beta (id SERIAL PRIMARY KEY, label TEXT NOT NULL DEFAULT \'x\', extra TEXT)` },',
        '  { name: "s", query: `CREATE TABLE IF NOT EXISTS subscription_plans (id SERIAL PRIMARY KEY, name VARCHAR(50) UNIQUE NOT NULL)` },',
        '];',
        'module.exports = { tables };',
      ].join('\n'),
      'src/utils/runMigrations.js': [
        'async function run(pool) {',
        "  await pool.query(`INSERT INTO subscription_plans (name) VALUES ('Learn & Build') ON CONFLICT (name) DO NOTHING`);",
        "  await pool.query('ALTER TABLE beta ADD COLUMN IF NOT EXISTS added_later TEXT NOT NULL DEFAULT 1');",
        '}',
      ].join('\n'),
      'src/worker/routes/x.js': [
        'async function f(db) {',
        "  await db.query('INSERT INTO alpha (user_id, kind) VALUES ($1, $2) ON CONFLICT (user_id, kind) DO UPDATE SET kind = $2', []);",
        "  await db.query('SELECT label, extra, added_later, phantom FROM beta', []);",
        "  await db.query('SELECT name FROM subscription_plans', []);",
        "  await db.query('SELECT a FROM gamma_missing', []);",
        '}',
      ].join('\n'),
    });
    model = buildKnownDdl({ backendDir: dir });
    resolved = resolveRequirements(extractRequirements({ backendDir: dir }), model);
  });
  afterAll(() => rmrf(dir));

  const fullDb = () => ({
    tables: ['alpha', 'beta', 'subscription_plans', 'gamma_missing'],
    columns: {
      alpha: ['id', 'user_id', 'kind'], beta: ['id', 'label', 'extra', 'added_later', 'phantom'], subscription_plans: ['id', 'name'], gamma_missing: ['a'],
    },
    uniques: [
      { table: 'alpha', kind: 'unique', columns: ['kind', 'user_id'], name: 'alpha_user_id_kind_key' }, // column order must not matter
      { table: 'subscription_plans', kind: 'unique', columns: ['name'], name: 'sp_name_key' },
    ],
  });

  async function runCheck(dbShape, extra = []) {
    const pg = mockPg(dbShape);
    const ro = live.makeReadOnlyClient(pg);
    const cat = await live.fetchCatalog(ro);
    return { pg, ro, cat, res: live.checkCatalog(resolved, cat) };
    // eslint-disable-next-line no-unreachable
    return extra;
  }

  it('passes when every table, column and ON CONFLICT unique constraint exists', async () => {
    const { res, pg, ro } = await runCheck(fullDb());
    expect(res.ok).toBe(true);
    expect(res.counts).toMatchObject({ tablesMissing: 0, columnsMissing: 0, uniquesMissing: 0 });
    expect(res.counts.uniquesOk).toBe(1); // the one ON CONFLICT in the Worker fixture
    // exactly the five fixed catalog queries, all SELECTs
    expect(pg.seen).toHaveLength(5);
    expect(pg.seen.every((s) => /^SELECT\b/.test(s))).toBe(true);
    expect(ro.executed).toEqual(pg.seen);
  });

  it('never has two catalog queries in flight on the one pg Client (pg 8 deprecation, removed in pg 9)', async () => {
    // found on the first real PostgreSQL 17 run: Promise.all over one Client printed a pg DeprecationWarning
    const pg = mockPg(fullDb());
    let inFlight = 0;
    let maxInFlight = 0;
    const inner = pg.query.bind(pg);
    pg.query = async (sql, params) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setImmediate(r));
      try { return await inner(sql, params); } finally { inFlight--; }
    };
    const cat = await live.fetchCatalog(live.makeReadOnlyClient(pg));
    expect(maxInFlight).toBe(1);
    expect(live.checkCatalog(resolved, cat).ok).toBe(true);
  });

  it('reports a missing table', async () => {
    const db = fullDb();
    db.tables = db.tables.filter((t) => t !== 'gamma_missing');
    const { res } = await runCheck(db);
    expect(res.ok).toBe(false);
    expect(res.missingTables.map((t) => t.table)).toEqual(['gamma_missing']);
    expect(res.missingTables[0].workerFiles[0].file).toBe('src/worker/routes/x.js');
  });

  it('reports missing columns with file:line evidence and how the repository knows them', async () => {
    const db = fullDb();
    db.columns.beta = ['id', 'label']; // extra, added_later, phantom gone
    const { res } = await runCheck(db);
    expect(res.missingColumns.map((c) => `${c.table}.${c.column}`).sort()).toEqual(['beta.added_later', 'beta.extra', 'beta.phantom']);
    const phantom = res.missingColumns.find((c) => c.column === 'phantom');
    expect(phantom.ddlStatus).toBe('not-found'); // declared nowhere in the repository either
    expect(phantom.evidence[0]).toMatchObject({ file: 'src/worker/routes/x.js', line: 3 });
    expect(res.missingColumns.find((c) => c.column === 'added_later').ddlStatus).toBe('found');
  });

  it('reports a missing unique constraint for an ON CONFLICT target, accepts a unique index, rejects a partial one', async () => {
    const db = fullDb();
    db.uniques = db.uniques.filter((u) => u.table !== 'alpha');
    expect((await runCheck(db)).res.missingUniques.map((u) => u.columns.join())).toEqual(['user_id,kind']);

    const withIndex = { ...db, indexes: [{ table_schema: 'public', table_name: 'alpha', index_name: 'uq_alpha', indexdef: 'CREATE UNIQUE INDEX uq_alpha ON public.alpha USING btree (user_id, kind)' }] };
    expect((await runCheck(withIndex)).res.missingUniques).toEqual([]);

    const partial = { ...db, indexes: [{ table_schema: 'public', table_name: 'alpha', index_name: 'uq_alpha', indexdef: 'CREATE UNIQUE INDEX uq_alpha ON public.alpha USING btree (user_id, kind) WHERE (kind IS NOT NULL)' }] };
    expect((await runCheck(partial)).res.missingUniques).toHaveLength(1);
  });

  it('does not report unique constraints or columns for a table that is missing entirely', async () => {
    const db = fullDb();
    db.tables = db.tables.filter((t) => t !== 'alpha');
    const { res } = await runCheck(db);
    expect(res.missingTables.map((t) => t.table)).toEqual(['alpha']);
    expect(res.missingUniques).toEqual([]);
  });

  it('parses unique index definitions robustly', () => {
    expect(live.parseUniqueIndexDef('CREATE UNIQUE INDEX i ON public.t USING btree (a, b DESC)')).toMatchObject({ columns: ['a', 'b'], partial: false, expr: false });
    expect(live.parseUniqueIndexDef('CREATE UNIQUE INDEX i ON public.t USING btree (lower(a))')).toMatchObject({ columns: [], expr: true });
    expect(live.parseUniqueIndexDef('CREATE UNIQUE INDEX i ON public.t USING btree (a) WHERE (b IS NULL AND (c > 1))')).toMatchObject({ columns: ['a'], partial: true });
    expect(live.parseUniqueIndexDef('CREATE INDEX i ON t (a)')).toBeNull();
  });

  describe('--print-fix-sql', () => {
    const fixFor = (res) => live.buildFixSql(model, {
      tables: res.missingTables.map((t) => ({ table: t.table, columns: t.columns, conflicts: resolved.tables.find((x) => x.name === t.table).conflicts })),
      columns: res.missingColumns.map((c) => ({ table: c.table, column: c.column })),
      uniques: res.missingUniques,
    });

    it('prints CREATE TABLE / ALTER TABLE / CREATE UNIQUE INDEX from the known DDL, and says nothing is executed', async () => {
      const db = fullDb();
      db.tables = db.tables.filter((t) => t !== 'beta'); // beta missing entirely
      delete db.columns.beta;
      db.columns.alpha = ['id', 'user_id']; // alpha.kind missing
      db.uniques = db.uniques.filter((u) => u.table !== 'alpha'); // alpha's ON CONFLICT unique missing
      const { res } = await runCheck(db);
      const fix = fixFor(res);
      expect(fix.text).toMatch(/PRINTED ONLY/);
      expect(fix.text).toContain('CREATE TABLE IF NOT EXISTS beta (');
      expect(fix.text).toContain('ALTER TABLE beta ADD COLUMN IF NOT EXISTS added_later TEXT NOT NULL DEFAULT 1;'); // not in the CREATE, added by ALTER
      expect(fix.text).toMatch(/WARNING: NOT NULL without DEFAULT|DEFAULT 1;/);
      expect(fix.text).toContain('NO DDL KNOWN ANYWHERE in the repository for column beta.phantom');
      expect(fix.text).toContain('ALTER TABLE alpha ADD COLUMN IF NOT EXISTS kind TEXT;');
      expect(fix.text).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_alpha_user_id_kind ON alpha (user_id, kind);');
      expect(fix.text).toContain('src/utils/initializeTables.js');
      // every statement is DDL
      expect(new Set(fix.statements.map((s) => s.trim().split(' ')[0].toUpperCase()))).toEqual(new Set(['CREATE', 'ALTER']));
      expect(fix.unresolvable.find((u) => u.column === 'phantom')).toBeDefined();
    });

    it('recreates a missing table with its companion index, without a redundant unique index its CREATE already declares', async () => {
      const db = fullDb();
      db.tables = db.tables.filter((t) => t !== 'alpha');
      delete db.columns.alpha;
      const { res } = await runCheck(db);
      const fix = fixFor(res);
      expect(fix.text).toContain('CREATE TABLE IF NOT EXISTS alpha (');
      expect(fix.text).toContain('UNIQUE(user_id, kind)');
      expect(fix.text).toContain('CREATE INDEX IF NOT EXISTS idx_alpha_user ON alpha(user_id);');
      expect(fix.text).not.toMatch(/CREATE UNIQUE INDEX/);
    });

    it('includes the seed inserts Express boot ran when it has to create a seeded table', async () => {
      const fix = live.buildFixSql(model, { tables: [{ table: 'subscription_plans', columns: ['id', 'name'], conflicts: [] }], columns: [], uniques: [] });
      expect(fix.text).toMatch(/SEEDED by Express boot/);
      expect(fix.statements.some((s) => /^INSERT INTO subscription_plans/i.test(s))).toBe(true);
    });

    it('says so when a table has no DDL anywhere, and when there is nothing to fix', () => {
      const fix = live.buildFixSql(model, { tables: [{ table: 'gamma_missing', columns: ['a'], conflicts: [] }], columns: [], uniques: [] });
      expect(fix.text).toMatch(/NO DDL KNOWN ANYWHERE in the repository for table gamma_missing/);
      expect(fix.statements).toEqual([]);
      const none = live.buildFixSql(model, { tables: [], columns: [], uniques: [] });
      expect(none.text).toMatch(/nothing to create/);
    });

    it('translates the MySQL-dialect database.sql when it is the only source, and flags it for review', () => {
      const d2 = tmpBackend({ 'database.sql': 'CREATE TABLE IF NOT EXISTS legacy (id INT AUTO_INCREMENT PRIMARY KEY, data JSON);' });
      try {
        const m2 = buildKnownDdl({ backendDir: d2 });
        const fix = live.buildFixSql(m2, { tables: [{ table: 'legacy', columns: ['id', 'data'], conflicts: [] }], columns: [], uniques: [] });
        expect(fix.text).toMatch(/translated from MySQL dialect/);
        expect(fix.text).toMatch(/id SERIAL PRIMARY KEY/);
        expect(fix.text).toMatch(/data JSONB/);
        expect(fix.text).not.toMatch(/AUTO_INCREMENT/);
      } finally { rmrf(d2); }
    });
  });
});

/* ------------------------------------------------------------------------------------------------- */
/* the CLI                                                                                            */
/* ------------------------------------------------------------------------------------------------- */

describe('CLI: check-schema.js', () => {
  const URL_WITH_SECRET = 'postgresql://neondb_owner:sup3r-s3cret-pw@ep-cool-branch-123.eu-central-1.aws.neon.tech/appdb?sslmode=require';
  let dir;
  beforeAll(() => {
    dir = tmpBackend({
      'src/utils/initializeTables.js': 'const t = [{ query: `CREATE TABLE IF NOT EXISTS alpha (id SERIAL PRIMARY KEY, user_id INT, UNIQUE(user_id))` }]; module.exports = t;',
      'src/worker/routes/x.js': "async function f(db) { await db.query('INSERT INTO alpha (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING'); await db.query('SELECT zed FROM alpha'); }",
    });
  });
  afterAll(() => rmrf(dir));

  it('--help states that it never executes DDL, that --check is read-only, and where the URL comes from', async () => {
    const c = capture();
    expect(await cli.run(['--help'], { stdout: c.out, stderr: c.err })).toBe(0);
    expect(c.text()).toMatch(/NEVER executes/);
    expect(c.text()).toMatch(/PRINTED ONLY/);
    expect(c.text()).toMatch(/DATABASE_URL/);
    expect(c.text()).toMatch(/never reads backend\/\.env/);
    expect(c.text()).toMatch(/single plain SELECT/);
  });

  it('rejects unknown options with exit code 2', async () => {
    const c = capture();
    expect(await cli.run(['--frobnicate'], { stdout: c.out, stderr: c.err })).toBe(2);
    expect(c.text()).toMatch(/unknown option/);
  });

  it('--extract is the default, opens no connection and writes JSON and Markdown only where asked', async () => {
    const out = path.join(dir, 'out', 'req.json');
    const md = path.join(dir, 'out', 'req.md');
    const c = capture();
    const pgFactory = () => { throw new Error('extract must not open a connection'); };
    const code = await cli.run(['--out', out, '--md', md], { stdout: c.out, stderr: c.err, backendDir: dir, pgFactory, env: {}, noGit: true });
    expect(code).toBe(0);
    const j = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(j.summary.tablesReferenced).toBe(1);
    expect(j.tables[0]).toMatchObject({ name: 'alpha' });
    expect(fs.readFileSync(md, 'utf8')).toMatch(/Cutover prerequisite/);
    expect(c.text()).toMatch(/alpha/);
  });

  it('--strict fails the offline scan when the Worker uses something no DDL defines', async () => {
    const d2 = tmpBackend({ 'src/worker/routes/x.js': "async function f(db) { await db.query('SELECT a FROM ghost'); }" });
    try {
      const c = capture();
      expect(await cli.run(['--strict'], { stdout: c.out, stderr: c.err, backendDir: d2, noGit: true })).toBe(1);
      expect(c.text()).toMatch(/NOWHERE|NOT FOUND ANYWHERE/);
      const c2 = capture();
      expect(await cli.run([], { stdout: c2.out, stderr: c2.err, backendDir: d2, noGit: true })).toBe(0);
    } finally { rmrf(d2); }
  });

  it('--check without a connection string in the environment does nothing and exits 2', async () => {
    const c = capture();
    const pgFactory = jest.fn();
    expect(await cli.run(['--check'], { stdout: c.out, stderr: c.err, backendDir: dir, env: {}, pgFactory, noGit: true })).toBe(2);
    expect(pgFactory).not.toHaveBeenCalled();
    expect(c.text()).toMatch(/DATABASE_URL/);
  });

  it('--check passes (exit 0) against a mock database that has everything, and never leaks the URL or password', async () => {
    const pg = mockPg({
      tables: ['alpha'], columns: { alpha: ['id', 'user_id', 'zed'] }, uniques: [{ table: 'alpha', kind: 'unique', columns: ['user_id'], name: 'alpha_user_id_key' }],
    });
    const c = capture();
    const code = await cli.run(['--check', '--verbose'], { stdout: c.out, stderr: c.err, backendDir: dir, env: { DATABASE_URL: URL_WITH_SECRET }, pgFactory: (u) => { expect(u).toBe(URL_WITH_SECRET); return pg; }, noGit: true });
    expect(code).toBe(0);
    expect(c.text()).toMatch(/RESULT: OK/);
    expect(c.text()).toMatch(/ep-cool-branch-123\.eu-central-1\.aws\.neon\.tech\/appdb/); // which target, so a wrong one is visible
    expect(c.text()).not.toMatch(/sup3r-s3cret-pw|neondb_owner|postgresql:\/\//);
    expect(pg.seen.every((s) => /^SELECT\b/.test(s))).toBe(true);
    expect(pg.connected).toBe(false); // connection closed
  });

  it('--check exits 1 and lists what is missing; --print-fix-sql prints DDL but the database receives only SELECTs', async () => {
    const pg = mockPg({ tables: ['alpha'], columns: { alpha: ['id'] }, uniques: [] });
    const c = capture();
    const code = await cli.run(['--check', '--print-fix-sql'], { stdout: c.out, stderr: c.err, backendDir: dir, env: { DATABASE_URL: URL_WITH_SECRET }, pgFactory: () => pg, noGit: true });
    expect(code).toBe(1);
    const text = c.text();
    expect(text).toMatch(/MISSING COLUMNS/);
    expect(text).toMatch(/alpha\.user_id/);
    expect(text).toMatch(/alpha\.zed/);
    expect(text).toMatch(/MISSING UNIQUE/);
    expect(text).toMatch(/RESULT: FAIL/);
    expect(text).toMatch(/PRINTED ONLY/);
    expect(text).toMatch(/ALTER TABLE alpha ADD COLUMN IF NOT EXISTS user_id INT/);
    expect(text).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_alpha_user_id ON alpha \(user_id\);/);
    expect(pg.seen.length).toBeGreaterThan(0);
    for (const s of pg.seen) expect(s).toMatch(/^SELECT\b/); // the printed DDL was never sent
    expect(pg.seen.join('\n')).not.toMatch(/ALTER|CREATE|INSERT|DROP/i);
    expect(text).not.toMatch(/sup3r-s3cret-pw/);
  });

  it('uses --url-env to read another variable', async () => {
    const pg = mockPg({ tables: ['alpha'], columns: { alpha: ['id', 'user_id', 'zed'] }, uniques: [{ table: 'alpha', kind: 'unique', columns: ['user_id'] }] });
    const c = capture();
    const code = await cli.run(['--check', '--url-env', 'NEON_BRANCH_URL'], { stdout: c.out, stderr: c.err, backendDir: dir, env: { NEON_BRANCH_URL: URL_WITH_SECRET }, pgFactory: () => pg, noGit: true });
    expect(code).toBe(0);
  });

  it('a connection failure exits 2 and scrubs the URL, user and password from the message', async () => {
    const pg = mockPg({ connectError: `connect ECONNREFUSED for ${URL_WITH_SECRET} (password authentication failed for user "neondb_owner", pw sup3r-s3cret-pw)` });
    const c = capture();
    const code = await cli.run(['--check'], { stdout: c.out, stderr: c.err, backendDir: dir, env: { DATABASE_URL: URL_WITH_SECRET }, pgFactory: () => pg, noGit: true });
    expect(code).toBe(2);
    expect(c.text()).toMatch(/could not connect/);
    expect(c.text()).not.toMatch(/sup3r-s3cret-pw|neondb_owner/);
    expect(pg.seen).toEqual([]);
  });

  it('scrub() removes credentials however they appear', () => {
    expect(cli.scrub(`bad ${URL_WITH_SECRET} x`, URL_WITH_SECRET)).not.toMatch(/sup3r|neondb_owner/);
    expect(cli.scrub('postgres://u:p@h/db failed')).toBe('postgres://***@h/db failed');
    expect(cli.describeTarget(URL_WITH_SECRET)).toBe('ep-cool-branch-123.eu-central-1.aws.neon.tech/appdb');
  });

  it('never loads dotenv or reads a .env file', () => {
    const src = [
      path.join(BACKEND_DIR, 'scripts', 'migration', 'check-schema.js'),
      ...fs.readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.js')).map((f) => path.join(SCHEMA_DIR, f)),
    ].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    expect(src).not.toMatch(/require\(['"]dotenv/);
    expect(src).not.toMatch(/readFileSync\([^)]*\.env/);
  });
});

/* ------------------------------------------------------------------------------------------------- */
/* Markdown report                                                                                    */
/* ------------------------------------------------------------------------------------------------- */

describe('Markdown report', () => {
  it('contains the cutover prerequisite, the check command, a row per table and the findings', () => {
    const model = buildKnownDdl({ backendDir: BACKEND_DIR });
    const resolved = resolveRequirements(extractRequirements({ backendDir: BACKEND_DIR }), model);
    const md = render.renderMarkdown(resolved, { prefixMap: render.routePrefixMap(BACKEND_DIR) });
    expect(md).toMatch(/## Cutover prerequisite/);
    expect(md).toMatch(/node backend\/scripts\/migration\/check-schema\.js --check/);
    expect(md).toMatch(/Neon \*\*branch\*\*/);
    for (const t of resolved.tables) expect(md).toContain(`| \`${t.name}\` |`);
    expect(md).toMatch(/Schema drift/);
    expect(md).toMatch(/learning_streaks/);
    expect(md).toMatch(/No single variant satisfies every Worker query/);
    expect(md).toMatch(/Exists only because Express boot created it\?/);
  });

  it('maps route files to /api prefixes through the Worker mount files', () => {
    const map = render.routePrefixMap(BACKEND_DIR);
    expect(map.get('community')).toEqual(['/api/community']);
    expect(map.get('practice')).toEqual(['/api/practice']);
  });
});

describe('DdlModel', () => {
  it('reports the source kinds and column provenance of a hand-built model', () => {
    const m = new DdlModel();
    const src = { kind: 'boot', file: 'src/x.js', line: 3 };
    m.ingest(parseDdlText('CREATE TABLE t (id SERIAL PRIMARY KEY, a TEXT UNIQUE)', () => 1), () => src);
    m.ingest(parseDdlText('ALTER TABLE t ADD COLUMN b INT', () => 1), () => ({ kind: 'migration', file: 'm.sql', line: 1 }));
    expect([...m.kindsOf('t')]).toEqual(['boot']);
    expect([...m.columnsOf('t').keys()]).toEqual(['id', 'a', 'b']);
    expect(m.columnsOf('t').get('b')[0]).toMatchObject({ via: 'alter' });
    expect(m.uniquesOf('t').map((u) => u.columns.join())).toEqual(['id', 'a']);
  });
});

/* ------------------------------------------------------------------------------------------------- */
/* extras: FK ordering of printed DDL, parity with Express, JSON mode                                  */
/* ------------------------------------------------------------------------------------------------- */

describe('printed DDL creates referenced tables first', () => {
  it('orders CREATE TABLE statements by foreign-key dependency', () => {
    const d = tmpBackend({
      'src/utils/initializeTables.js': [
        'const t = [',
        '  { query: `CREATE TABLE IF NOT EXISTS a_child (id SERIAL PRIMARY KEY, parent_id INTEGER REFERENCES z_parent(id))` },',
        '  { query: `CREATE TABLE IF NOT EXISTS z_parent (id SERIAL PRIMARY KEY)` },',
        '  { query: `CREATE TABLE IF NOT EXISTS m_other (id SERIAL PRIMARY KEY, c INTEGER, FOREIGN KEY (c) REFERENCES a_child(id))` },',
        '];',
        'module.exports = t;',
      ].join('\n'),
    });
    try {
      const model = buildKnownDdl({ backendDir: d });
      const fix = live.buildFixSql(model, {
        tables: ['a_child', 'm_other', 'z_parent'].map((table) => ({ table, columns: [], conflicts: [] })), columns: [], uniques: [],
      });
      const order = fix.statements.filter((s) => s.startsWith('CREATE TABLE')).map((s) => s.split(' ')[5]);
      expect(order).toEqual(['z_parent', 'a_child', 'm_other']);
    } finally { rmrf(d); }
  });
});

describe('parity with the Express runtime SQL', () => {
  it('lists what only the Worker needs and what only Express needs, ignoring the boot DDL files', () => {
    const d = tmpBackend({
      'src/routes/a.js': "async function f(pool) { await pool.query('SELECT id, name FROM t1'); await pool.query('SELECT z FROM express_only'); }",
      'src/utils/runMigrations.js': "async function r(pool) { await pool.query(`INSERT INTO seed_only (a) VALUES (1)`); }",
      'src/worker/routes/a.js': "async function f(db) { await db.query('SELECT id, name, extra FROM t1'); await db.query('SELECT 1 FROM t2'); }",
    });
    try {
      const built = cli.buildResult({ backendDir: d, useGit: false });
      const p = built.resolved.findings.expressParity;
      expect(p.workerOnlyTables).toEqual(['t2']);
      expect(p.workerOnlyColumns.map((c) => `${c.table}.${c.column}`)).toEqual(['t1.extra']);
      expect(p.expressOnlyTables.map((t) => t.table)).toEqual(['express_only']);
      expect(p.expressOnlyColumns).toEqual([]);
    } finally { rmrf(d); }
  });

  it('the real Worker needs no table or column that the real Express SQL does not', () => {
    const built = cli.buildResult({ backendDir: BACKEND_DIR, useGit: false });
    const p = built.resolved.findings.expressParity;
    expect(p).not.toBeNull();
    expect(p.workerOnlyTables).toEqual([]);
    expect(p.workerOnlyColumns).toEqual([]);
  }, 30000);
});

describe('--json output', () => {
  it('is parseable with --check and --print-fix-sql: the target line goes to stderr, the DDL into a field', async () => {
    const d = tmpBackend({
      'src/utils/initializeTables.js': 'const t = [{ query: `CREATE TABLE IF NOT EXISTS alpha (id SERIAL PRIMARY KEY, user_id INT)` }]; module.exports = t;',
      'src/worker/routes/x.js': "async function f(db) { await db.query('SELECT user_id FROM alpha'); }",
    });
    try {
      const pg = mockPg({ tables: [], columns: {}, uniques: [] });
      const stdout = [];
      const stderr = [];
      const code = await cli.run(['--check', '--json', '--print-fix-sql'], {
        stdout: (s) => stdout.push(s), stderr: (s) => stderr.push(s), backendDir: d, env: { DATABASE_URL: 'postgresql://u:pw123456@host.example/db' }, pgFactory: () => pg, noGit: true,
      });
      expect(code).toBe(1);
      const j = JSON.parse(stdout.join('\n'));
      expect(j.check.missingTables.map((t) => t.table)).toEqual(['alpha']);
      expect(j.fixSql).toContain('CREATE TABLE IF NOT EXISTS alpha');
      expect(stderr.join('\n')).toContain('host.example/db');
      expect(stderr.join('\n') + stdout.join('\n')).not.toContain('pw123456');
    } finally { rmrf(d); }
  });
});
