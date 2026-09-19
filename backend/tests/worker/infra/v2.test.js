'use strict';

/**
 * The pure v2 resume analyzers were ported verbatim (they have no config, db or I/O). Two checks:
 *   1. source identity with the Express files (so "verbatim" is a fact, and drift is caught while both backends live);
 *   2. differential behaviour on realistic and degenerate resume texts, comparing every static analyzer's output.
 * resumeExportEngine is owned by the docs slice and is deliberately not covered here.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../../src');
const NAMES = [
  'actionVerbAnalyzer', 'certificationAnalyzer', 'contactValidator', 'educationAnalyzer', 'experienceAnalyzer',
  'formattingAnalyzer', 'metricsAnalyzer', 'missingInfoEngine', 'projectAnalyzer', 'readabilityAnalyzer',
  'resumeAnalysisEngine', 'resumeCriticEngine', 'roleDetectionEngine', 'sectionAnalyzer', 'skillsAnalyzer',
];

const load = (base, name) => require(path.join(SRC, base, 'v2', name));

const GOOD_RESUME = `Jane Q. Developer
jane.developer@example.test | +1 (555) 010-0199 | linkedin.com/in/janedev | github.com/janedev

SUMMARY
Full-stack software engineer with 5 years of experience building React and Node.js applications.

SKILLS
JavaScript, TypeScript, React, Node.js, PostgreSQL, Docker, AWS, Git, REST APIs, JavaScript

EXPERIENCE
Senior Software Engineer, Acme Corp                                   Jan 2021 - Present
- Led a team of 4 engineers to deliver a payments platform, cutting checkout latency by 35%
- Built REST APIs serving 2M requests per day and reduced infrastructure cost by $40,000 annually
- Implemented CI/CD pipelines, improving release frequency from monthly to weekly

Software Engineer, Beta Labs                                          Jun 2018 - Dec 2020
- Developed dashboards used by 500+ analysts
- Responsible for maintaining legacy services

PROJECTS
Resume Analyzer - Built a rule-based ATS checker using Node.js and React, used by 300 users
Mini Project - helped with stuff

EDUCATION
B.Tech in Computer Science, State University, 2018

CERTIFICATIONS
AWS Certified Developer - Associate (2022)
`;

const SPARSE_RESUME = 'John\nI like computers.\nWorked at a place.\n';

const TABLE_RESUME = `NAME SURNAME
email at nowhere

| Skill | Level |
| ----- | ----- |
| Java  | High  |

Experience
Some company - Developer
Did various tasks and was responsible for things.
`;

const TEXTS = [GOOD_RESUME, SPARSE_RESUME, TABLE_RESUME, '', '   \n  ', 'x', 'A'.repeat(20000)];

// Recursively drop wall-clock fields so two runs of the same input compare equal.
const stripTiming = (v) => JSON.parse(JSON.stringify(v, (k, val) => (k === 'processingTimeMs' ? undefined : val)));

describe('v2 analyzers (verbatim ports)', () => {
  it('ports every pure v2 analyzer, and only those (resumeExportEngine belongs to the docs slice)', () => {
    const files = fs.readdirSync(path.join(SRC, 'worker/services/v2')).filter((f) => f.endsWith('.js'));
    const expressFiles = fs.readdirSync(path.join(SRC, 'services/v2')).filter((f) => f.endsWith('.js'));
    const pure = expressFiles.filter((f) => f !== 'resumeExportEngine.js');
    // resumeExportEngine.js may appear here once the docs slice adds it; the infra set must all be present
    expect(files).toEqual(expect.arrayContaining(pure));
    expect(NAMES.map((n) => `${n}.js`).sort()).toEqual([...pure].sort());
  });

  it.each(NAMES)('%s: source is identical to the Express file', (name) => {
    const a = fs.readFileSync(path.join(SRC, 'services/v2', `${name}.js`), 'utf8');
    const b = fs.readFileSync(path.join(SRC, 'worker/services/v2', `${name}.js`), 'utf8');
    expect(b).toBe(a);
  });

  it.each(NAMES)('%s: exposes the same static API as the original', (name) => {
    const ported = load('worker/services', name);
    const orig = load('services', name);
    expect(Object.getOwnPropertyNames(ported).sort()).toEqual(Object.getOwnPropertyNames(orig).sort());
  });

  describe('behaviour matches the original', () => {
    const analyzeOnly = ['actionVerbAnalyzer', 'certificationAnalyzer', 'contactValidator', 'educationAnalyzer',
      'experienceAnalyzer', 'metricsAnalyzer', 'missingInfoEngine', 'projectAnalyzer', 'readabilityAnalyzer',
      'sectionAnalyzer', 'skillsAnalyzer', 'formattingAnalyzer'];

    it.each(analyzeOnly)('%s.analyze on all sample texts', (name) => {
      const ported = load('worker/services', name);
      const orig = load('services', name);
      for (const text of TEXTS) expect(stripTiming(ported.analyze(text))).toEqual(stripTiming(orig.analyze(text)));
    });

    it('formattingAnalyzer.analyze with file content', () => {
      const ported = load('worker/services', 'formattingAnalyzer');
      const orig = load('services', 'formattingAnalyzer');
      const fileContent = { hasImages: true, hasTables: true, pageCount: 4, text: TABLE_RESUME };
      expect(stripTiming(ported.analyze(TABLE_RESUME, fileContent))).toEqual(stripTiming(orig.analyze(TABLE_RESUME, fileContent)));
    });

    it('roleDetectionEngine helpers', () => {
      const ported = load('worker/services', 'roleDetectionEngine');
      const orig = load('services', 'roleDetectionEngine');
      for (const text of TEXTS) expect(ported.detect(text)).toEqual(orig.detect(text));
      expect(ported.getSupportedRoles()).toEqual(orig.getSupportedRoles());
      for (const role of [...orig.getSupportedRoles(), 'unknown-role']) {
        expect(ported.getRoleDetails(role)).toEqual(orig.getRoleDetails(role));
        expect(ported.getRoleDisplayName(role)).toEqual(orig.getRoleDisplayName(role));
      }
      for (const conf of [0, 0.4, 0.5, 0.9]) expect(ported.isHighConfidence(conf)).toBe(orig.isHighConfidence(conf));
    });

    it('actionVerbAnalyzer.getSuggestions, missingInfoEngine.getFieldGuidance/getTemplate, sectionAnalyzer.getRecommendations', () => {
      const av = [load('worker/services', 'actionVerbAnalyzer'), load('services', 'actionVerbAnalyzer')];
      for (const verb of ['helped', 'worked on', 'made', 'unknown-verb', '']) expect(av[0].getSuggestions(verb)).toEqual(av[1].getSuggestions(verb));
      const mi = [load('worker/services', 'missingInfoEngine'), load('services', 'missingInfoEngine')];
      for (const key of [...Object.keys(mi[1].FIELDS), 'nope']) {
        expect(mi[0].getFieldGuidance(key)).toEqual(mi[1].getFieldGuidance(key));
        expect(mi[0].getTemplate(key)).toEqual(mi[1].getTemplate(key));
      }
      const sa = [load('worker/services', 'sectionAnalyzer'), load('services', 'sectionAnalyzer')];
      const analysis = sa[1].analyze(SPARSE_RESUME);
      expect(sa[0].getRecommendations(analysis)).toEqual(sa[1].getRecommendations(analysis));
    });

    it('resumeAnalysisEngine.analyze (the orchestrator) on all sample texts, ignoring wall-clock time', () => {
      const ported = load('worker/services', 'resumeAnalysisEngine');
      const orig = load('services', 'resumeAnalysisEngine');
      for (const text of TEXTS) {
        expect(stripTiming(ported.analyze(text))).toEqual(stripTiming(orig.analyze(text)));
        expect(stripTiming(ported.analyze(text, { hasImages: true }))).toEqual(stripTiming(orig.analyze(text, { hasImages: true })));
      }
      const good = ported.analyze(GOOD_RESUME);
      expect(good.status).toBe('success');
      expect(good.overallScore).toBeGreaterThan(0);
      expect(typeof good.processingTimeMs).toBe('number');
      expect(Object.keys(good.scores)).toEqual(['contact', 'structure', 'formatting', 'skills', 'experience', 'projects', 'education', 'readability']);
    });

    it('resumeCriticEngine.generateQuickFeedback on real analyses and degenerate input', () => {
      const ported = load('worker/services', 'resumeCriticEngine');
      const orig = load('services', 'resumeCriticEngine');
      const engine = load('services', 'resumeAnalysisEngine');
      for (const text of TEXTS) {
        const analysis = stripTiming(engine.analyze(text));
        expect(ported.generateQuickFeedback(analysis)).toEqual(orig.generateQuickFeedback(analysis));
      }
      for (const odd of [undefined, null, {}, { overallScore: 90, recommendations: [{ message: 'a' }, { message: 'b' }, { message: 'c' }, { message: 'd' }] }]) {
        expect(ported.generateQuickFeedback(odd)).toEqual(orig.generateQuickFeedback(odd));
      }
    });
  });

  it('the worker resumeAnalysisEngine composes the WORKER analyzers (no reach back into Express modules)', () => {
    const text = fs.readFileSync(path.join(SRC, 'worker/services/v2/resumeAnalysisEngine.js'), 'utf8');
    const requires = [...text.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
    expect(requires.length).toBe(13);
    for (const r of requires) expect(r).toMatch(/^\.\/[a-zA-Z]+$/);
  });
});
