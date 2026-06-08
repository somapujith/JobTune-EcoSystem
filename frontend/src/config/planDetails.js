import { Crown, TrendingUp, Zap } from 'lucide-react';

export const PLAN_META = {
  'Learn & Build': {
    tier: 1,
    icon: Zap,
    color: 'blue',
    description: 'For service role learners',
    tagline: 'Start learning and building foundations',
  },
  'Tune & Polish': {
    tier: 2,
    icon: TrendingUp,
    color: 'purple',
    description: 'For resume & portfolio refinement',
    tagline: 'Polish your professional presence',
  },
  'Zero to Hero': {
    tier: 3,
    icon: Crown,
    color: 'amber',
    description: 'All tools & premium features',
    tagline: 'Full ecosystem for job-ready professionals',
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
  return `$${price}/mo`;
}
