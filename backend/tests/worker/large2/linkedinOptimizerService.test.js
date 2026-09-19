'use strict';

/**
 * services/linkedinOptimizerService.js: the six behaviours of tests/linkedinOptimizerService.test.js (Express) run
 * against the Worker port with an injected aiClient, plus: model selection from config.vars, the three generate*
 * helpers, the fetch guard rails, and the Worker-specific aiClient wiring rules.
 */
const { createLinkedinOptimizerService } = require('../../../src/worker/services/linkedinOptimizerService');
const { makeAi, aiOk } = require('./helpers');

function setup({ script = [], vars = {} } = {}) {
  const ai = makeAi(script);
  const service = createLinkedinOptimizerService({ config: { vars }, services: { aiClient: ai } });
  return { ai, service };
}

const PAGE = `
  <html>
    <head>
      <title>Jane Doe - Frontend Engineer | React TypeScript | LinkedIn</title>
      <meta property="og:description" content="Jane builds React dashboards and design systems. Built a dashboard used by 2,000 users and improved load time by 30%." />
      <script type="application/ld+json">
        { "@type": "Person", "name": "Jane Doe", "headline": "Frontend Engineer", "jobTitle": "Frontend Engineer",
          "knowsAbout": ["React", "TypeScript", "JavaScript", "Design Systems"] }
      </script>
    </head>
    <body><main>Jane Doe Frontend Engineer React TypeScript JavaScript Design Systems. Built dashboards for 2,000 users.</main></body>
  </html>`;

const okPage = (text = PAGE) => ({ ok: true, status: 200, text: async () => text });

beforeEach(() => {
  global.fetch = jest.fn();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  delete global.fetch;
  jest.restoreAllMocks();
});

describe('normalizeProfileInput / helpers (pure, unchanged)', () => {
  it('normalizes comma-separated fields into arrays', () => {
    const { service } = setup();
    const profile = service.normalizeProfileInput({
      skills: 'React, TypeScript\nNode.js',
      targetRoles: 'Frontend Engineer, Full Stack Engineer',
      targetIndustries: ['SaaS', 'FinTech'],
    });
    expect(profile.skills).toEqual(['React', 'TypeScript', 'Node.js']);
    expect(profile.targetRoles).toEqual(['Frontend Engineer', 'Full Stack Engineer']);
    expect(profile.targetIndustries).toEqual(['SaaS', 'FinTech']);
  });

  it('applies its defaults and aliases', () => {
    const { service } = setup();
    expect(service.normalizeProfileInput()).toMatchObject({
      profileUrl: '', headline: '', about: '', skills: [], experiences: [], experienceCount: 0, yearsOfExperience: 0,
      connections: 'unknown', hasPhoto: false, hasFeatured: false, openToWork: false, activityLevel: 'unknown',
    });
    expect(service.normalizeProfileInput({ linkedinUrl: ' u ', summary: 's', activity: 'weekly', industry: 'a;b', targetRole: 'x', experiences: [{ title: 't' }, {}] }))
      .toMatchObject({ profileUrl: 'u', about: 's', activityLevel: 'weekly', targetIndustries: ['a', 'b'], targetRoles: ['x'], experienceCount: 1 });
  });

  it('deriveProfileSignals and keywordIntelligence are exported and pure', () => {
    const { service } = setup();
    const profile = service.normalizeProfileInput({ headline: 'Built and led React and Node.js apps, improved latency by 40%', skills: 'React', targetRoles: 'Python Developer' });
    const signals = service.deriveProfileSignals(profile);
    expect(signals.detectedKeywords).toEqual(expect.arrayContaining(['react', 'node', 'node.js']));
    expect(signals.actionVerbCount).toBeGreaterThanOrEqual(3);
    expect(signals.quantifiedClaims).toContain('40'); // the original regex drops a trailing '%' before punctuation (preserved)
    expect(service.keywordIntelligence(profile, signals).missingHighValue).toContain('python');
  });
});

describe('fetchLinkedInPublicData', () => {
  it('extracts real public LinkedIn metadata when the page is reachable', async () => {
    const { service } = setup();
    global.fetch.mockResolvedValueOnce(okPage());
    const data = await service.fetchLinkedInPublicData('https://www.linkedin.com/in/janedoe');
    expect(data).toMatchObject({ fetched: true, source: 'public_linkedin_page' });
    expect(data.title).toContain('Jane Doe');
    expect(data.description).toContain('React dashboards');
    expect(data.pageText).toContain('Frontend Engineer');
    // the request is made with the same headers and a timeout signal as before
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://www.linkedin.com/in/janedoe');
    expect(init.headers).toEqual({ Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'JobTune-LinkedIn-Optimizer/1.0' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('never fetches for a missing or non-LinkedIn URL', async () => {
    const { service } = setup();
    await expect(service.fetchLinkedInPublicData('')).resolves.toEqual({ fetched: false, reason: 'No LinkedIn URL provided.' });
    await expect(service.fetchLinkedInPublicData('https://evil.example/in/x')).resolves.toEqual({
      fetched: false, reason: 'LinkedIn URL must look like https://www.linkedin.com/in/username.',
    });
    await expect(service.fetchLinkedInPublicData('http://169.254.169.254/latest/meta-data')).resolves.toMatchObject({ fetched: false });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('reports the HTTP status when LinkedIn blocks the request', async () => {
    const { service } = setup();
    global.fetch.mockResolvedValueOnce({ ok: false, status: 999, text: async () => '' });
    await expect(service.fetchLinkedInPublicData('https://www.linkedin.com/in/x')).resolves.toEqual({
      fetched: false, status: 999, reason: 'LinkedIn returned HTTP 999.',
    });
  });

  it('turns a network failure or timeout into { fetched:false, reason }', async () => {
    const { service } = setup();
    global.fetch.mockRejectedValueOnce(new Error('The operation was aborted due to timeout'));
    await expect(service.fetchLinkedInPublicData('https://www.linkedin.com/in/x')).resolves.toEqual({
      fetched: false, reason: 'The operation was aborted due to timeout',
    });
    global.fetch.mockRejectedValueOnce({});
    await expect(service.fetchLinkedInPublicData('https://www.linkedin.com/in/x')).resolves.toEqual({
      fetched: false, reason: 'LinkedIn public fetch failed.',
    });
  });

  it('caps the extracted page text and survives malformed JSON-LD', async () => {
    const { service } = setup();
    const html = `<title>T | LinkedIn</title><script type="application/ld+json">{not json</script><body>${'word '.repeat(5000)}</body>`;
    global.fetch.mockResolvedValueOnce(okPage(html));
    const data = await service.fetchLinkedInPublicData('https://www.linkedin.com/in/x');
    expect(data.fetched).toBe(true);
    expect(data.pageText.length).toBeLessThanOrEqual(8000);
  });
});

describe('analyzeLinkedInProfile', () => {
  it('uses the LLM structured output when available', async () => {
    const { ai, service } = setup({
      script: [aiOk({
        headlineOptions: ['Frontend Engineer | React | TypeScript | Design Systems', 'React Developer | TypeScript | Accessible UI'],
        aboutRewrite: 'I build accessible React products with TypeScript and measurable user impact.',
        experienceImprovements: [{ current: 'Worked on dashboard', improved: 'Built a React dashboard used by 2,000 users.', reason: 'Adds action and measurable scope.' }],
        quickWins: [{ action: 'Move React and TypeScript into the first headline segment.', effort: '5 minutes', impact: 'high' }],
        recruiterSummary: 'Strong frontend positioning with room for more quantified proof.',
        activityRecommendations: ['Comment weekly on frontend engineering posts.'],
        skillRecommendations: ['Accessibility', 'Design Systems'],
      })],
    });
    global.fetch.mockResolvedValueOnce(okPage());

    const report = await service.analyzeLinkedInProfile({ profileUrl: 'https://www.linkedin.com/in/janedoe' });

    expect(report.success).toBe(true);
    expect(report.aiPowered).toBe(true);
    expect(report.optimizations.aboutRewrite).toContain('accessible React products');
    expect(report.dataSources.publicFetch.fetched).toBe(true);
    expect(report.score).toBeGreaterThan(0);
    expect(report.metrics).toHaveLength(5);
    expect(report.metrics.map((m) => m.label)).toEqual(['Headline Impact', 'About Section Depth', 'Experience Proof', 'Skills Search Fit', 'Profile Completeness']);
    expect(report.scoreDescription).toBe(`Your LinkedIn profile scores ${report.score}/100 based on real supplied and publicly fetched profile data.`);
    expect(ai.callAI).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 1500, temperature: 0.35, structuredJson: true }));
    expect(new Date(report.generatedAt).toISOString()).toBe(report.generatedAt);
  });

  it('falls back without fabricating profile facts when the LLM is unavailable', async () => {
    const { service } = setup(); // aiClient answers { ok:false }
    global.fetch.mockResolvedValueOnce(okPage());
    const report = await service.analyzeLinkedInProfile({ profileUrl: 'https://www.linkedin.com/in/janedoe' });
    expect(report.success).toBe(true);
    expect(report.aiPowered).toBe(false);
    expect(report.optimizations.aboutRewrite).not.toMatch(/Acme|Google|Microsoft|10,000|award/i);
    expect(report.optimizations.recruiterSummary).toContain('rule-based fallback suggestions');
    expect(report.suggestions.length).toBeGreaterThan(0);
  });

  it.each([['not json'], ['{"headlineOptions":"nope","aboutRewrite":"x"}'], ['{"headlineOptions":["a"]}']])(
    'unusable structured output %p falls back', async (data) => {
      const { service } = setup({ script: [aiOk(data)] });
      const report = await service.analyzeLinkedInProfile({ headline: 'Frontend Engineer building React apps' });
      expect(report.aiPowered).toBe(false);
    });

  it('works from provided data alone (no fetch) and reports the source as not fetched', async () => {
    const { service } = setup();
    const report = await service.analyzeLinkedInProfile({ headline: 'Data Analyst | SQL', about: 'I analyse data.', skills: ['SQL'] });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(report.dataSources.publicFetch).toEqual({ fetched: false, reason: 'No public fetch (using provided data only)' });
    expect(report.dataSources.userProvided).toEqual({ headline: true, about: true, skills: 1, pastedText: false, experiences: 0 });
    expect(report.scoreDescription).toContain('based on real supplied profile data.');
  });

  it('still analyses provided data when the public fetch fails', async () => {
    const { service } = setup();
    global.fetch.mockResolvedValueOnce({ ok: false, status: 999, text: async () => '' });
    const report = await service.analyzeLinkedInProfile({ profileUrl: 'https://www.linkedin.com/in/x', headline: 'Engineer' });
    expect(report.success).toBe(true);
    expect(report.dataSources.publicFetch).toMatchObject({ fetched: false, status: 999 });
  });

  it('rejects empty analysis input with statusCode 400', async () => {
    const { service } = setup();
    const err = await service.analyzeLinkedInProfile({}).catch((e) => e);
    expect(err.message).toBe('Provide either a LinkedIn profile URL or profile data (headline, about, etc.).');
    expect(err.statusCode).toBe(400);
    await expect(service.analyzeLinkedInProfile()).rejects.toThrow('Provide either a LinkedIn profile URL');
  });

  it('rejects a URL when LinkedIn public data is blocked, with the source summary in details', async () => {
    const { service } = setup();
    global.fetch.mockResolvedValueOnce({ ok: false, status: 999, text: async () => '' });
    const err = await service.analyzeLinkedInProfile({ profileUrl: 'https://www.linkedin.com/in/privateprofile' }).catch((e) => e);
    expect(err.message).toBe('Could not fetch public LinkedIn profile data from that URL. LinkedIn returned HTTP 999.');
    expect(err.statusCode).toBe(400);
    expect(err.details).toMatchObject({ fetched: false, status: 999, reason: 'LinkedIn returned HTTP 999.' });
  });

  it('rejects an authwall page even though it was fetched', async () => {
    const { service } = setup();
    global.fetch.mockResolvedValueOnce(okPage('<title>Sign in | LinkedIn</title><body>Join LinkedIn to see the full profile. Sign in to continue. Security verification required to continue viewing.</body>'));
    await expect(service.analyzeLinkedInProfile({ profileUrl: 'https://www.linkedin.com/in/x' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('a rejecting aiClient propagates (the route turns it into a 500), like an exception from callAI on Express', async () => {
    const { service } = setup({ script: [new Error('provider exploded')] });
    await expect(service.analyzeLinkedInProfile({ headline: 'Engineer' })).rejects.toThrow('provider exploded');
  });
});

describe('model selection comes from config.vars, at call time', () => {
  it('analyze uses LM_STUDIO_MODEL_LINKEDIN, then LM_STUDIO_MODEL', async () => {
    let s = setup({ vars: { LM_STUDIO_MODEL_LINKEDIN: 'li-model', LM_STUDIO_MODEL: 'base', LM_STUDIO_MODEL_GITHUB: 'gh' } });
    await s.service.analyzeLinkedInProfile({ headline: 'Engineer' });
    expect(s.ai.calls[0].model).toBe('li-model');

    s = setup({ vars: { LM_STUDIO_MODEL: 'base' } });
    await s.service.analyzeLinkedInProfile({ headline: 'Engineer' });
    expect(s.ai.calls[0].model).toBe('base');

    s = setup({ vars: {} });
    await s.service.analyzeLinkedInProfile({ headline: 'Engineer' });
    expect(s.ai.calls[0].model).toBeUndefined();
  });

  it.each([
    ['generateHeadline', ['Dev'], 500, 0.7],
    ['generateAbout', ['ctx', ['a']], 800, 0.7],
    ['generateExperienceDescription', ['Dev', 'Acme'], 600, 0.7],
  ])('%s uses LM_STUDIO_MODEL_GITHUB then LM_STUDIO_MODEL (NOT the LinkedIn model), with its token budget', async (fn, args, maxTokens, temperature) => {
    let s = setup({ vars: { LM_STUDIO_MODEL_GITHUB: 'gh', LM_STUDIO_MODEL_LINKEDIN: 'li', LM_STUDIO_MODEL: 'base' } });
    await s.service[fn](...args);
    expect(s.ai.calls[0]).toMatchObject({ model: 'gh', maxTokens, temperature, structuredJson: true });
    s = setup({ vars: { LM_STUDIO_MODEL: 'base' } });
    await s.service[fn](...args);
    expect(s.ai.calls[0].model).toBe('base');
  });

  it('a config without vars behaves like an empty environment', async () => {
    const ai = makeAi();
    const service = createLinkedinOptimizerService({ config: undefined, services: { aiClient: ai } });
    await service.generateHeadline('Dev');
    expect(ai.calls[0].model).toBeUndefined();
  });
});

describe('generateHeadline / generateAbout / generateExperienceDescription', () => {
  it('headline: AI result is returned as parsed; offline -> template options; unparsable -> generic', async () => {
    let s = setup({ script: [aiOk({ options: ['a', 'b', 'c'], tips: 't' })] });
    await expect(s.service.generateHeadline('Dev', 'ctx', 'ach', ['Lead'])).resolves.toEqual({ options: ['a', 'b', 'c'], tips: 't' });
    expect(s.ai.calls[0].userPrompt).toBe('Create headlines for:\nRole: Dev\nCompany/Context: ctx\nKey achievements: ach\nTarget positions: Lead');

    s = setup();
    await expect(s.service.generateHeadline('Dev', undefined, undefined, ['Lead', 'Other'])).resolves.toEqual({
      options: ['Dev | Lead', 'Dev | Passionate about crafting solutions', 'Dev | Focused on impact and growth'],
      tips: "Include your role, key skills, and what you're passionate about",
    });
    s = setup();
    expect((await s.service.generateHeadline('Dev', null, null, 'Solo')).options[0]).toBe('Dev | Solo');
    s = setup();
    expect((await s.service.generateHeadline('Dev')).options[0]).toBe('Dev');

    s = setup({ script: [aiOk('no json here')] });
    await expect(s.service.generateHeadline('Dev')).resolves.toEqual({ options: ['Failed to generate'], tips: 'Please try again' });
  });

  it('about: prompt fields, offline template, unparsable generic', async () => {
    let s = setup({ script: [aiOk({ about: 'text', tips: 'tip' })] });
    await expect(s.service.generateAbout('Backend dev', ['Go', 'SQL'], undefined, ['A', 'B'], ['Fin', 'Health'])).resolves.toEqual({ about: 'text', tips: 'tip' });
    expect(s.ai.calls[0].userPrompt).toBe(
      'Generate an about section for:\nRole/Background: Backend dev\nKey skills: Go, SQL\nAchievements: Building products and leading teams\nTarget roles: A, B\nTarget industries: Fin, Health\n\nMake it professional, achievement-focused, and action-oriented.'
    );

    s = setup();
    await expect(s.service.generateAbout('Backend dev', ['Go', 'SQL', 'Rust', 'C'], 'x', 'R', ['Fin', 'Health'])).resolves.toEqual({
      about: 'Passionate Backend dev with expertise in Go, SQL, Rust. Focused on building impactful solutions and driving results. Interested in opportunities in Fin, Health.',
      tips: 'Add specific achievements and metrics to strengthen your profile',
    });
    s = setup();
    expect((await s.service.generateAbout('Dev', 'Go')).about).toBe('Passionate Dev with expertise in Go. Focused on building impactful solutions and driving results. Interested in opportunities in technology and innovation.');

    s = setup({ script: [aiOk('nothing')] });
    await expect(s.service.generateAbout('Dev', 'Go')).resolves.toEqual({ about: 'Unable to generate at this time', tips: 'Please try again' });
  });

  it('experience: prompt fields, offline template, unparsable generic', async () => {
    let s = setup({ script: [aiOk({ description: 'desc', tips: 'tip' })] });
    await expect(s.service.generateExperienceDescription('Engineer', 'Acme', 'Built APIs', 'Cut cost 30%')).resolves.toEqual({ description: 'desc', tips: 'tip' });
    expect(s.ai.calls[0].userPrompt).toBe(
      'Generate a work experience description for:\nJob Title: Engineer\nCompany: Acme\nResponsibilities: Built APIs\nAchievements/Impact: Cut cost 30%\n\nFocus on achievements, metrics, and impact.'
    );

    s = setup();
    await expect(s.service.generateExperienceDescription('Engineer', 'Acme')).resolves.toEqual({
      description: 'Worked on various projects at Acme. Contributed to team success and product development.',
      tips: 'Add specific metrics and measurable outcomes to strengthen impact',
    });
    s = setup({ script: [aiOk('nothing')] });
    await expect(s.service.generateExperienceDescription('E', 'A')).resolves.toEqual({ description: 'Unable to generate at this time', tips: 'Please try again' });
  });

  it('AI answers with ok:true but empty data are treated as failures (fallback)', async () => {
    const s = setup({ script: [{ ok: true, error: null, data: '' }] });
    expect((await s.service.generateHeadline('Dev')).options).toHaveLength(3);
  });
});

describe('aiClient wiring (Worker-specific)', () => {
  it('is resolved at call time, not at construction: a late-registered aiClient works', async () => {
    const services = {};
    const service = createLinkedinOptimizerService({ config: { vars: {} }, services });
    services.aiClient = makeAi([aiOk({ options: ['x'], tips: 'y' })]);
    await expect(service.generateHeadline('Dev')).resolves.toEqual({ options: ['x'], tips: 'y' });
  });

  it.each([[undefined], [{}], [{ callAI: () => {} }]])('a missing/incomplete aiClient (%p) throws instead of silently using the fallback', async (aiClient) => {
    const service = createLinkedinOptimizerService({ config: { vars: {} }, services: { aiClient } });
    await expect(service.generateHeadline('Dev')).rejects.toThrow('aiClient service is not registered');
    await expect(service.analyzeLinkedInProfile({ headline: 'Engineer' })).rejects.toThrow('aiClient service is not registered');
  });

  it('exposes exactly the original module exports', () => {
    expect(Object.keys(setup().service).sort()).toEqual([
      'analyzeLinkedInProfile', 'deriveProfileSignals', 'fetchLinkedInPublicData', 'generateAbout', 'generateExperienceDescription',
      'generateHeadline', 'keywordIntelligence', 'normalizeProfileInput',
    ]);
  });
});
