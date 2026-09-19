'use strict';

/**
 * requirements.js - what schema the Worker's SQL needs, and where the repository's DDL provides it.
 *
 *   extractRequirements({ backendDir, workerDir })  -> Requirements   (scan + analyze every Worker SQL string)
 *   resolveRequirements(req, model)                 -> Resolved        (label each table / column / ON CONFLICT target)
 *
 * Requirements = {
 *   files:[rel], sqlSites, literalSites, excluded:[rel], errors:[str],
 *   tables: Map<name, { name, files: Map<file,{lines:Set,uses:Set}>, columns: Map<col,{confidence,uses:Set,evidence:[{file,line,use}]}>,
 *                       conflicts:[{columns,constraint,exprTarget,where,action,file,line}], ambiguous:[...] }>,
 *   systemTables:[name], dynamics:[{file,line,kind,expr}], unresolved:[{file,line,expr}], workerDdl:[{file,line,kind}]
 * }
 */

const fs = require('fs');
const path = require('path');
const { scanSource } = require('./jsSql');
const { analyzeSql } = require('./sqlAnalyze');
const { computeDrift, toPosix } = require('./ddlModel');

const DEFAULT_EXCLUDES = ['routes/_example.js'];

function listJsFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) out.push(p);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out.sort();
}

const isWriteUse = (u) => ['INTO', 'UPDATE', 'DELETE FROM', 'ON CONFLICT'].includes(u);

function extractRequirements({
  backendDir, workerDir, dirs = null, includeExample = false, sourceOverride = null, excludeFiles = [],
} = {}) {
  const dir = workerDir || path.join(backendDir, 'src', 'worker');
  const req = {
    files: [], excluded: [], errors: [], sqlSites: 0, literalSites: 0,
    tables: new Map(), systemTables: new Set(), dynamics: [], unresolved: [], workerDdl: [],
  };
  const excludes = includeExample ? [] : DEFAULT_EXCLUDES;
  const table = (name) => {
    let t = req.tables.get(name);
    if (!t) {
      t = { name, files: new Map(), columns: new Map(), conflicts: [], ambiguous: [] };
      req.tables.set(name, t);
    }
    return t;
  };
  const seen = new Set();
  const once = (key) => { if (seen.has(key)) return false; seen.add(key); return true; };

  const scanDirs = dirs || [dir];
  const files = sourceOverride
    ? Object.keys(sourceOverride).sort()
    : scanDirs.flatMap((d) => listJsFiles(d)).map((p) => toPosix(path.relative(backendDir, p)));
  for (const file of files) {
    const inDir = file.replace(/^src\/worker\//, '');
    if (excludes.includes(inDir) || excludeFiles.includes(file)) { req.excluded.push(file); continue; }
    const source = sourceOverride ? sourceOverride[file] : fs.readFileSync(path.join(backendDir, file), 'utf8');
    let scanned;
    try {
      scanned = scanSource(source, { file, mode: 'sql' });
    } catch (e) {
      req.errors.push(`${file}: ${e.message}`);
      continue;
    }
    req.files.push(file);
    req.errors.push(...scanned.errors);
    for (const u of scanned.unresolved) req.unresolved.push({ file, line: u.line, expr: u.expr });
    for (const site of scanned.sites) {
      const a = analyzeSql(site.alt.text, site.alt.lineAt);
      // a "literal" site is a heuristic hit (string that looks like SQL but is not directly a .query() argument)
      if (site.kind === 'literal') req.literalSites++; else req.sqlSites++;
      const dynById = new Map(site.alt.dyns.map((d) => [d.id, d]));
      for (const d of a.dynamics) {
        const info = dynById.get(d.id);
        if (once(`dyn|${file}|${d.line}|${d.kind}|${info && info.expr}`)) {
          req.dynamics.push({ file, line: d.line, kind: d.kind, expr: info ? info.expr : '?' });
        }
      }
      for (const d of a.ddl) if (once(`ddl|${file}|${d.line}|${d.kind}`)) req.workerDdl.push({ file, line: d.line, kind: d.kind });
      for (const t of a.tables) {
        if (t.system) { req.systemTables.add(t.name); continue; }
        const rec = table(t.name);
        if (!rec.files.has(file)) rec.files.set(file, { lines: new Set(), uses: new Set() });
        const f = rec.files.get(file);
        f.lines.add(t.line);
        f.uses.add(t.use);
        if (!site.inTry) f.unguarded = true;
      }
      for (const c of a.columns) {
        if (c.column === '*') continue;
        const rec = table(c.table);
        if (!rec.columns.has(c.column)) rec.columns.set(c.column, { confidence: c.confidence, uses: new Set(), evidence: [] });
        const col = rec.columns.get(c.column);
        if (c.confidence === 'certain') col.confidence = 'certain';
        col.uses.add(c.use);
        if (once(`col|${file}|${c.line}|${c.table}|${c.column}|${c.use}`)) col.evidence.push({ file, line: c.line, use: c.use });
      }
      for (const c of a.conflicts) {
        const rec = table(c.table);
        if (once(`cf|${file}|${c.line}|${c.table}|${c.columns.join(',')}`)) {
          rec.conflicts.push({
            columns: c.columns, constraint: c.constraint, exprTarget: c.exprTarget, where: c.where, action: c.action, file, line: c.line,
          });
        }
      }
      for (const m of a.ambiguous) {
        // attribute to every candidate table so live checks can see it; recorded once per (site, column)
        if (!once(`amb|${file}|${m.line}|${m.column}`)) continue;
        req.ambiguousList = req.ambiguousList || [];
        req.ambiguousList.push({ file, line: m.line, column: m.column, candidates: m.candidates, hasOther: m.hasOther, use: m.use });
      }
    }
  }
  req.ambiguousList = req.ambiguousList || [];
  req.systemTables = [...req.systemTables].sort();
  return req;
}

/* ------------------------------------------------------------------------------------------------ */
/* resolution against the known DDL                                                                  */
/* ------------------------------------------------------------------------------------------------ */

const setKey = (cols) => cols.slice().sort().join(',');

const uniqStr = (a) => [...new Set(a)];

/** A Postgres-applicable, non-boot DDL source: a migration file, or a PG-dialect database.sql. */
const isStandalonePg = (source, dialect) => (source.kind === 'migration') || (source.kind === 'database.sql' && dialect !== 'mysql');

/**
 * `git` = result of ddlModel.gitDdlStatus() (or null): flags DDL that exists only in uncommitted working-tree edits.
 */
function resolveRequirements(req, model, { git = null } = {}) {
  const drift = computeDrift(model);
  const wtOnly = (source, key) => !!git && git.available && git.modified.has(source.file) && !(git.head.get(source.file) || new Set()).has(key);
  const driftByTable = new Map(drift.map((d) => [d.table, d]));
  const tables = [];
  for (const name of [...req.tables.keys()].sort()) {
    const t = req.tables.get(name);
    const known = model.tables.get(name);
    const variants = known ? known.variants : [];
    const kinds = new Set(variants.map((v) => v.source.kind));
    const pgKinds = new Set(variants.filter((v) => v.dialect !== 'mysql').map((v) => v.source.kind));
    let category = 'not-found';
    if (kinds.has('database.sql')) category = 'database.sql';
    else if (kinds.has('migration')) category = 'migration';
    else if (kinds.has('boot')) category = 'boot-only';
    const standalone = variants.some((v) => isStandalonePg(v.source, v.dialect));
    const bootDefined = kinds.has('boot');
    const mysqlOnly = variants.length > 0 && variants.every((v) => v.dialect === 'mysql');
    // "exists only because Express boot created it": the only Postgres-applicable DDL is Express boot code
    const existsOnlyBecauseBoot = bootDefined && !standalone;

    const colMap = known ? model.columnsOf(name) : new Map();
    const columns = [];
    for (const cname of [...t.columns.keys()].sort()) {
      const c = t.columns.get(cname);
      const defs = colMap.get(cname) || [];
      const colKinds = new Set(defs.map((d) => d.source.kind));
      const colStandalone = defs.some((d) => isStandalonePg(d.source, d.dialect));
      const found = defs.length > 0;
      const pgDefs = defs.filter((d) => d.dialect !== 'mysql');
      columns.push({
        name: cname,
        confidence: c.confidence,
        uses: [...c.uses].sort(),
        evidence: c.evidence.sort((x, y) => (x.file < y.file ? -1 : x.file > y.file ? 1 : x.line - y.line)),
        status: !known ? 'table-unknown' : found ? 'found' : 'not-found',
        kinds: [...colKinds].sort(),
        sources: defs.map((d) => d.source),
        bootOnly: found && colKinds.has('boot') && !colStandalone,
        alterOnly: found && defs.every((d) => d.via === 'alter'),
        type: found ? defs[0].column.type : null,
        workingTreeOnly: pgDefs.length > 0 && pgDefs.every((d) => wtOnly(d.source, `c:${name}.${cname}`)),
      });
    }

    const conflicts = t.conflicts.map((c) => {
      const uniques = known ? model.uniquesOf(name) : [];
      const want = setKey(c.columns);
      const satisfiedBy = c.columns.length && !c.exprTarget
        ? uniques.filter((u) => setKey(u.columns) === want && !u.where && u.dialect !== 'mysql')
        : [];
      const needsUnique = c.columns.length > 0 || c.exprTarget || c.constraint;
      return {
        ...c,
        needsUnique: !!needsUnique,
        status: !needsUnique ? 'no-target' : !known ? 'table-unknown' : (satisfiedBy.length ? 'satisfied' : 'not-found'),
        satisfiedBy: satisfiedBy.map((u) => ({ kind: u.kind, source: u.source })),
        bootOnly: satisfiedBy.length > 0 && satisfiedBy.every((u) => u.source.kind === 'boot'),
      };
    });

    // worker coverage of drifted variants
    let driftInfo = null;
    const d = driftByTable.get(name);
    if (d) {
      const needed = columns.map((c) => c.name);
      const adds = new Set(known.adds.map((a) => a.column.name));
      const pgIdx = d.variants.map((v, i) => (v.dialect === 'mysql' ? -1 : i)).filter((i) => i >= 0);
      const unionCols = new Set([...adds]);
      for (const i of pgIdx) d.variants[i].columns.forEach((c) => unionCols.add(c));
      const unionMissing = needed.filter((c) => !unionCols.has(c));
      const coverage = d.variants.map((v) => ({
        source: v.source,
        dialect: v.dialect,
        missingForWorker: needed.filter((c) => !v.columns.includes(c) && !adds.has(c)),
      }));
      const filesOf = (col) => uniqStr(columns.find((c) => c.name === col).evidence.map((e) => e.file));
      // Worker columns a shape has while another Postgres shape lacks them: the code that depends on that shape
      const dependents = d.variants.map((v, i) => {
        if (v.dialect === 'mysql') return [];
        return needed
          .filter((c) => v.columns.includes(c) && pgIdx.some((j) => j !== i && !d.variants[j].columns.includes(c) && !adds.has(c)))
          .map((c) => ({ column: c, files: filesOf(c) }));
      });
      driftInfo = {
        ...d,
        unionMissing,
        // true when the disagreement between the Postgres shapes itself makes some Worker query fail whichever ran first
        noSingleVariant: pgIdx.length > 1 && pgIdx.every((i) => coverage[i].missingForWorker.some((c) => !unionMissing.includes(c))),
        workerCoverage: coverage,
        dependents,
      };
    }

    tables.push({
      name,
      access: [...new Set([...t.files.values()].flatMap((f) => [...f.uses]))].some(isWriteUse)
        ? ([...new Set([...t.files.values()].flatMap((f) => [...f.uses]))].some((u) => !isWriteUse(u)) ? 'R/W' : 'W')
        : 'R',
      workerFiles: [...t.files.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([file, f]) => ({
        file, lines: [...f.lines].sort((x, y) => x - y), uses: [...f.uses].sort(), guarded: !f.unguarded,
      })),
      guarded: [...t.files.values()].every((f) => !f.unguarded),
      ddl: {
        defined: variants.length > 0,
        category,
        kinds: [...kinds].sort(),
        pgKinds: [...pgKinds].sort(),
        mysqlOnly,
        existsOnlyBecauseBoot,
        sources: variants.map((v) => ({ ...v.source, dialect: v.dialect })),
        seeds: (model.seeds.get(name) || []).map((s) => s.source),
        workingTreeOnly: variants.some((v) => v.dialect !== 'mysql')
          && variants.filter((v) => v.dialect !== 'mysql').every((v) => wtOnly(v.source, `t:${name}`)),
      },
      columns,
      conflicts,
      drift: driftInfo,
    });
  }

  // ambiguous (multi-table) columns: flag only when every candidate is known, none has the column, and no non-table source is in scope
  const ambiguousNotFound = [];
  for (const m of req.ambiguousList) {
    if (m.hasOther) continue;
    const knownAll = m.candidates.every((c) => model.tables.has(c));
    if (!knownAll) continue;
    const anywhere = m.candidates.some((c) => model.columnsOf(c).has(m.column));
    if (!anywhere) ambiguousNotFound.push(m);
  }

  const notFoundTables = tables.filter((t) => !t.ddl.defined);
  const mysqlOnlyTables = tables.filter((t) => t.ddl.defined && t.ddl.mysqlOnly);
  const notFoundColumns = [];
  for (const t of tables) {
    if (!t.ddl.defined) continue;
    for (const c of t.columns) if (c.status === 'not-found') notFoundColumns.push({ table: t.name, column: c.name, ...c });
  }
  const conflictsNoUnique = [];
  for (const t of tables) for (const c of t.conflicts) if (c.status === 'not-found') conflictsNoUnique.push({ table: t.name, ...c });

  const cat = (f) => tables.filter(f).length;
  const summary = {
    workerFiles: req.files.length,
    sqlSites: req.sqlSites,
    literalSites: req.literalSites,
    tablesReferenced: tables.length,
    inDatabaseSql: cat((t) => t.ddl.kinds.includes('database.sql')),
    inDatabaseSqlMysqlOnly: mysqlOnlyTables.length,
    inMigrationFile: cat((t) => t.ddl.kinds.includes('migration')),
    inMigrationFileNotDatabaseSql: cat((t) => t.ddl.category === 'migration'),
    inMigrationFileAndBoot: cat((t) => t.ddl.category === 'migration' && t.ddl.kinds.includes('boot')),
    bootOnly: cat((t) => t.ddl.category === 'boot-only'),
    notFound: notFoundTables.length,
    existsOnlyBecauseBoot: cat((t) => t.ddl.existsOnlyBecauseBoot),
    columnsReferenced: tables.reduce((n, t) => n + t.columns.length, 0),
    columnsNotFound: notFoundColumns.length,
    onConflictTargets: tables.reduce((n, t) => n + t.conflicts.filter((c) => c.needsUnique).length, 0),
    onConflictNoUnique: conflictsNoUnique.length,
    driftTables: drift.length,
    workingTreeOnlyTables: tables.filter((t) => t.ddl.workingTreeOnly).length,
    workingTreeOnlyColumns: tables.reduce((n, t) => n + (t.ddl.workingTreeOnly ? 0 : t.columns.filter((c) => c.workingTreeOnly).length), 0),
  };

  return {
    summary,
    tables,
    ambiguous: req.ambiguousList,
    findings: {
      notFoundTables: notFoundTables.map((t) => t.name),
      mysqlOnlyTables: mysqlOnlyTables.map((t) => t.name),
      notFoundColumns,
      ambiguousNotFound,
      conflictsNoUnique,
      dynamics: req.dynamics,
      unresolved: req.unresolved,
      workerDdl: req.workerDdl,
      drift: drift.map((d) => {
        const t = tables.find((x) => x.name === d.table);
        return t && t.drift ? t.drift : { ...d, workerCoverage: null, dependents: null, noSingleVariant: false, unionMissing: [] };
      }),
      systemTables: req.systemTables,
      // DDL that exists only in uncommitted edits (git status / HEAD comparison): Render runs it only once deployed
      workingTreeOnly: {
        tables: tables.filter((t) => t.ddl.workingTreeOnly).map((t) => ({ table: t.name, sources: t.ddl.sources.filter((x) => x.dialect !== 'mysql') })),
        columns: tables.filter((t) => !t.ddl.workingTreeOnly).flatMap((t) => t.columns.filter((c) => c.workingTreeOnly).map((c) => ({ table: t.name, column: c.name, sources: c.sources }))),
      },
    },
    meta: {
      excluded: req.excluded,
      errors: req.errors,
      ddlSources: model.sourcesScanned,
      git: git ? { available: git.available, modifiedDdlFiles: [...git.modified].map(([f, st]) => ({ file: f, state: st })) } : { available: false, modifiedDdlFiles: [] },
    },
  };
}

/**
 * Compare what the Worker's SQL needs with what the Express SQL (runtime code, not the boot DDL files) needs.
 * A faithful port needs exactly what Express needs; a Worker-only table or column means the SQL changed, an
 * Express-only one means something the Worker has not (yet) ported.
 */
function compareWithExpress(workerReq, expressReq) {
  const out = {
    workerOnlyTables: [], workerOnlyColumns: [], expressOnlyTables: [], expressOnlyColumns: [],
  };
  for (const [name, t] of workerReq.tables) {
    const e = expressReq.tables.get(name);
    if (!e) { out.workerOnlyTables.push(name); continue; }
    for (const [c, info] of t.columns) if (!e.columns.has(c)) out.workerOnlyColumns.push({ table: name, column: c, evidence: info.evidence.slice(0, 2) });
  }
  for (const [name, t] of expressReq.tables) {
    const w = workerReq.tables.get(name);
    if (!w) { out.expressOnlyTables.push({ table: name, files: [...t.files.keys()] }); continue; }
    for (const [c, info] of t.columns) if (!w.columns.has(c)) out.expressOnlyColumns.push({ table: name, column: c, evidence: info.evidence.slice(0, 2) });
  }
  const byKey = (a, b) => (`${a.table}.${a.column || ''}` < `${b.table}.${b.column || ''}` ? -1 : 1);
  out.workerOnlyTables.sort();
  out.workerOnlyColumns.sort(byKey);
  out.expressOnlyTables.sort(byKey);
  out.expressOnlyColumns.sort(byKey);
  return out;
}

module.exports = {
  extractRequirements, resolveRequirements, compareWithExpress, listJsFiles, isWriteUse,
};
