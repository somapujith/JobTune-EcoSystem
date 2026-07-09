import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, CheckCircle2 } from 'lucide-react';
import useSubscriptionStore from '../store/useSubscriptionStore';
import useAuthStore from '../store/useAuthStore';

export default function SubscriptionGate() {
  const navigate = useNavigate();
  const { setOnboardingComplete } = useSubscriptionStore();
  const { user } = useAuthStore();

  const handleUnlock = async () => {
    // In a real app, this would open a checkout portal or update subscription state.
    // For now, we simulate unlocking and finalizing onboarding.
    await setOnboardingComplete(true);
    navigate('/dashboard');
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
            className="flex-1 py-4 px-8 rounded-full bg-white text-[#04091a] font-bold text-lg hover:scale-105 hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] transition-all"
          >
            Unlock My Career Plan
          </button>
        </div>
        
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
