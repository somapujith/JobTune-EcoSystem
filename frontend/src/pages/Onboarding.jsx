import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';
import useSubscriptionStore from '../store/useSubscriptionStore';
import OnboardingQuestionnaire from '../components/OnboardingQuestionnaire';
import PlanSelection from '../components/PlanSelection';

const STEPS = {
  QUESTIONNAIRE: 'questionnaire',
  PLAN_SELECTION: 'plan-selection',
  COMPLETE: 'complete'
};

export default function Onboarding() {
  const { isAuthenticated } = useAuthStore();
  const { recommendation, onboardingComplete, fetchPlans } = useSubscriptionStore();
  const [currentStep, setCurrentStep] = useState(STEPS.QUESTIONNAIRE);

  useEffect(() => {
    if (isAuthenticated) {
      fetchPlans();
    }
  }, [isAuthenticated, fetchPlans]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (onboardingComplete) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleQuestionnaireComplete = () => {
    setCurrentStep(STEPS.PLAN_SELECTION);
  };

  const handlePlanSelected = () => {
    setCurrentStep(STEPS.COMPLETE);
    setTimeout(() => {
      window.location.href = '/payment-confirm';
    }, 500);
  };

  return (
    <div className="w-full h-screen overflow-hidden">
      {currentStep === STEPS.QUESTIONNAIRE && (
        <OnboardingQuestionnaire onComplete={handleQuestionnaireComplete} />
      )}

      {currentStep === STEPS.PLAN_SELECTION && recommendation && (
        <PlanSelection recommendation={recommendation} onPlanSelected={handlePlanSelected} />
      )}

      {currentStep === STEPS.COMPLETE && (
        <div className="w-full h-screen bg-gradient-to-br from-green-50 to-emerald-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-3">All Set!</h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 mb-6">Redirecting to your dashboard...</p>
            <div className="w-64 h-1 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full mx-auto animate-pulse"></div>
          </div>
        </div>
      )}
    </div>
  );
}
