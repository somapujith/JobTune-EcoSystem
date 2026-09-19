'use strict';

/**
 * Test helpers for the leaf2 slice (evidence, piiRedaction, activity, learningPath, studyHistory).
 * Everything is synthetic: in-memory db, made-up secrets, no network.
 *
 * tests/worker/helpers/{harness,fakeDb}.js are read-only for this slice, so this file extends
 * them from the outside:
 *   - makeLeaf2Db()   the shared fake db (plans, sessions, audit_logs) plus
 *       * db.on(regex, fn)  register a canned/scripted response for a statement (latest wins)
 *       * stateful models for learning path, SRS, study_sessions and pii_redactions
 *     Like the base fake it THROWS on any statement it does not recognise.
 *   - build()         createApp() wired to that db with the five leaf2 routers mounted at the same
 *                     prefixes, in the same relative order, as backend/src/app.js, and the leaf2
 *                     service factories supplied through the services container.
 *
 * The model is a behavioural stand-in, not Postgres: it proves route/service logic only.
 */
const { createApp } = require('../../../src/worker/app');
const { mountRoutes } = require('../../../src/worker/lib/routes');
const { createServices } = require('../../../src/worker/services');
const { makeEnv, makeCtx, signToken, seedPlans, createFakeDb } = require('../helpers/harness');

const { createEvidenceTracker } = require('../../../src/worker/services/evidence/evidenceTracker');
const { createPiiRedactor } = require('../../../src/worker/services/pii/piiRedactor');
const { createActivityService } = require('../../../src/worker/services/activityService');
const { createLearningPathService } = require('../../../src/worker/services/learningPathService');
const { createSrsService } = require('../../../src/worker/services/srsService');
const { createStudyHistoryService } = require('../../../src/worker/services/studyHistoryService');

const evidenceRoutes = require('../../../src/worker/routes/evidence');
const piiRoutes = require('../../../src/worker/routes/piiRedaction');
const activityRoutes = require('../../../src/worker/routes/activity');
const studyHistoryRoutes = require('../../../src/worker/routes/studyHistory');
const learningPathRoutes = require('../../../src/worker/routes/learningPath');

const norm = (sql) => sql.replace(/\s+/g, ' ').trim();
const res = (rows, rowCount = rows.length) => ({ rows, rowCount });

const addDays = (isoDate, days) => {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function makeLeaf2Db() {
  const db = createFakeDb();
  const baseQuery = db.query.bind(db);
  const extra = [];
  const leafCalls = [];
  db.today = '2026-09-19'; // the database's CURRENT_DATE

  Object.assign(db.state, {
    learning_topics: [], // { id, subject, tier, slug, title, topic_order, content_md }
    learning_topic_progress: [], // { id, user_id, topic_id, completed, completed_at }
    learning_streaks: [], // { user_id, subject, current_streak, longest_streak, last_active_date }
    srs_cards: [],
    study_sessions: [],
    pii_redactions: [],
  });
  const seq = { progress: 0, srs: 0, pii: 0 };

  const isIntLike = (v) => /^-?\d+$/.test(String(v));
  const pgInt = (v, what) => {
    if (!isIntLike(v)) throw new Error(`invalid input syntax for type integer: "${v}" (${what})`);
    return Number(v);
  };

  const handlers = [
    // ---- learning path ------------------------------------------------------------
    [/^SELECT DISTINCT subject FROM learning_topics ORDER BY subject$/, () =>
      res([...new Set(db.state.learning_topics.map((t) => t.subject))].sort().map((subject) => ({ subject })))],
    [/^SELECT t\.id, t\.slug, t\.title, t\.topic_order, \(p\.id IS NOT NULL\) AS completed, p\.completed_at FROM learning_topics t/,
      ([userId, subject, tier]) =>
        res(
          db.state.learning_topics
            .filter((t) => t.subject === subject && t.tier === tier)
            .sort((a, b) => a.topic_order - b.topic_order)
            .map((t) => {
              const p = db.state.learning_topic_progress.find((x) => x.user_id === userId && x.topic_id === t.id);
              return { id: t.id, slug: t.slug, title: t.title, topic_order: t.topic_order, completed: !!p, completed_at: p ? p.completed_at : null };
            })
        )],
    [/^SELECT t\.id, t\.slug, t\.title, t\.topic_order, t\.content_md, \(p\.id IS NOT NULL\) AS completed, p\.completed_at FROM learning_topics t/,
      ([userId, subject, tier, slug]) =>
        res(
          db.state.learning_topics
            .filter((t) => t.subject === subject && t.tier === tier && t.slug === slug)
            .map((t) => {
              const p = db.state.learning_topic_progress.find((x) => x.user_id === userId && x.topic_id === t.id);
              return { id: t.id, slug: t.slug, title: t.title, topic_order: t.topic_order, content_md: t.content_md, completed: !!p, completed_at: p ? p.completed_at : null };
            })
        )],
    [/^INSERT INTO learning_topic_progress \(user_id, topic_id, completed, completed_at\) VALUES \(\$1, \$2, true, CURRENT_TIMESTAMP\) ON CONFLICT \(user_id, topic_id\) DO UPDATE SET completed = true, completed_at = CURRENT_TIMESTAMP$/,
      ([userId, topicId]) => {
        const at = new Date(db.now);
        let row = db.state.learning_topic_progress.find((x) => x.user_id === userId && x.topic_id === topicId);
        if (row) Object.assign(row, { completed: true, completed_at: at });
        else db.state.learning_topic_progress.push((row = { id: ++seq.progress, user_id: userId, topic_id: topicId, completed: true, completed_at: at }));
        return res([], 1);
      }],
    [/^DELETE FROM learning_topic_progress WHERE user_id = \$1 AND topic_id = \$2$/, ([userId, topicId]) => {
      const before = db.state.learning_topic_progress.length;
      db.state.learning_topic_progress = db.state.learning_topic_progress.filter((x) => !(x.user_id === userId && x.topic_id === topicId));
      return res([], before - db.state.learning_topic_progress.length);
    }],
    [/^SELECT current_streak, longest_streak, last_active_date FROM learning_streaks WHERE user_id = \$1 AND subject = \$2$/,
      ([userId, subject]) =>
        res(db.state.learning_streaks.filter((s) => s.user_id === userId && s.subject === subject).map(({ current_streak, longest_streak, last_active_date }) => ({ current_streak, longest_streak, last_active_date })))],
    [/^INSERT INTO learning_streaks \(user_id, subject, current_streak, longest_streak, last_active_date, updated_at\) VALUES \(\$1, \$2, 1, 1, CURRENT_DATE, CURRENT_TIMESTAMP\) ON CONFLICT \(user_id, subject\) DO UPDATE SET/,
      ([userId, subject]) => {
        let row = db.state.learning_streaks.find((s) => s.user_id === userId && s.subject === subject);
        if (!row) {
          db.state.learning_streaks.push((row = { user_id: userId, subject, current_streak: 1, longest_streak: 1, last_active_date: db.today }));
        } else {
          const next =
            row.last_active_date === db.today ? row.current_streak
              : row.last_active_date === addDays(db.today, -1) ? row.current_streak + 1
                : 1;
          row.longest_streak = Math.max(row.longest_streak, next);
          row.current_streak = next;
          row.last_active_date = db.today;
        }
        return res([{ current_streak: row.current_streak, longest_streak: row.longest_streak, last_active_date: row.last_active_date }]);
      }],

    // ---- SRS ---------------------------------------------------------------------
    [/^INSERT INTO srs_cards \(user_id, deck_id, front, back, difficulty\) VALUES /, (params) => {
      for (let i = 0; i < params.length; i += 5) {
        const [user_id, deck_id, front, back, difficulty] = params.slice(i, i + 5);
        const hit = db.state.srs_cards.find((c) => c.user_id === user_id && c.deck_id === deck_id && c.front === front);
        if (hit) Object.assign(hit, { back, difficulty });
        else db.state.srs_cards.push({ id: ++seq.srs, user_id, deck_id, front, back, difficulty, ease_factor: 2.5, interval_days: 0, repetitions: 0, next_review: db.today, created_at: new Date(db.now + seq.srs) });
      }
      return res([], params.length / 5);
    }],
    [/^SELECT id, deck_id, front, back, difficulty, ease_factor, interval_days, repetitions, next_review FROM srs_cards WHERE user_id = \$1 AND next_review <= CURRENT_DATE/,
      (params, sql) => {
        const hasDeck = / AND deck_id = \$2 ORDER BY next_review ASC LIMIT \$3$/.test(sql);
        const limitParam = params[params.length - 1];
        if (typeof limitParam !== 'number' || Number.isNaN(limitParam)) throw new Error(`invalid input syntax for type bigint: "${limitParam}"`);
        const rows = db.state.srs_cards
          .filter((c) => c.user_id === params[0] && c.next_review <= db.today && (!hasDeck || c.deck_id === params[1]))
          .sort((a, b) => (a.next_review < b.next_review ? -1 : a.next_review > b.next_review ? 1 : 0))
          .slice(0, limitParam)
          .map(({ id, deck_id, front, back, difficulty, ease_factor, interval_days, repetitions, next_review }) => ({ id, deck_id, front, back, difficulty, ease_factor, interval_days, repetitions, next_review }));
        return res(rows);
      }],
    [/^SELECT \* FROM srs_cards WHERE id = \$1 AND user_id = \$2$/, ([id, userId]) => {
      const wanted = pgInt(id, 'card id'); // like Postgres, a non-integer id is an error even with no rows
      return res(db.state.srs_cards.filter((c) => c.id === wanted && c.user_id === userId).map((c) => ({ ...c })));
    }],
    [/^UPDATE srs_cards SET ease_factor = \$1, interval_days = \$2, repetitions = \$3, next_review = \$4, last_reviewed = NOW\(\) WHERE id = \$5 AND user_id = \$6$/,
      ([ease_factor, interval_days, repetitions, next_review, id, userId]) => {
        const wanted = pgInt(id, 'card id');
        const hit = db.state.srs_cards.filter((c) => c.id === wanted && c.user_id === userId);
        hit.forEach((c) => Object.assign(c, { ease_factor, interval_days, repetitions, next_review, last_reviewed: new Date(db.now) }));
        return res([], hit.length);
      }],
    [/^SELECT deck_id, COUNT\(\*\) as total_cards, COUNT\(\*\) FILTER \(WHERE next_review <= CURRENT_DATE\) as due_count, COUNT\(\*\) FILTER \(WHERE repetitions > 0\) as reviewed_count, AVG\(ease_factor\) as avg_ease, MIN\(created_at\) as created_at FROM srs_cards WHERE user_id = \$1 GROUP BY deck_id ORDER BY MIN\(created_at\) DESC$/,
      ([userId]) => {
        const groups = new Map();
        for (const c of db.state.srs_cards.filter((x) => x.user_id === userId)) {
          if (!groups.has(c.deck_id)) groups.set(c.deck_id, []);
          groups.get(c.deck_id).push(c);
        }
        const rows = [...groups.entries()].map(([deck_id, cards]) => ({
          deck_id,
          total_cards: String(cards.length),
          due_count: String(cards.filter((c) => c.next_review <= db.today).length),
          reviewed_count: String(cards.filter((c) => c.repetitions > 0).length),
          avg_ease: String(cards.reduce((a, c) => a + c.ease_factor, 0) / cards.length),
          created_at: new Date(Math.min(...cards.map((c) => c.created_at.getTime()))),
        }));
        return res(rows.sort((a, b) => b.created_at - a.created_at));
      }],

    // ---- study_sessions (history only; stats/weekly are scripted per test with db.on) --------
    [/^SELECT id, session_type, topic, difficulty, score, total_questions, time_spent_seconds, created_at FROM study_sessions WHERE user_id = \$1/,
      (params, sql) => {
        const typed = / AND session_type = \$2 ORDER BY created_at DESC LIMIT \$3 OFFSET \$4$/.test(sql);
        const [limit, offset] = params.slice(-2);
        if (![limit, offset].every((n) => typeof n === 'number' && !Number.isNaN(n))) {
          throw new Error(`invalid input syntax for type bigint: "${[limit, offset].find((n) => Number.isNaN(n))}"`);
        }
        return res(
          db.state.study_sessions
            .filter((s) => s.user_id === params[0] && (!typed || s.session_type === params[1]))
            .sort((a, b) => b.created_at - a.created_at)
            .slice(offset, offset + limit)
            .map(({ id, session_type, topic, difficulty, score, total_questions, time_spent_seconds, created_at }) => ({ id, session_type, topic, difficulty, score, total_questions, time_spent_seconds, created_at }))
        );
      }],
    [/^INSERT INTO study_sessions \(user_id, session_type, topic, difficulty, score, total_questions, time_spent_seconds, data\) VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8\) RETURNING id, created_at$/,
      ([user_id, session_type, topic, difficulty, score, total_questions, time_spent_seconds, data]) => {
        const row = { id: db.state.study_sessions.length + 1, user_id, session_type, topic, difficulty, score, total_questions, time_spent_seconds, data: JSON.parse(data), created_at: new Date(db.now) };
        db.state.study_sessions.push(row);
        return res([{ id: row.id, created_at: row.created_at }]);
      }],

    // ---- pii_redactions (redaction_map is JSONB: stored parsed, like the driver returns it) ---
    [/^INSERT INTO pii_redactions \(user_id, context_type, context_id, redaction_map\) VALUES \(\$1, \$2, \$3, \$4\) RETURNING id$/,
      ([user_id, context_type, context_id, redaction_map]) => {
        const row = { id: ++seq.pii, user_id, context_type, context_id, redaction_map: JSON.parse(redaction_map) };
        db.state.pii_redactions.push(row);
        return res([{ id: row.id }]);
      }],
    [/^SELECT id, user_id, redaction_map FROM pii_redactions WHERE id = \$1$/, ([id]) => {
      const wanted = pgInt(id, 'redaction id');
      return res(db.state.pii_redactions.filter((r) => r.id === wanted).map(({ id: i, user_id, redaction_map }) => ({ id: i, user_id, redaction_map })));
    }],
  ];

  db.on = (regex, fn) => {
    extra.unshift([regex, fn]);
    return db;
  };
  db.failOn = (regex, error) => db.on(regex, () => { throw error; });
  db.leafCalls = leafCalls;
  db.leafCallsMatching = (regex) => leafCalls.filter((c) => regex.test(c.sql));

  db.query = (text, params = []) => {
    const sql = norm(text);
    const hit = [...extra, ...handlers].find(([re]) => re.test(sql));
    if (!hit) return baseQuery(text, params);
    leafCalls.push({ sql, params });
    return (async () => {
      await Promise.resolve();
      return hit[1](params, sql);
    })();
  };
  return db;
}

const TOPICS = [
  { id: 1, subject: 'python', tier: 'Beginner', slug: 'variables', title: 'Variables', topic_order: 1, content_md: '# Variables' },
  { id: 2, subject: 'python', tier: 'Beginner', slug: 'loops', title: 'Loops', topic_order: 2, content_md: '# Loops' },
  { id: 3, subject: 'python', tier: 'Intermediate', slug: 'decorators', title: 'Decorators', topic_order: 1, content_md: '# Decorators' },
  { id: 4, subject: 'sql', tier: 'Beginner', slug: 'select', title: 'SELECT', topic_order: 1, content_md: '# SELECT' },
];

const USER_ID = 7;

/**
 * @param {{ plan?: number, userId?: number, db?: object, topics?: object[], embeddings?: object }} [opts]
 */
function build({ plan, userId = USER_ID, db = makeLeaf2Db(), topics = TOPICS, embeddings } = {}) {
  seedPlans(db);
  if (plan) db.state.user_subscriptions.push({ user_id: userId, plan_id: plan });
  db.state.learning_topics.push(...topics.map((t) => ({ ...t })));

  const fakeEmbeddings = embeddings || { embedText: async () => [0.1, 0.2, 0.3] };
  const servicesFactory = ({ db: requestDb, config }) => {
    const overrides = {
      embeddings: fakeEmbeddings,
      evidenceTracker: null, // assigned below: it needs the container for services.embeddings
      piiRedactor: createPiiRedactor(),
      activityService: createActivityService({ db: requestDb }),
      learningPathService: createLearningPathService({ db: requestDb }),
      srsService: createSrsService({ db: requestDb }),
      studyHistoryService: createStudyHistoryService({ db: requestDb }),
    };
    const services = createServices({ db: requestDb, config, overrides });
    overrides.evidenceTracker = createEvidenceTracker({ db: requestDb, services });
    return services;
  };

  const env = makeEnv();
  const ctx = makeCtx();
  const app = createApp({ dbFactory: () => db, servicesFactory });
  mountRoutes(app, '/api/evidence', evidenceRoutes);
  mountRoutes(app, '/api/pii', piiRoutes);
  mountRoutes(app, '/api/activity', activityRoutes);
  mountRoutes(app, '/api/study-history', studyHistoryRoutes);
  mountRoutes(app, '/api/learning-path', learningPathRoutes);

  const token = signToken({ id: userId });
  const call = (method, path, { body, token: t = token, headers = {} } = {}) => {
    const init = { method, headers: { ...headers } };
    if (t) init.headers.Authorization = `Bearer ${t}`;
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    return app.request(path, init, env, ctx);
  };
  return {
    app, db, env, ctx, token, userId, call,
    get: (path, opts) => call('GET', path, opts),
    post: (path, body, opts) => call('POST', path, { ...opts, body }),
    del: (path, opts) => call('DELETE', path, opts),
  };
}

module.exports = { build, makeLeaf2Db, TOPICS, USER_ID, addDays, norm };
