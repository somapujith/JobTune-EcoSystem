import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sparkles, CheckCircle2 } from 'lucide-react';
import useSubscriptionStore from '../store/useSubscriptionStore';

// Map discovery-flow answer ids (CareerDiscovery.jsx) to the fixed input buckets
// the backend recommendation engine expects (backend/src/services/recommendationEngine.js).
const FINAL_GOAL_TO_CAREER_GOAL = {
  product_company: 'faang-or-top-company',
  interviews: 'faang-or-top-company',
  internship: 'service-role',
  placement: 'service-role',
  // fullstack, dsa_master, portfolio, direction (or missing) -> 'skill-development'
};

const STAGE_TO_EXPERIENCE = {
  y1: 'beginner',
  y2: 'beginner',
  y3: 'intermediate',
  y4: 'advanced',
  grad: 'advanced',
};

const CHALLENGE_TO_PAIN_POINT = {
  resume: 'resume-portfolio',
  interview: 'interviews',
  confidence: 'interviews',
  apply: 'job-search',
  dont_know_learn: 'skill-gaps',
  tutorial_hell: 'skill-gaps',
  dsa: 'skill-gaps',
  consistency: 'skill-gaps',
  mentor: 'networking',
  no_projects: 'project-building',
};

export default function SubscriptionGate() {
  const navigate = useNavigate();
  const location = useLocation();
  const { answers } = location.state || {};
  const { getRecommendation, selectPlan, fetchPlans } = useSubscriptionStore();

  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');

  useEffect(() => {
    const careerGoal = FINAL_GOAL_TO_CAREER_GOAL[answers?.final_goal] || 'skill-development';
    const experienceLevel = STAGE_TO_EXPERIENCE[answers?.stage] || 'intermediate';
    const mapped = [
      ...new Set(
        (answers?.challenges || []).map((c) => CHALLENGE_TO_PAIN_POINT[c]).filter(Boolean)
      ),
    ];
    // Backend rejects empty painPoints with a 400 — always send at least one bucket.
    const painPoints = mapped.length > 0 ? mapped : ['skill-gaps'];

    getRecommendation(careerGoal, experienceLevel, painPoints).catch(() => {
      // Recommendation failed — fetch plans so a fallback plan id is still available.
      fetchPlans();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resolvePlanId = async () => {
    const rec = useSubscriptionStore.getState().recommendation;
    if (rec?.recommendedPlan?.id) return rec.recommendedPlan.id;

    let availablePlans = useSubscriptionStore.getState().plans;
    if (!availablePlans || availablePlans.length === 0) {
      await fetchPlans();
      availablePlans = useSubscriptionStore.getState().plans;
    }

    const byName = rec?.recommendedPlan?.name
      ? (availablePlans || []).find((p) => p.name === rec.recommendedPlan.name)
      : null;
    if (byName?.id) return byName.id;

    const tierTwo = (availablePlans || []).find((p) => p.tier_level === 2);
    if (tierTwo?.id) return tierTwo.id;

    // Last resort: any plan at all, so a missing tier-2 config can't hard-lock the user out.
    return (availablePlans || [])[0]?.id || null;
  };

  const handleUnlock = async () => {
    if (unlocking) return;
    setUnlockError('');
    setUnlocking(true);
    try {
      const planId = await resolvePlanId();
      if (!planId) throw new Error('No plan available to select');
      await selectPlan(planId);
      navigate('/dashboard');
    } catch (err) {
      console.error('Failed to unlock plan:', err);
      setUnlockError('Something went wrong activating your plan. Please try again.');
      setUnlocking(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] font-sans flex items-center justify-center p-6 relative overflow-hidden">

      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600/20 rounded-full blur-[150px] pointer-events-none" />

      <div className="max-w-3xl w-full bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[40px] p-8 md:p-16 flex flex-col items-center text-center relative z-10 shadow-2xl">

        <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(59,130,246,0.6)]">
          <Sparkles className="w-10 h-10 text-white" />
        </div>

        <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">
          Your Career Blueprint is Ready.
        </h1>

        <p className="text-lg md:text-xl text-slate-300 mb-12 max-w-2xl leading-relaxed">
          We've analyzed your profile and prepared a personalized roadmap.
          Unlock your AI mentor, roadmap, project guidance, interview preparation,
          resume optimization, and career tracking.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 mb-12 text-left">
          {[
            "Personalized AI Career Roadmap",
            "Unlimited Technical AI Mentor",
            "ATS Resume Optimizer",
            "AI Mock Interviews",
            "Custom Project Generator",
            "Automated GitHub Reviews"
          ].map((benefit, i) => (
            <div key={i} className="flex items-center text-slate-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 mr-3 flex-shrink-0" />
              <span className="font-medium">{benefit}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-6 w-full max-w-md">
          <button
            onClick={handleUnlock}
            disabled={unlocking}
            className="flex-1 py-4 px-8 rounded-full bg-white text-[#04091a] font-bold text-lg hover:scale-105 hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
          >
            {unlocking ? 'Activating your plan...' : 'Unlock My Career Plan'}
          </button>
        </div>

        {unlockError && (
          <p className="mt-4 text-sm font-semibold text-rose-400">{unlockError}</p>
        )}

        <button
          onClick={() => navigate('/dashboard/settings/plans')}
          className="mt-8 text-slate-400 hover:text-white font-medium underline underline-offset-4 transition-colors"
        >
          Compare Plans
        </button>

      </div>
    </div>
  );
}
