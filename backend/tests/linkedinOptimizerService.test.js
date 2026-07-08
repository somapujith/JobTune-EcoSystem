jest.mock('../src/utils/aiClient', () => ({
  callAI: jest.fn(),
  extractJSON: jest.requireActual('../src/utils/aiClient').extractJSON,
}));

const { callAI } = require('../src/utils/aiClient');
const {
  analyzeLinkedInProfile,
  fetchLinkedInPublicData,
  normalizeProfileInput,
} = require('../src/services/linkedinOptimizerService');

describe('linkedinOptimizerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  function mockLinkedInPage() {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <html>
          <head>
            <title>Jane Doe - Frontend Engineer | React TypeScript | LinkedIn</title>
            <meta property="og:description" content="Jane builds React dashboards and design systems. Built a dashboard used by 2,000 users and improved load time by 30%." />
            <script type="application/ld+json">
              {
                "@type": "Person",
                "name": "Jane Doe",
                "headline": "Frontend Engineer",
                "jobTitle": "Frontend Engineer",
                "knowsAbout": ["React", "TypeScript", "JavaScript", "Design Systems"]
              }
            </script>
          </head>
          <body><main>Jane Doe Frontend Engineer React TypeScript JavaScript Design Systems. Built dashboards for 2,000 users.</main></body>
        </html>
      `,
    });
  }

  it('normalizes comma-separated fields into arrays', () => {
    const profile = normalizeProfileInput({
      skills: 'React, TypeScript\nNode.js',
      targetRoles: 'Frontend Engineer, Full Stack Engineer',
      targetIndustries: ['SaaS', 'FinTech'],
    });

    expect(profile.skills).toEqual(['React', 'TypeScript', 'Node.js']);
    expect(profile.targetRoles).toEqual(['Frontend Engineer', 'Full Stack Engineer']);
    expect(profile.targetIndustries).toEqual(['SaaS', 'FinTech']);
  });

  it('extracts real public LinkedIn metadata when the page is reachable', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <html>
          <head>
            <title>Jane Doe - Frontend Engineer | LinkedIn</title>
            <meta property="og:description" content="Jane builds React dashboards and design systems." />
          </head>
          <body><main>Jane Doe Frontend Engineer React TypeScript</main></body>
        </html>
      `,
    });

    const data = await fetchLinkedInPublicData('https://www.linkedin.com/in/janedoe');

    expect(data.fetched).toBe(true);
    expect(data.title).toContain('Jane Doe');
    expect(data.description).toContain('React dashboards');
    expect(data.pageText).toContain('Frontend Engineer');
  });

  it('uses local LLM structured output when available', async () => {
    mockLinkedInPage();
    callAI.mockResolvedValueOnce({
      ok: true,
      data: JSON.stringify({
        headlineOptions: [
          'Frontend Engineer | React | TypeScript | Design Systems',
          'React Developer | TypeScript | Accessible UI',
        ],
        aboutRewrite: 'I build accessible React products with TypeScript and measurable user impact.',
        experienceImprovements: [
          {
            current: 'Worked on dashboard',
            improved: 'Built a React dashboard used by 2,000 users.',
            reason: 'Adds action and measurable scope.',
          },
        ],
        quickWins: [
          { action: 'Move React and TypeScript into the first headline segment.', effort: '5 minutes', impact: 'high' },
        ],
        recruiterSummary: 'Strong frontend positioning with room for more quantified proof.',
        activityRecommendations: ['Comment weekly on frontend engineering posts.'],
        skillRecommendations: ['Accessibility', 'Design Systems'],
      }),
    });

    const report = await analyzeLinkedInProfile({
      profileUrl: 'https://www.linkedin.com/in/janedoe',
    });

    expect(report.success).toBe(true);
    expect(report.aiPowered).toBe(true);
    expect(report.optimizations.aboutRewrite).toContain('accessible React products');
    expect(report.dataSources.publicFetch.fetched).toBe(true);
    expect(report.score).toBeGreaterThan(0);
    expect(report.metrics).toHaveLength(5);
  });

  it('falls back without fabricating profile facts when the LLM is unavailable', async () => {
    mockLinkedInPage();
    callAI.mockResolvedValueOnce({ ok: false, error: 'offline', data: null });

    const report = await analyzeLinkedInProfile({
      profileUrl: 'https://www.linkedin.com/in/janedoe',
    });

    expect(report.success).toBe(true);
    expect(report.aiPowered).toBe(false);
    expect(report.optimizations.aboutRewrite).not.toMatch(/Acme|Google|Microsoft|10,000|award/i);
    expect(report.suggestions.length).toBeGreaterThan(0);
  });

  it('rejects empty analysis input', async () => {
    await expect(analyzeLinkedInProfile({})).rejects.toThrow('Provide either a LinkedIn profile URL or profile data');
  });

  it('rejects a URL when LinkedIn public data is blocked', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 999,
      text: async () => '',
    });

    await expect(analyzeLinkedInProfile({
      profileUrl: 'https://www.linkedin.com/in/privateprofile',
    })).rejects.toThrow('Could not fetch public LinkedIn profile data');
  });
});
