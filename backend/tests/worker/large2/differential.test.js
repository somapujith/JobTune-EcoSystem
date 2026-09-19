'use strict';

/**
 * DIFFERENTIAL TEST: the ORIGINAL Express routers (src/routes/aiCoach.js, src/routes/profiles.js and, through them,
 * src/services/linkedin*.js, read-only) and the Worker ports are driven with identical synthetic inputs:
 * same fake db state, same scripted aiClient, same stubbed global fetch, same clock, same Math.random.
 * For every scenario we assert that BOTH implementations produce
 *   - the same HTTP status and byte-identical JSON body (after masking generatedAt),
 *   - the same AI calls (system/user prompts, model, token budget, temperature, cache flag),
 *   - the same outbound fetches (URL + headers),
 *   - the same SQL (text + parameters) against the feature tables, and the same resulting table contents.
 * Express runs with stubbed authenticateToken/requirePlan (those are proven separately in manifest.test.js);
 * the Worker runs its real authenticateToken + requirePlan for a tier-3 user.
 *
 * Unavoidable differences that are NOT compared (platform): Content-Type charset, ETag, header set.
 * This is a logic-parity test against fakes. It proves nothing about Neon, workerd, or real GitHub / LinkedIn / AI.
 */
const mockCtl = { db: null, ai: null };

jest.mock('../../../src/config/database', () => ({
  pool: {
    query: (...args) => (mockCtl.db ? mockCtl.db.query(...args) : Promise.reject(new Error('no db in this scenario'))),
  },
}));
jest.mock('../../../src/utils/aiClient', () => ({
  callAI: (...args) => mockCtl.ai.callAI(...args),
  extractJSON: (...args) => mockCtl.ai.extractJSON(...args),
}));
jest.mock('../../../src/middleware/auth', () => ({
  authenticateToken: (req, _res, next) => { req.user = { id: 1 }; next(); },
}));
jest.mock('../../../src/middleware/requirePlan', () => ({
  requirePlan: () => (_req, _res, next) => next(),
}));

// Express aiCoach.js runs its own CREATE TABLE bootstrap at require time; keep its warning out of the output.
jest.spyOn(console, 'warn').mockImplementation(() => {});
const express = require('express');
const request = require('supertest');
const { errorHandler } = require('../../../src/middleware/errorHandler');
const expressProfiles = require('../../../src/routes/profiles');
const expressAiCoach = require('../../../src/routes/aiCoach');
const { installSql, makeAi, aiOk, makeHarness } = require('./helpers');
const { createFakeDb } = require('../helpers/harness');

const FIXED_NOW = Date.parse('2026-09-01T00:00:00Z');

const expressApp = express();
expressApp.use(express.json({ limit: '1mb' }));
expressApp.use('/api/profiles', expressProfiles);
expressApp.use('/api/ai-coach', expressAiCoach);
expressApp.use(errorHandler);

const MODEL_ENV = { LM_STUDIO_MODEL_GITHUB: 'gh-model', LM_STUDIO_MODEL_LINKEDIN: 'li-model', LM_STUDIO_MODEL: 'base-model' };
const FEATURE_SQL = /github_analyses|linkedin_analyses|code_reviews|career_coach_sessions|FROM (profiles|resumes|projects|interview_sessions)/;
const FEATURE_TABLES = ['github_analyses', 'linkedin_analyses', 'code_reviews', 'career_coach_sessions'];

const b64 = (text) => Buffer.from(text, 'utf8').toString('base64').replace(/(.{60})/g, '$1\n');

function fetchRouter(routes) {
  return () => jest.fn(async (url) => {
    for (const [re, respond] of routes) if (re.test(String(url))) return respond(String(url));
    throw new Error(`unexpected fetch ${url}`);
  });
}
const jsonRes = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data, text: async () => (typeof data === 'string' ? data : JSON.stringify(data)) });

const GH_USER = { login: 'octocat', name: 'Octo Cat', bio: 'Full stack developer building things', followers: 20, following: 3, public_repos: 16, company: null, location: 'Earth', blog: 'octo.dev', created_at: '2015-01-01T00:00:00Z' };
const GH_REPOS = [
  { name: 'octocat', description: 'Profile readme repo for octocat with a long description exceeding one hundred and fifty characters, repeated. Profile readme repo for octocat with a long description.', language: 'Markdown', topics: ['profile', 'readme'], stargazers_count: 12, forks_count: 1, homepage: '', pushed_at: '2026-08-20T00:00:00Z', size: 10, fork: false },
  { name: 'test1', description: null, language: 'JavaScript', topics: [], stargazers_count: 0, forks_count: 0, homepage: null, updated_at: '2024-01-01T00:00:00Z', fork: false },
  { name: 'react-dashboard', description: 'A dashboard app built with React', language: 'TypeScript', topics: ['react', 'vercel'], stargazers_count: 5, forks_count: 2, homepage: 'https://x.vercel.app', pushed_at: '2026-08-30T00:00:00Z', size: 100, fork: false },
  { name: 'portfolio-site', description: 'My personal website', language: 'HTML', topics: ['portfolio'], stargazers_count: 1, forks_count: 0, homepage: null, pushed_at: '2026-05-01T00:00:00Z', size: 5, fork: false },
  { name: 'py-ml', description: 'Machine learning experiments with pytorch', language: 'Python', topics: ['machine-learning', 'pytorch'], stargazers_count: 30, forks_count: 4, homepage: null, updated_at: '2025-12-01T00:00:00Z', fork: false },
  { name: 'forked-lib', description: 'a fork that must be ignored entirely', language: 'Go', topics: [], stargazers_count: 999, forks_count: 9, homepage: null, updated_at: '2026-08-31T00:00:00Z', fork: true },
  { name: 'demo', description: 'short', language: 'Vue', topics: ['x'], stargazers_count: 0, forks_count: 0, homepage: null, updated_at: '2020-01-01T00:00:00Z', fork: false },
];
const ghFetch = (over = {}) => fetchRouter([
  [/\/readme$/, () => (over.readme === null ? jsonRes(404, { message: 'Not Found' }) : over.readmeThrows ? Promise.reject(new Error('readme boom')) : jsonRes(200, over.readme || { content: b64('# Hi from the readme\n\nUnicode: ✓ é 中文 😀\n') }))],
  [/\/repos\?/, () => jsonRes(over.reposStatus || 200, over.repos || GH_REPOS)],
  [/api\.github\.com\/users\/[^/]+$/, () => (over.userStatus ? jsonRes(over.userStatus, { message: 'nope' }) : over.userThrows ? Promise.reject(new Error('net down')) : jsonRes(200, over.user || GH_USER))],
]);

const AI_GITHUB_OK = aiOk({
  profileReadme: '# AI README', bioSuggestion: 'AI bio', recruiterSummary: 'AI summary',
  repoSuggestions: [1, 2, 3, 4, 5, 6, 7].map((i) => ({ currentName: `n${i}`, suggestedName: `s${i}`, suggestedDescription: 'd' })),
  hostingRecs: [{ repo: 'test1', platform: 'Vercel', priority: 'High', reason: 'r', steps: ['a'] }],
});

const LI_PAGE = '<html><head><title>Jane Doe - Frontend Engineer | React TypeScript | LinkedIn</title><meta property="og:description" content="Jane builds React dashboards and design systems. Built a dashboard used by 2,000 users and improved load time by 30%." /></head><body><main>Jane Doe Frontend Engineer React TypeScript JavaScript. Built dashboards for 2,000 users.</main></body></html>';
const liFetch = (status = 200) => fetchRouter([[/linkedin\.com\/in\//, () => ({ ok: status === 200, status, text: async () => LI_PAGE })]]);
const AI_LI_OK = aiOk({
  headlineOptions: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], aboutRewrite: 'about', recruiterSummary: 'sum',
  experienceImprovements: [1, 2, 3, 4, 5, 6].map((i) => ({ current: `c${i}`, improved: `i${i}`, reason: 'r' })),
  quickWins: [1, 2, 3, 4, 5, 6, 7].map((i) => ({ action: `a${i}`, effort: '5 minutes', impact: 'high' })),
  activityRecommendations: ['a', 'b', 'c', 'd', 'e', 'f'], skillRecommendations: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
});

const seedLinkedin = (db) => {
  for (let i = 1; i <= 30; i += 1) {
    db.state.linkedin_analyses.push({ id: i, user_id: 1, profile_url: `https://www.linkedin.com/in/p${i}`, target_roles: ['R'], overall_score: i, grade: 'Strong', ai_powered: i % 2 === 0, report: JSON.stringify({ score: i, n: i }), created_at: new Date(1e6 + i * 1000) });
  }
  db.state.linkedin_analyses.push({ id: 99, user_id: 2, profile_url: 'other', target_roles: [], overall_score: 1, grade: 'x', ai_powered: false, report: '{"secret":true}', created_at: new Date(2e9) });
};
const seedCoach = (db) => {
  db.state.profiles.push({ user_id: 1, linkedin_url: 'l', github_url: 'g', headline: 'h', bio: null });
  db.state.resumes.push({ user_id: 1 }, { user_id: 1 }, { user_id: 3 });
  db.state.projects.push({ user_id: 1 });
  db.state.interview_sessions.push({ user_id: 1 }, { user_id: 1 }, { user_id: 1 }, { user_id: 1 });
  for (let i = 1; i <= 22; i += 1) db.state.code_reviews.push({ id: i, user_id: 1, language: 'python', review_type: 'bugs', score: i, issues_count: i % 4, code_snippet: `snippet ${i}`, created_at: new Date(1e6 + i * 1000) });
};

// ---------------------------------------------------------------------------------------------------------------
// scenarios: { name, method, path, body?, ai?, fetch?, seed?, env?, status }
// ---------------------------------------------------------------------------------------------------------------
const P = '/api/profiles';
const C = '/api/ai-coach';
const scenarios = [
  // ---- ai-coach ----
  { name: 'career-score with data', method: 'GET', path: `${C}/career-score`, seed: seedCoach, status: 200 },
  { name: 'career-score empty', method: 'GET', path: `${C}/career-score`, status: 200 },
  { name: 'recommendations AI ok', method: 'POST', path: `${C}/recommendations`, body: { targetRole: 'Backend Developer' }, ai: [aiOk([{ id: 5, title: 'T', priority: 'High' }, { description: 'x' }])], status: 200 },
  { name: 'recommendations AI offline', method: 'POST', path: `${C}/recommendations`, body: { targetRole: 'Nope' }, status: 200 },
  { name: 'recommendations AI throws', method: 'POST', path: `${C}/recommendations`, body: { targetRole: 'DevOps Engineer' }, ai: [new Error('kaput')], status: 200 },
  { name: 'recommendations no body', method: 'POST', path: `${C}/recommendations`, status: 500 },
  { name: 'skill-gap AI ok', method: 'POST', path: `${C}/skill-gap`, body: { targetRole: 'Data Scientist', currentSkills: ['python', 'SQL'] }, ai: [aiOk([{ skill: 'Python', currentLevel: 300, requiredLevel: 0 }, {}])], status: 200 },
  { name: 'skill-gap fallback', method: 'POST', path: `${C}/skill-gap`, body: { targetRole: 'Frontend Developer', currentSkills: ['react', 'css'] }, status: 200 },
  { name: 'skill-gap bad skills type', method: 'POST', path: `${C}/skill-gap`, body: { currentSkills: 'react' }, status: 200 },
  { name: 'skill-gap non-string skills + AI ok -> 200 (prompt uses join)', method: 'POST', path: `${C}/skill-gap`, body: { currentSkills: [1, 2, null] }, ai: [aiOk([{ skill: 'x' }])], status: 200 },
  { name: 'skill-gap non-string skills + AI offline -> masked 500 (preserved bug: the fallback throws inside the try AND inside the catch)', method: 'POST', path: `${C}/skill-gap`, body: { currentSkills: [1, 2] }, status: 500 },
  { name: 'compare-roles numeric / array / object roles', method: 'POST', path: `${C}/compare-roles`, body: { role1: 5, role2: { x: 1 } }, status: 200 },
  { name: 'compare-roles array role', method: 'POST', path: `${C}/compare-roles`, body: { role1: ['Data Scientist'], role2: 'Product Manager' }, status: 200 },
  { name: 'career-plan AI ok', method: 'POST', path: `${C}/career-plan`, body: { targetRole: 'Cloud Architect', currentLevel: 'advanced' }, ai: [aiOk({ timeline: [{ month: 1 }], x: 1 })], status: 200 },
  { name: 'career-plan fallback', method: 'POST', path: `${C}/career-plan`, body: { targetRole: 'Mobile Developer', currentLevel: 'zzz' }, status: 200 },
  { name: 'compare-roles 400', method: 'POST', path: `${C}/compare-roles`, body: { role1: 'A' }, status: 400 },
  { name: 'compare-roles AI ok', method: 'POST', path: `${C}/compare-roles`, body: { role1: 'A', role2: 'B' }, ai: [aiOk({ role1: { name: 'A' }, role2: { name: 'B' } })], status: 200 },
  { name: 'compare-roles fallback', method: 'POST', path: `${C}/compare-roles`, body: { role1: 'Cloud Architect', role2: 'Product Manager' }, status: 200 },
  { name: 'code-review 400 short', method: 'POST', path: `${C}/code-review`, body: { code: 'ab' }, status: 400 },
  { name: 'code-review 400 non-string', method: 'POST', path: `${C}/code-review`, body: { code: { a: 1 } }, status: 400 },
  { name: 'code-review AI ok', method: 'POST', path: `${C}/code-review`, body: { code: 'let a = 1;\nlet b = 2;', language: 'go', reviewType: 'performance' }, ai: [aiOk({ score: 61, issues: [{ severity: 'warning', line: 2 }, { severity: 'x', category: 'Style' }], improvedCode: 'c', metrics: { linesOfCode: 2 }, explanation: 'e' })], status: 200 },
  { name: 'code-review fallback full', method: 'POST', path: `${C}/code-review`, body: { code: 'function f() {\n  return 1;\n}\n'.repeat(400), language: 'nope', reviewType: 'nope' }, status: 200 },
  { name: 'code-review fallback security', method: 'POST', path: `${C}/code-review`, body: { code: 'eval(input)', language: 'php', reviewType: 'security' }, status: 200 },
  { name: 'code-review AI throws', method: 'POST', path: `${C}/code-review`, body: { code: 'const x = 1;' }, ai: [new Error('llm down')], status: 200 },
  { name: 'code-review no body', method: 'POST', path: `${C}/code-review`, status: 500 },
  { name: 'review-history rows', method: 'GET', path: `${C}/review-history`, seed: seedCoach, status: 200 },
  { name: 'review-history broken table', method: 'GET', path: `${C}/review-history`, seed: (db) => db.breakTable('code_reviews'), status: 200 },

  // ---- profiles / github ----
  { name: 'github analyze full (AI ok)', method: 'POST', path: `${P}/github/analyze`, body: { username: 'https://github.com/OctoCat/some-repo?tab=x' }, fetch: ghFetch(), ai: [AI_GITHUB_OK], status: 200 },
  { name: 'github analyze full (AI offline -> fallback enhancements)', method: 'POST', path: `${P}/github/analyze`, body: { username: 'octocat' }, fetch: ghFetch(), status: 200 },
  { name: 'github analyze (AI partial output -> fallback)', method: 'POST', path: `${P}/github/analyze`, body: { username: 'octocat' }, fetch: ghFetch(), ai: [aiOk({ profileReadme: 'x' })], status: 200 },
  { name: 'github analyze (AI throws)', method: 'POST', path: `${P}/github/analyze`, body: { username: 'octocat' }, fetch: ghFetch(), ai: [new Error('llm boom')], status: 500 },
  { name: 'github analyze readme 404 (non-fatal)', method: 'POST', path: `${P}/github/analyze`, body: { username: 'octocat' }, fetch: ghFetch({ readme: null }), status: 200 },
  { name: 'github analyze readme throws (non-fatal)', method: 'POST', path: `${P}/github/analyze`, body: { username: 'octocat' }, fetch: ghFetch({ readmeThrows: true }), status: 200 },
  { name: 'github analyze readme content not a string (non-fatal)', method: 'POST', path: `${P}/github/analyze`, body: { username: 'octocat' }, fetch: ghFetch({ readme: { content: 12345 } }), status: 200 },
  { name: 'github analyze readme with a BOM (kept, as Buffer.toString kept it)', method: 'POST', path: `${P}/github/analyze`, body: { username: 'octocat' }, fetch: ghFetch({ readme: { content: b64('﻿# BOM readme') } }), status: 200 },
  { name: 'github analyze readme with invalid UTF-8 bytes (U+FFFD)', method: 'POST', path: `${P}/github/analyze`, body: { username: 'octocat' }, fetch: ghFetch({ readme: { content: Buffer.from([0x41, 0xff, 0xfe, 0xc3, 0x28, 0xe2, 0x82, 0x42]).toString('base64') } }), status: 200 },
  { name: 'github analyze readme base64 with junk characters, url-safe alphabet and early padding', method: 'POST', path: `${P}/github/analyze`, body: { username: 'octocat' }, fetch: ghFetch({ readme: { content: 'IyBI$aQ-_\n!!IyBIaQ==IyBI' } }), status: 200 },
  { name: 'github analyze readme base64 truncated (dangling sextet)', method: 'POST', path: `${P}/github/analyze`, body: { username: 'octocat' }, fetch: ghFetch({ readme: { content: b64('# truncated readme').slice(0, 21) } }), status: 200 },
  { name: 'github analyze readme empty content', method: 'POST', path: `${P}/github/analyze`, body: { username: 'octocat' }, fetch: ghFetch({ readme: { content: '' } }), status: 200 },
  { name: 'jobmatch length-2 skill vs longer keyword (golang / go)', method: 'POST', path: `${P}/jobmatch`, body: { jobDescription: 'We use golang and nodejs daily', userSkills: 'go, no' }, status: 200 },
  { name: 'github analyze no profile README repo', method: 'POST', path: `${P}/github/analyze`, body: { username: 'octocat' }, fetch: ghFetch({ repos: GH_REPOS.filter((r) => r.name !== 'octocat') }), status: 200 },
  { name: 'github analyze repos endpoint fails', method: 'POST', path: `${P}/github/analyze`, body: { username: 'octocat' }, fetch: ghFetch({ reposStatus: 403 }), status: 200 },
  { name: 'github analyze user with no repos and no bio', method: 'POST', path: `${P}/github/analyze`, body: { username: 'ghost' }, fetch: ghFetch({ user: { login: 'ghost', followers: 0, following: 0, public_repos: 0 }, repos: [] }), status: 200 },
  { name: 'github analyze user 404', method: 'POST', path: `${P}/github/analyze`, body: { username: 'nobody' }, fetch: ghFetch({ userStatus: 404 }), status: 404 },
  { name: 'github analyze network down', method: 'POST', path: `${P}/github/analyze`, body: { username: 'nobody' }, fetch: ghFetch({ userThrows: true }), status: 404 },
  { name: 'github analyze 400 missing', method: 'POST', path: `${P}/github/analyze`, body: {}, status: 400 },
  { name: 'github analyze 400 format', method: 'POST', path: `${P}/github/analyze`, body: { username: '-bad--name' }, status: 400 },
  { name: 'github analyze 400 too long', method: 'POST', path: `${P}/github/analyze`, body: { username: 'a'.repeat(40) }, status: 400 },
  { name: 'github analyze no body', method: 'POST', path: `${P}/github/analyze`, status: 500 },
  { name: 'generate-repo-readme AI ok', method: 'POST', path: `${P}/github/generate-repo-readme`, body: { username: 'octocat', repoName: 'r', repoDescription: 'd', language: 'Go', topics: ['a', 'b'], stars: 5 }, ai: [aiOk('# R\n'.repeat(30))], status: 200 },
  { name: 'generate-repo-readme AI too short -> template (JS)', method: 'POST', path: `${P}/github/generate-repo-readme`, body: { repoName: 'r', language: 'TypeScript', topics: 'not-array' }, ai: [aiOk('short')], status: 200 },
  { name: 'generate-repo-readme template Python', method: 'POST', path: `${P}/github/generate-repo-readme`, body: { username: 'me', repoName: 'py', language: 'Python', topics: ['x'] }, status: 200 },
  { name: 'generate-repo-readme template Go', method: 'POST', path: `${P}/github/generate-repo-readme`, body: { repoName: 'g', repoDescription: 'A go thing', language: 'Go' }, status: 200 },
  { name: 'generate-repo-readme template Rust', method: 'POST', path: `${P}/github/generate-repo-readme`, body: { repoName: 'r', language: 'Rust' }, status: 200 },
  { name: 'generate-repo-readme template unknown', method: 'POST', path: `${P}/github/generate-repo-readme`, body: { repoName: 'z' }, status: 200 },
  { name: 'generate-repo-readme 400', method: 'POST', path: `${P}/github/generate-repo-readme`, body: { username: 'x' }, status: 400 },
  { name: 'generate-repo-readme no body -> 400 (|| {})', method: 'POST', path: `${P}/github/generate-repo-readme`, status: 400 },
  { name: 'generate-repo-readme AI throws', method: 'POST', path: `${P}/github/generate-repo-readme`, body: { repoName: 'r' }, ai: [new Error('x')], status: 500 },
  { name: 'optimize-bio AI ok', method: 'POST', path: `${P}/github/optimize-bio`, body: { currentBio: 'old', name: 'N', languages: ['Go', 'Rust'], targetRole: 'SRE' }, ai: [aiOk({ rewritten: 'y'.repeat(200), keywords: ['a'] })], status: 200 },
  { name: 'optimize-bio AI ok, keywords not array', method: 'POST', path: `${P}/github/optimize-bio`, body: {}, ai: [aiOk({ rewritten: 'short', keywords: 'x' })], status: 200 },
  { name: 'optimize-bio fallback with role', method: 'POST', path: `${P}/github/optimize-bio`, body: { targetRole: 'Backend Engineer', languages: ['Go', 'Rust', 'C', 'D'] }, status: 200 },
  { name: 'optimize-bio fallback with languages only', method: 'POST', path: `${P}/github/optimize-bio`, body: { languages: ['Go', 'Rust'], currentBio: 'x'.repeat(10) }, status: 200 },
  { name: 'optimize-bio fallback with nothing', method: 'POST', path: `${P}/github/optimize-bio`, body: { languages: 'nope' }, status: 200 },
  { name: 'optimize-bio no body (|| {})', method: 'POST', path: `${P}/github/optimize-bio`, status: 200 },
  { name: 'github save full', method: 'POST', path: `${P}/github/save`, body: { username: 'octocat', scores: { overall: 77 }, grade: 'Good', report: { a: 1 }, stage4: { b: 2 } }, status: 200 },
  { name: 'github save empty body object', method: 'POST', path: `${P}/github/save`, body: {}, status: 200 },
  { name: 'github save no body (|| {})', method: 'POST', path: `${P}/github/save`, status: 200 },
  { name: 'github save db error', method: 'POST', path: `${P}/github/save`, body: { username: 'x' }, seed: (db) => db.breakTable('github_analyses'), status: 500 },
  { name: 'github history', method: 'GET', path: `${P}/github/history`, seed: (db) => { for (let i = 1; i <= 8; i += 1) db.state.github_analyses.push({ id: i, user_id: i % 2 ? 1 : 2, username: `u${i}`, overall_score: i, grade: 'Good', report: '{}', created_at: new Date(1e6 + i * 1000) }); }, status: 200 },
  { name: 'github history db error', method: 'GET', path: `${P}/github/history`, seed: (db) => db.breakTable('github_analyses'), status: 500 },

  // ---- profiles / linkedin ----
  { name: 'linkedin analyze from URL (AI ok, saved)', method: 'POST', path: `${P}/linkedin/analyze`, body: { profileUrl: 'https://www.linkedin.com/in/janedoe' }, fetch: liFetch(), ai: [AI_LI_OK], status: 200 },
  { name: 'linkedin analyze from URL (AI offline)', method: 'POST', path: `${P}/linkedin/analyze`, body: { profileUrl: 'https://www.linkedin.com/in/janedoe' }, fetch: liFetch(), status: 200 },
  { name: 'linkedin analyze pasted data only', method: 'POST', path: `${P}/linkedin/analyze`, body: { headline: 'Data Engineer | Spark | SQL', about: 'I built pipelines and improved runtimes by 40%. Reach me at github.com/x', skills: 'SQL, Spark, Python', targetRoles: 'Data Engineer', experiences: [{ title: 'DE', company: 'Acme', description: 'Built ETL' }], yearsOfExperience: 3, connections: '500plus', hasPhoto: true, hasFeatured: true, activityLevel: 'weekly' }, status: 200 },
  { name: 'linkedin analyze save fails (persistence flag)', method: 'POST', path: `${P}/linkedin/analyze`, body: { headline: 'Engineer' }, seed: (db) => db.breakTable('linkedin_analyses'), status: 200 },
  { name: 'linkedin analyze blocked URL -> 400 service error', method: 'POST', path: `${P}/linkedin/analyze`, body: { profileUrl: 'https://www.linkedin.com/in/private' }, fetch: liFetch(999), status: 400 },
  { name: 'linkedin analyze bad URL -> 400', method: 'POST', path: `${P}/linkedin/analyze`, body: { profileUrl: 'https://example.com/in/x' }, status: 400 },
  { name: 'linkedin analyze empty body -> 400', method: 'POST', path: `${P}/linkedin/analyze`, body: {}, status: 400 },
  { name: 'linkedin analyze no body -> 400 (|| {})', method: 'POST', path: `${P}/linkedin/analyze`, status: 400 },
  { name: 'linkedin analyze AI throws -> 500', method: 'POST', path: `${P}/linkedin/analyze`, body: { headline: 'Engineer' }, ai: [new Error('exploded')], status: 500 },
  { name: 'linkedin history default limit', method: 'GET', path: `${P}/linkedin/history`, seed: seedLinkedin, status: 200 },
  { name: 'linkedin history limit=3', method: 'GET', path: `${P}/linkedin/history?limit=3`, seed: seedLinkedin, status: 200 },
  { name: 'linkedin history limit=100 (capped 25)', method: 'GET', path: `${P}/linkedin/history?limit=100`, seed: seedLinkedin, status: 200 },
  { name: 'linkedin history limit=abc', method: 'GET', path: `${P}/linkedin/history?limit=abc`, seed: seedLinkedin, status: 200 },
  { name: 'linkedin history repeated limit', method: 'GET', path: `${P}/linkedin/history?limit=2&limit=3`, seed: seedLinkedin, status: 200 },
  { name: 'linkedin history db error', method: 'GET', path: `${P}/linkedin/history`, seed: (db) => db.breakTable('linkedin_analyses'), status: 500 },
  { name: 'linkedin history/:id found', method: 'GET', path: `${P}/linkedin/history/7`, seed: seedLinkedin, status: 200 },
  { name: "linkedin history/:id other user's -> 404", method: 'GET', path: `${P}/linkedin/history/99`, seed: seedLinkedin, status: 404 },
  { name: 'linkedin history/:id unknown -> 404', method: 'GET', path: `${P}/linkedin/history/12345`, seed: seedLinkedin, status: 404 },
  { name: 'linkedin history/:id non-numeric -> 500', method: 'GET', path: `${P}/linkedin/history/abc`, seed: seedLinkedin, status: 500 },
  { name: 'generate-headline AI ok', method: 'POST', path: `${P}/linkedin/generate-headline`, body: { roleInfo: 'Dev', companyContext: 'Acme', achievements: 'x', targetRoles: ['A', 'B'] }, ai: [aiOk({ options: ['1'], tips: 't' })], status: 200 },
  { name: 'generate-headline offline', method: 'POST', path: `${P}/linkedin/generate-headline`, body: { roleInfo: 'Dev', targetRoles: 'Lead' }, status: 200 },
  { name: 'generate-headline unparsable', method: 'POST', path: `${P}/linkedin/generate-headline`, body: { roleInfo: 'Dev' }, ai: [aiOk('zzz')], status: 200 },
  { name: 'generate-headline 400', method: 'POST', path: `${P}/linkedin/generate-headline`, body: {}, status: 400 },
  { name: 'generate-headline no body -> 500', method: 'POST', path: `${P}/linkedin/generate-headline`, status: 500 },
  { name: 'generate-headline AI throws -> 500', method: 'POST', path: `${P}/linkedin/generate-headline`, body: { roleInfo: 'Dev' }, ai: [new Error('x')], status: 500 },
  { name: 'generate-about AI ok', method: 'POST', path: `${P}/linkedin/generate-about`, body: { profileContext: 'Backend', skills: ['Go', 'SQL'], achievements: 'a', targetRoles: ['R'], targetIndustries: ['I'] }, ai: [aiOk({ about: 'A', tips: 't' })], status: 200 },
  { name: 'generate-about offline (array skills)', method: 'POST', path: `${P}/linkedin/generate-about`, body: { profileContext: 'Backend', skills: ['Go', 'SQL', 'C', 'D'], targetIndustries: ['Fin'] }, status: 200 },
  { name: 'generate-about offline (string skills)', method: 'POST', path: `${P}/linkedin/generate-about`, body: { profileContext: 'Backend', skills: 'Go' }, status: 200 },
  { name: 'generate-about offline (no skills)', method: 'POST', path: `${P}/linkedin/generate-about`, body: { profileContext: 'Backend' }, status: 200 },
  { name: 'generate-about 400', method: 'POST', path: `${P}/linkedin/generate-about`, body: { skills: [] }, status: 400 },
  { name: 'generate-about no body -> 500', method: 'POST', path: `${P}/linkedin/generate-about`, status: 500 },
  { name: 'generate-experience AI ok', method: 'POST', path: `${P}/linkedin/generate-experience`, body: { jobTitle: 'Eng', company: 'Acme', responsibilities: 'r', achievements: 'a' }, ai: [aiOk({ description: 'D', tips: 't' })], status: 200 },
  { name: 'generate-experience offline', method: 'POST', path: `${P}/linkedin/generate-experience`, body: { jobTitle: 'Eng', company: 'Acme' }, status: 200 },
  { name: 'generate-experience 400', method: 'POST', path: `${P}/linkedin/generate-experience`, body: { jobTitle: 'Eng' }, status: 400 },
  { name: 'generate-experience no body -> 500', method: 'POST', path: `${P}/linkedin/generate-experience`, status: 500 },

  // ---- profiles / jobmatch ----
  { name: 'jobmatch 400', method: 'POST', path: `${P}/jobmatch`, body: { jobDescription: 'react' }, status: 400 },
  { name: 'jobmatch cannot analyze', method: 'POST', path: `${P}/jobmatch`, body: { jobDescription: 'We want a great communicator.', userSkills: 'react' }, status: 200 },
  { name: 'jobmatch strong match', method: 'POST', path: `${P}/jobmatch`, body: { jobDescription: 'React, Node.js, PostgreSQL, Docker and AWS required. Jest a plus.', userSkills: 'react, node.js\npostgresql, docker, aws, jest' }, status: 200 },
  { name: 'jobmatch partial + gaps', method: 'POST', path: `${P}/jobmatch`, body: { jobDescription: 'Python, Django, Flask, Kubernetes, Terraform-free, Azure, GCP, Redis, Kafka, Spark. Cypress.', userSkills: 'python; django' }, status: 200 },
  { name: 'jobmatch low score suggestions', method: 'POST', path: `${P}/jobmatch`, body: { jobDescription: 'Kotlin Swift Flutter Dart Android iOS mobile Unity', userSkills: 'excel' }, status: 200 },
  { name: 'jobmatch userSkills not a string -> 500', method: 'POST', path: `${P}/jobmatch`, body: { jobDescription: 'react', userSkills: ['react'] }, status: 500 },
  { name: 'jobmatch jobDescription not a string -> 500', method: 'POST', path: `${P}/jobmatch`, body: { jobDescription: 42, userSkills: 'x' }, status: 500 },
  { name: 'jobmatch no body -> 500', method: 'POST', path: `${P}/jobmatch`, status: 500 },
];

// ---------------------------------------------------------------------------------------------------------------
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'generatedAt' ? '<ts>' : normalize(v)]));
  }
  if (typeof value === 'string') return value.replace(/"generatedAt":"[^"]*"/g, '"generatedAt":"<ts>"');
  return value;
}

function summarize(status, text, db, ai, fetchMock) {
  let body;
  try { body = normalize(JSON.parse(text)); } catch { body = text; }
  return {
    status,
    bodyText: typeof body === 'string' ? body : JSON.stringify(body), // byte-level (key order included)
    aiCalls: normalize(ai.calls),
    fetchCalls: fetchMock.mock.calls.map(([url, init]) => [String(url), init && init.headers ? { ...init.headers } : null]),
    sql: normalize(db.calls.filter((c) => FEATURE_SQL.test(c.sql))),
    tables: normalize(Object.fromEntries(FEATURE_TABLES.map((t) => [t, db.state[t]]))),
  };
}

function withProcessEnv(env, fn) {
  const saved = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  return Promise.resolve(fn()).finally(() => {
    for (const k of Object.keys(env)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });
}

function newFetch(sc) {
  return sc.fetch ? sc.fetch() : jest.fn(async (url) => { throw new Error(`unexpected fetch ${url}`); });
}

async function runExpress(sc, env) {
  const db = installSql(createFakeDb());
  if (sc.seed) sc.seed(db);
  const ai = makeAi(sc.ai);
  mockCtl.db = db;
  mockCtl.ai = ai;
  global.fetch = newFetch(sc);
  const fetchMock = global.fetch;
  return withProcessEnv(env, async () => {
    let req = request(expressApp)[sc.method.toLowerCase()](sc.path);
    if (sc.body !== undefined) req = req.send(sc.body);
    const res = await req;
    return summarize(res.status, res.text, db, ai, fetchMock);
  });
}

async function runWorker(sc, env) {
  const ai = makeAi(sc.ai);
  global.fetch = newFetch(sc);
  const fetchMock = global.fetch;
  const H = makeHarness({ plan: 3, ai, seed: sc.seed, envOverrides: env });
  const res = await H.authed(sc.path, { method: sc.method, body: sc.body });
  const text = await res.text();
  await H.ctx.drain();
  return summarize(res.status, text, H.db, ai, fetchMock);
}

describe('Express original vs Worker port, identical inputs', () => {
  let randomSpy;
  beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
  });
  afterAll(() => {
    jest.restoreAllMocks();
    delete global.fetch;
  });

  it('the scenario table is big enough to mean something and covers every endpoint of both routers', () => {
    expect(scenarios.length).toBeGreaterThan(90);
    const covered = new Set(scenarios.map((s) => `${s.method} ${s.path.split('?')[0].replace(/\/\d+$|\/abc$/, '/:id')}`));
    for (const want of [
      `GET ${C}/career-score`, `POST ${C}/recommendations`, `POST ${C}/skill-gap`, `POST ${C}/career-plan`, `POST ${C}/compare-roles`,
      `POST ${C}/code-review`, `GET ${C}/review-history`,
      `POST ${P}/github/analyze`, `POST ${P}/github/generate-repo-readme`, `POST ${P}/github/optimize-bio`, `POST ${P}/github/save`,
      `GET ${P}/github/history`, `POST ${P}/linkedin/analyze`, `GET ${P}/linkedin/history`, `GET ${P}/linkedin/history/:id`,
      `POST ${P}/linkedin/generate-headline`, `POST ${P}/linkedin/generate-about`, `POST ${P}/linkedin/generate-experience`, `POST ${P}/jobmatch`,
    ]) expect(covered).toContain(want);
  });

  it.each(scenarios.map((s) => [s.name, s]))('%s', async (_name, sc) => {
    const env = { ...MODEL_ENV, ...(sc.env || {}) };
    const expressResult = await runExpress(sc, env);
    const workerResult = await runWorker(sc, env);

    expect(expressResult.status).toBe(sc.status); // the scenario really exercises the intended branch
    expect(workerResult.status).toBe(expressResult.status);
    expect(workerResult.bodyText).toBe(expressResult.bodyText);
    expect(workerResult.aiCalls).toEqual(expressResult.aiCalls);
    expect(workerResult.fetchCalls).toEqual(expressResult.fetchCalls);
    expect(workerResult.sql).toEqual(expressResult.sql);
    expect(workerResult.tables).toEqual(expressResult.tables);
  });

  it.each([
    ['only LM_STUDIO_MODEL set', { LM_STUDIO_MODEL_GITHUB: undefined, LM_STUDIO_MODEL_LINKEDIN: undefined, LM_STUDIO_MODEL: 'only-base' }],
    ['no model variables at all', { LM_STUDIO_MODEL_GITHUB: undefined, LM_STUDIO_MODEL_LINKEDIN: undefined, LM_STUDIO_MODEL: undefined }],
  ])('model override precedence matches when %s (github analyze, generate-headline, linkedin analyze)', async (_label, env) => {
    const three = [
      { method: 'POST', path: `${P}/github/analyze`, body: { username: 'octocat' }, fetch: ghFetch(), status: 200 },
      { method: 'POST', path: `${P}/linkedin/generate-headline`, body: { roleInfo: 'Dev' }, status: 200 },
      { method: 'POST', path: `${P}/linkedin/analyze`, body: { headline: 'Engineer' }, status: 200 },
      { method: 'POST', path: `${P}/github/generate-repo-readme`, body: { repoName: 'r' }, status: 200 },
      { method: 'POST', path: `${P}/github/optimize-bio`, body: {}, status: 200 },
    ];
    for (const sc of three) {
      const e = await runExpress(sc, env);
      const w = await runWorker(sc, env);
      expect(w.aiCalls).toEqual(e.aiCalls);
      expect(w.aiCalls[0]).toHaveProperty('model', env.LM_STUDIO_MODEL);
    }
  });

  it('Math.random was really pinned (the random fallbacks are compared, not skipped)', async () => {
    const sc = { method: 'POST', path: `${C}/skill-gap`, body: { targetRole: 'Backend Developer', currentSkills: [] }, status: 200 };
    const w = await runWorker(sc, MODEL_ENV);
    expect(JSON.parse(w.bodyText).gaps[0]).toMatchObject({ currentLevel: 10 + 15, requiredLevel: 75 + 10 });
    expect(randomSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Seeded randomised differential: boundary-heavy synthetic inputs through the scoring engines and rule tables.
// Deterministic (fixed seeds), so a failure is reproducible; the seed is in the test title.
// ---------------------------------------------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];
const int = (rnd, lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

function randomGithubDataset(seed) {
  const rnd = mulberry32(seed);
  const login = pick(rnd, ['octocat', 'dev-user', 'a', 'x1-y2']);
  const NAMES = ['test', 'test1', 'project', 'untitled', 'asdf', 'app', 'demo2', 'my', 'hello-world', 'repo', 'abc', 'react-dashboard', 'api-server', 'portfolio', 'personal-website', 'ml-lab', 'k8s-config', 'docker-stack', 'sql-tools', 'vue-todo'];
  const LANGS = [null, 'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'Go', 'Rust', 'HTML', 'CSS', 'Vue', 'Kotlin', 'Markdown', 'Shell'];
  const TOPICS = ['react', 'node', 'vercel', 'netlify', 'deployed', 'live', 'demo', 'github-pages', 'docker', 'aws', 'sql', 'machine-learning', 'portfolio', 'x', 'nlp', 'ci', 'redis'];
  const DESC_LEN = [null, 0, 5, 10, 11, 20, 21, 80, 81, 150, 151, 220];
  const DAYS = [null, 0, 5, 29, 30, 31, 89, 90, 91, 179, 180, 181, 400, 900];
  const iso = (days) => (days === null ? undefined : new Date(FIXED_NOW - days * 86400000).toISOString());

  const repos = Array.from({ length: pick(rnd, [0, 1, 2, 3, 5, 8, 12, 20, 30]) }, (_, i) => {
    const len = pick(rnd, DESC_LEN);
    const days = pick(rnd, DAYS);
    return {
      name: rnd() < 0.15 ? login : `${pick(rnd, NAMES)}${rnd() < 0.3 ? i : ''}`,
      description: len === null ? null : 'd'.repeat(len),
      language: pick(rnd, LANGS),
      topics: rnd() < 0.15 ? null : Array.from({ length: int(rnd, 0, 4) }, () => pick(rnd, TOPICS)),
      stargazers_count: int(rnd, 0, 40),
      forks_count: int(rnd, 0, 10),
      homepage: pick(rnd, [null, '', 'https://demo.example.com']),
      ...(rnd() < 0.5 ? { pushed_at: iso(days) } : { updated_at: iso(days) }),
      size: int(rnd, 0, 500),
      fork: rnd() < 0.1,
    };
  });
  const bioLen = pick(rnd, [null, 0, 5, 9, 10, 19, 20, 60]);
  const user = {
    login, name: pick(rnd, [null, 'Some Body']), bio: bioLen === null ? null : 'b'.repeat(bioLen), followers: int(rnd, 0, 50), following: int(rnd, 0, 20),
    public_repos: pick(rnd, [0, 3, 14, 15, 16, 40]), company: null, location: pick(rnd, [null, 'Mars']), blog: pick(rnd, [null, '', 'me.dev', 'https://me.dev']), created_at: '2016-01-01T00:00:00Z',
  };
  return { username: login, user, repos };
}

describe('seeded randomised differential', () => {
  beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
  });
  afterAll(() => {
    jest.restoreAllMocks();
    delete global.fetch;
  });

  const seeds = Array.from({ length: 90 }, (_, i) => 1000 + i * 7919);

  it.each(seeds.map((seed) => [seed]))('github analyze, random portfolio seed %i (scores, grade, issues, priorities, fallbacks)', async (seed) => {
    const { username, user, repos } = randomGithubDataset(seed);
    const ai = seed % 3 === 0 ? [AI_GITHUB_OK] : []; // a third through the AI branch, the rest through the deterministic fallback
    const sc = { method: 'POST', path: `${P}/github/analyze`, body: { username }, fetch: ghFetch({ user, repos }), ai };
    const e = await runExpress(sc, MODEL_ENV);
    const w = await runWorker(sc, MODEL_ENV);
    expect(e.status).toBe(200);
    expect(w.status).toBe(200);
    expect(w.bodyText).toBe(e.bodyText);
    expect(w.aiCalls).toEqual(e.aiCalls);
    expect(w.fetchCalls).toEqual(e.fetchCalls);
  });

  it('the random portfolios really span the grade bands and the threshold branches (the test is not vacuous)', async () => {
    const grades = new Set();
    const issues = new Set();
    for (const seed of seeds) {
      const { username, user, repos } = randomGithubDataset(seed);
      const w = await runWorker({ method: 'POST', path: `${P}/github/analyze`, body: { username }, fetch: ghFetch({ user, repos }) }, MODEL_ENV);
      const body = JSON.parse(w.bodyText);
      grades.add(body.grade);
      body.issues.forEach((i) => issues.add(i.replace(/'[^']*'/, "'<login>'")));
    }
    expect(grades.size).toBeGreaterThanOrEqual(3);
    expect(issues.size).toBeGreaterThanOrEqual(7);
  });

  const VOCAB = ['golang', 'ml', 'ai', 'ci/cd', 'k8s', 'nodejs', 'no', 'go', 'react', 'angular', 'vue', 'node.js', 'python', 'django', 'java', 'spring boot', 'c++', 'c#', '.net', 'ruby', 'go', 'rust', 'sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'docker', 'kubernetes', 'aws', 'azure', 'html', 'css', 'git', 'jenkins', 'linux', 'agile', 'graphql', 'api', 'machine learning', 'pandas', 'tensorflow', 'kafka', 'flutter', 'swift', 'android', 'jest', 'cypress', 'pytest', 'excel', 'sales', 'design'];
  const jobmatchSeeds = Array.from({ length: 60 }, (_, i) => 5000 + i * 104729);

  it.each(jobmatchSeeds.map((s) => [s]))('jobmatch random seed %i', async (seed) => {
    const rnd = mulberry32(seed);
    const words = Array.from({ length: int(rnd, 0, 14) }, () => pick(rnd, VOCAB));
    const skills = Array.from({ length: int(rnd, 0, 10) }, () => pick(rnd, [...VOCAB, 'a', 'ab', 'abc']));
    const sc = { method: 'POST', path: `${P}/jobmatch`, body: { jobDescription: `We need: ${words.join(', ')}.`, userSkills: skills.join(pick(rnd, [',', '\n', ', ', ';'])) } };
    const e = await runExpress(sc, MODEL_ENV);
    const w = await runWorker(sc, MODEL_ENV);
    expect(w.status).toBe(e.status);
    expect(w.bodyText).toBe(e.bodyText);
  });

  const liSeeds = Array.from({ length: 50 }, (_, i) => 9000 + i * 15485863);

  it.each(liSeeds.map((s) => [s]))('linkedin analyze random pasted profile seed %i', async (seed) => {
    const rnd = mulberry32(seed);
    const words = (n, pool) => Array.from({ length: n }, () => pick(rnd, pool)).join(' ');
    const POOL = ['built', 'led', 'React', 'Node.js', 'python', 'AWS', 'improved', 'shipped', '40%', '3x', 'users', 'api', 'SQL', 'Docker', 'team', 'I', 'my', 'github.com/x', 'and', 'the', 'delivered', '12 projects'];
    const body = {
      headline: rnd() < 0.15 ? '' : words(int(rnd, 1, 40), POOL),
      about: rnd() < 0.15 ? '' : words(pick(rnd, [0, 10, 49, 50, 99, 100, 179, 180, 250]), POOL),
      skills: Array.from({ length: pick(rnd, [0, 1, 7, 8, 9, 14, 15, 29, 30, 34]) }, (_, i) => `${pick(rnd, POOL)}${i}`),
      targetRoles: pick(rnd, ['', 'Frontend Engineer', 'python, aws', ['Data Scientist']]),
      targetIndustries: pick(rnd, ['', 'SaaS', ['FinTech', 'python']]),
      experiences: Array.from({ length: int(rnd, 0, 4) }, () => ({ title: words(2, POOL), company: 'Acme', description: words(6, POOL) })),
      experienceCount: pick(rnd, [undefined, 0, 1, 3, 8]),
      yearsOfExperience: pick(rnd, [undefined, 0, 1, 2, 4, 9]),
      connections: pick(rnd, [undefined, '500plus', '100to500', 'few']),
      hasPhoto: rnd() < 0.5,
      hasFeatured: rnd() < 0.5,
      openToWork: rnd() < 0.5,
      activityLevel: pick(rnd, [undefined, 'weekly', 'monthly', 'never']),
    };
    if (!body.headline && !body.about) body.headline = 'Engineer';
    const sc = { method: 'POST', path: `${P}/linkedin/analyze`, body, ai: seed % 2 ? [AI_LI_OK] : [] };
    const e = await runExpress(sc, MODEL_ENV);
    const w = await runWorker(sc, MODEL_ENV);
    expect(e.status).toBe(200);
    expect(w.bodyText).toBe(e.bodyText);
    expect(w.sql).toEqual(e.sql);
    expect(w.aiCalls).toEqual(e.aiCalls);
  });

  const coachSeeds = Array.from({ length: 30 }, (_, i) => 20000 + i * 1299709);

  it.each(coachSeeds.map((s) => [s]))('ai-coach career-score / skill-gap / code-review random seed %i', async (seed) => {
    const rnd = mulberry32(seed);
    const seedFn = (db) => {
      if (rnd() < 0.7) db.state.profiles.push({ user_id: 1, linkedin_url: rnd() < 0.5 ? 'l' : null, github_url: rnd() < 0.5 ? 'g' : '', headline: rnd() < 0.5 ? 'h' : null, bio: rnd() < 0.5 ? 'b' : null });
      for (const t of ['resumes', 'projects', 'interview_sessions']) for (let i = int(rnd, 0, 12); i > 0; i -= 1) db.state[t].push({ user_id: 1 });
    };
    const roles = ['Frontend Developer', 'Backend Developer', 'Full Stack Developer', 'Data Scientist', 'Machine Learning Engineer', 'DevOps Engineer', 'Mobile Developer', 'Cloud Architect', 'Cybersecurity Analyst', 'Product Manager', 'Other'];
    const skills = Array.from({ length: int(rnd, 0, 25) }, () => pick(rnd, ['react', 'Node.js', 'SQL', 'docker', 'python', 'Swift', 'x', 'aws', 'Testing', 'CSS']));
    const code = 'line\n'.repeat(int(rnd, 1, 1500)) + 'x';
    // the profile/counts rows are drawn once so Express and Worker see the identical database
    const drawn = [];
    seedFn({ state: { profiles: { push: (r) => drawn.push(['profiles', r]) }, resumes: { push: (r) => drawn.push(['resumes', r]) }, projects: { push: (r) => drawn.push(['projects', r]) }, interview_sessions: { push: (r) => drawn.push(['interview_sessions', r]) } } });
    const sameSeed = (db) => drawn.forEach(([t, r]) => db.state[t].push({ ...r }));
    const trio = [
      { method: 'GET', path: `${C}/career-score`, seed: sameSeed },
      { method: 'POST', path: `${C}/skill-gap`, body: { targetRole: pick(rnd, roles), currentSkills: skills } },
      { method: 'POST', path: `${C}/code-review`, body: { code, language: pick(rnd, ['python', 'go', 'zz']), reviewType: pick(rnd, ['full', 'bugs', 'performance', 'security', 'best-practices', 'readability', 'zz']) } },
    ];
    for (const sc of trio) {
      const e = await runExpress(sc, MODEL_ENV);
      const w = await runWorker(sc, MODEL_ENV);
      expect(w.status).toBe(e.status);
      expect(w.bodyText).toBe(e.bodyText);
      expect(w.sql).toEqual(e.sql);
    }
  });
});
