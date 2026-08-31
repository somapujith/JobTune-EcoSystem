import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';
import useSubscriptionStore from '../store/useSubscriptionStore';
import OnboardingQuestionnaire from '../components/OnboardingQuestionnaire';
import PlanSelection from '../components/PlanSelection';

const STEPS = {
  QUESTIONNAIRE: 'questionnaire',
  PLAN_SELECTION: 'plan-selection',
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

  return (
    <div className="w-full h-screen overflow-hidden">
      {currentStep === STEPS.QUESTIONNAIRE && (
        <OnboardingQuestionnaire onComplete={handleQuestionnaireComplete} />
      )}

      {currentStep === STEPS.PLAN_SELECTION && recommendation && (
        <PlanSelection recommendation={recommendation} />
      )}
    </div>
  );
}
