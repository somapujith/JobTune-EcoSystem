import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';
import useSubscriptionStore from '../store/useSubscriptionStore';
import { Check, Crown, TrendingUp, Zap } from 'lucide-react';

const PLAN_DETAILS = {
  'Learn & Build': {
    tier: 1,
    price: 0,
    icon: Zap,
    description: 'For service role learners',
    features: ['Learning Resources', 'Project Ideas', 'Skill Assessment']
  },
  'Tune & Polish': {
    tier: 2,
    price: 29,
    icon: TrendingUp,
    description: 'For resume & portfolio refinement',
    features: ['All Learn & Build features', 'Resume Optimizer', 'LinkedIn Optimizer', 'GitHub Optimizer', 'Portfolio Builder']
  },
  'Zero to Hero': {
    tier: 3,
    price: 79,
    icon: Crown,
    description: 'All tools & premium features',
    features: ['All Tune & Polish features', 'Interview Prep', 'Job Tracker', 'Career Roadmap', 'ATS Checker', 'Cover Letter Generator', 'Mock Interview']
  }
};

export default function PlanSettings() {
  const { isAuthenticated } = useAuthStore();
  const { userPlan, plans, selectPlan, isLoading, fetchPlans } = useSubscriptionStore();

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const handleUpgrade = async (planId) => {
    try {
      await selectPlan(planId);
      window.location.reload();
    } catch (err) {
      console.error('Failed to change plan:', err);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="mb-12">
        <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-3">Subscription Plans</h1>
        <p className="text-lg text-slate-600 dark:text-slate-400">Manage your plan and access tools</p>
      </div>

      {/* Current Plan */}
      {userPlan && (
        <div className="mb-12 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-200 dark:border-blue-800">
          <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mb-2">CURRENT PLAN</p>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">{userPlan.name}</h2>
          <p className="text-slate-600 dark:text-slate-400">
            You have access to {userPlan.features.length} tools
          </p>
        </div>
      )}

      {/* Plans Grid */}
      <div className="grid md:grid-cols-3 gap-8">
        {plans.map(plan => {
          const details = PLAN_DETAILS[plan.name] || {};
          const PlanIcon = details.icon || Crown;
          const isCurrentPlan = userPlan?.id === plan.id;
          const canDowngrade = userPlan && PLAN_DETAILS[userPlan.name]?.tier > details.tier;
          const canUpgrade = userPlan && PLAN_DETAILS[userPlan.name]?.tier < details.tier;

          return (
            <div
              key={plan.id}
              className={`rounded-2xl p-8 transition-all ${
                isCurrentPlan
                  ? 'bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-600'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:shadow-lg'
              }`}
            >
              {/* Icon & Name */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-xl flex items-center justify-center">
                  <PlanIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{details.description}</p>
                </div>
              </div>

              {/* Price */}
              <div className="mb-6">
                {plan.price === 0 ? (
                  <p className="text-3xl font-black text-blue-600 dark:text-blue-400">Free</p>
                ) : (
                  <>
                    <p className="text-4xl font-black text-slate-900 dark:text-white">${plan.price}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">/month</p>
                  </>
                )}
              </div>

              {/* Features */}
              <div className="mb-8 space-y-3">
                {plan.features.map((feature, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-slate-700 dark:text-slate-300">{feature}</span>
                  </div>
                ))}
              </div>

              {/* Action Button */}
              <button
                onClick={() => handleUpgrade(plan.id)}
                disabled={isCurrentPlan || isLoading}
                className={`w-full py-3 px-4 rounded-xl font-bold transition-all ${
                  isCurrentPlan
                    ? 'bg-blue-600 text-white cursor-default'
                    : canUpgrade
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : canDowngrade
                    ? 'bg-amber-600 text-white hover:bg-amber-700'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white'
                } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isCurrentPlan
                  ? '✓ Current Plan'
                  : canUpgrade
                  ? 'Upgrade to ' + plan.name
                  : canDowngrade
                  ? 'Change to ' + plan.name
                  : 'Select Plan'}
              </button>
            </div>
          );
        })}
      </div>

      {/* FAQ */}
      <div className="mt-16 max-w-2xl">
        <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-8">FAQ</h3>
        <div className="space-y-6">
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-2">Can I change my plan anytime?</h4>
            <p className="text-slate-600 dark:text-slate-400">
              Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-2">What happens if I downgrade?</h4>
            <p className="text-slate-600 dark:text-slate-400">
              You'll lose access to tools not available in your new plan. Your data will be preserved.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-2">Is there a free trial?</h4>
            <p className="text-slate-600 dark:text-slate-400">
              Yes! Learn & Build is completely free and gives you access to core learning features.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
