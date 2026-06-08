import React from 'react';
import { Lock, Crown, TrendingUp, Zap } from 'lucide-react';
import useSubscriptionStore from '../store/useSubscriptionStore';

const PLAN_COLORS = {
  'Learn & Build': { icon: Zap, color: 'blue', label: 'Entry Plan' },
  'Tune & Polish': { icon: TrendingUp, color: 'purple', label: 'Mid Plan' },
  'Zero to Hero': { icon: Crown, color: 'amber', label: 'Premium Plan' }
};

export default function PlanGate({ toolName, requiredPlan = 'Tune & Polish', children, fallback = null }) {
  const { userPlan, onboardingComplete } = useSubscriptionStore();

  // Hasn't completed onboarding yet, show loading
  if (!onboardingComplete) {
    return fallback || (
      <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="text-center">
          <div className="animate-spin mb-4">
            <Zap className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-slate-600 dark:text-slate-400 font-medium">Setting up your plan...</p>
        </div>
      </div>
    );
  }

  // Check if user has access
  const hasAccess = userPlan && userPlan.features && userPlan.features.includes(toolName);

  if (hasAccess) {
    return children;
  }

  // Show locked UI
  const planConfig = PLAN_COLORS[requiredPlan] || PLAN_COLORS['Tune & Polish'];
  const IconComponent = planConfig.icon;

  return (
    <div className="w-full min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="max-w-md w-full text-center">
        <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full bg-${planConfig.color}-100 dark:bg-${planConfig.color}-900/30 mb-6`}>
          <Lock className={`w-10 h-10 text-${planConfig.color}-600 dark:text-${planConfig.color}-400`} />
        </div>

        <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-3">
          {toolName} Locked
        </h1>

        <p className="text-slate-600 dark:text-slate-400 mb-8">
          This tool is only available in the <span className="font-bold text-slate-900 dark:text-white">{requiredPlan}</span> plan or higher.
        </p>

        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 mb-8">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Your current plan:</p>
          <div className="flex items-center gap-3">
            <IconComponent className="w-6 h-6 text-slate-400" />
            <span className="text-xl font-bold text-slate-900 dark:text-white">{userPlan?.name || 'Unknown'}</span>
          </div>
        </div>

        <button
          onClick={() => window.location.href = '/dashboard/settings/plans'}
          className="w-full py-3 px-6 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all mb-3"
        >
          Upgrade Plan
        </button>

        <button
          onClick={() => window.history.back()}
          className="w-full py-3 px-6 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all"
        >
          Go Back
        </button>
      </div>
    </div>
  );
}
