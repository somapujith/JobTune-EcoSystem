'use strict';

/**
 * services/achievementEnhancerService.js (Worker) vs the Express original, fed the ORIGINAL v2 analyzers
 * (the infra contract: services.actionVerbAnalyzer / services.metricsAnalyzer expose the original modules' exports).
 */
const expressService = require('../../../src/services/achievementEnhancerService');
const ActionVerbAnalyzer = require('../../../src/services/v2/actionVerbAnalyzer');
const MetricsAnalyzer = require('../../../src/services/v2/metricsAnalyzer');
const {
  createAchievementEnhancerService,
  DOMAIN_KEYWORDS,
  IMPACT_PHRASES,
} = require('../../../src/worker/services/achievementEnhancerService');
const { createServices } = require('../../../src/worker/services');

const worker = createAchievementEnhancerService({
  services: { actionVerbAnalyzer: ActionVerbAnalyzer, metricsAnalyzer: MetricsAnalyzer },
});

const ACHIEVEMENTS = [
  'Created Attendance System',
  'made a website',
  'helped the team ship',
  'Led a team of 5 engineers, reducing deploy time by 40%',
  'Optimized SQL queries, cutting page load from 3s to 800ms',
  'Managed $2M annual budget',
  'API',
  'built ML model',
  'organized workshops',
  'designed brand guidelines in Figma',
  'Launched SEO campaign that grew audience 3x',
  'wrote unit tests',
  'fixed bugs.',
  'Trained new hires   on  the   onboarding process...',
  'set up CI',
  'improved',
  'conducted a survey study on hypothesis',
  '   ',
  '',
];
const ROLES = ['', 'Backend Developer', 'Marketing Manager'];

describe('achievementEnhancerService (worker) vs Express', () => {
  it('exports the same constants', () => {
    expect(DOMAIN_KEYWORDS).toEqual(expressService.DOMAIN_KEYWORDS);
    expect(IMPACT_PHRASES).toEqual(expressService.IMPACT_PHRASES);
    expect(Object.keys(worker).sort()).toEqual(Object.keys(expressService).sort());
  });

  describe.each(ROLES)('roleHint %j', (role) => {
    it.each(ACHIEVEMENTS.map((a) => [a]))('%j: detectContext, extractImpact, generateFallbackBullet are identical', (a) => {
      expect(worker.detectContext(a, role)).toEqual(expressService.detectContext(a, role));
      expect(worker.extractImpact(a)).toEqual(expressService.extractImpact(a));
      expect(worker.generateFallbackBullet(a, role)).toBe(expressService.generateFallbackBullet(a, role));
    });

    it('generateFallbackBullets is identical (array, single string, mixed non-strings)', () => {
      expect(worker.generateFallbackBullets(ACHIEVEMENTS, role)).toEqual(expressService.generateFallbackBullets(ACHIEVEMENTS, role));
      expect(worker.generateFallbackBullets('created a thing', role)).toEqual(expressService.generateFallbackBullets('created a thing', role));
      expect(worker.generateFallbackBullets(['ok item', 5, null, undefined, {}], role)).toEqual(
        expressService.generateFallbackBullets(['ok item', 5, null, undefined, {}], role)
      );
    });
  });

  it('default arguments (undefined, no roleHint) behave like Express', () => {
    expect(worker.detectContext(undefined)).toEqual(expressService.detectContext(undefined));
    expect(worker.extractImpact(undefined)).toEqual(expressService.extractImpact(undefined));
    expect(worker.generateFallbackBullet(undefined)).toBe(expressService.generateFallbackBullet(undefined));
  });

  it('takes the analyzers from the injected container at call time (nothing captured at module scope)', () => {
    const analyze = jest.fn(() => ({ strongVerbs: ['x'], weakVerbs: [] }));
    const svc = createAchievementEnhancerService({
      services: {
        actionVerbAnalyzer: { analyze, STRONG_VERBS: ['built'] },
        metricsAnalyzer: { analyze: () => ({ metrics: [], count: 0 }) },
      },
    });
    expect(svc.detectContext('anything').strongVerbs).toEqual(['x']);
    expect(analyze).toHaveBeenCalledWith('anything');
    expect(svc.extractImpact('built a thing').hasStrongVerb).toBe(true);
    expect(svc.extractImpact('broke a thing').hasStrongVerb).toBe(false);
  });

  it('through the real registry with the REAL infra analyzers (services.actionVerbAnalyzer / metricsAnalyzer): identical to Express', () => {
    const services = createServices({ db: {}, config: { vars: {} } });
    const svc = services.achievementEnhancerService;
    expect(services.actionVerbAnalyzer.STRONG_VERBS).toEqual(ActionVerbAnalyzer.STRONG_VERBS);
    for (const role of ROLES) {
      for (const a of ACHIEVEMENTS) {
        expect(svc.detectContext(a, role)).toEqual(expressService.detectContext(a, role));
        expect(svc.extractImpact(a)).toEqual(expressService.extractImpact(a));
        expect(svc.generateFallbackBullet(a, role)).toBe(expressService.generateFallbackBullet(a, role));
      }
    }
  });
});
