import { Crown, TrendingUp, Zap } from 'lucide-react';

export const PLAN_META = {
  'Learn & Build': {
    tier: 1,
    icon: Zap,
    color: 'blue',
    description: 'Build the skills, projects, and portfolio needed for your dream career.',
    tagline: 'Build the skills, projects, and portfolio for your dream career.',
    bestFor: 'Students & beginners starting their career journey',
    outcome: 'Go from no skills to a strong, project-backed portfolio.',
  },
  'Tune & Polish': {
    tier: 2,
    icon: TrendingUp,
    color: 'purple',
    description: 'Turn your existing skills into a recruiter-ready professional profile.',
    tagline: 'Turn your skills into a recruiter-ready professional profile.',
    bestFor: 'Job seekers ready to optimize their applications',
    outcome: 'Go from raw skills to a polished, recruiter-ready profile.',
  },
  'Zero to Hero': {
    tier: 3,
    icon: Crown,
    color: 'amber',
    description: 'The complete career transformation ecosystem.',
    tagline: 'The complete career transformation ecosystem.',
    bestFor: 'Serious candidates who want the full advantage',
    outcome: 'Go from zero to fully job-ready, interview-confident, and hired.',
  },
};

export function getPlanTier(planName) {
  return PLAN_META[planName]?.tier || 0;
}

export function getChangeType(currentPlanName, targetPlanName) {
  const currentTier = getPlanTier(currentPlanName);
  const targetTier = getPlanTier(targetPlanName);
  if (targetTier > currentTier) return 'upgrade';
  if (targetTier < currentTier) return 'downgrade';
  return 'same';
}

export function getFeatureDiff(currentFeatures = [], nextFeatures = []) {
  const current = new Set(currentFeatures);
  const next = new Set(nextFeatures);
  return {
    gained: [...next].filter((feature) => !current.has(feature)),
    lost: [...current].filter((feature) => !next.has(feature)),
  };
}

export function formatPrice(price) {
  if (price === 0 || price === '0') return 'Free';
  return `₹${price}/mo`;
}
