import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Target, Rocket, Wrench, ChevronRight, BrainCircuit, Loader2, Star, Lock, Zap, ArrowRight } from 'lucide-react';
import { api } from '../store/useAuthStore';
import useSubscriptionStore from '../store/useSubscriptionStore';
import PreparationOnboarding from './PreparationOnboarding';

const PLAN_TIER = { 'Learn & Build': 1, 'Tune & Polish': 2, 'Zero to Hero': 3 };

const TRACKS = [
  {
    id: 'learn-and-build',
    title: 'Learn & Build',
    subtitle: 'For Intermediate Builders',
    description: 'Structured learning paths, skill checklists, and AI-generated portfolio projects to fill skill gaps and impress employers.',
    icon: Wrench,
    color: 'from-orange-400 to-rose-500',
    bgAccent: 'bg-orange-50 dark:bg-orange-900/10',
    path: '/preparation/learn-and-build',
    minPlan: 'Learn & Build',
    features: ['Curated learning paths', 'Skill checklists', 'AI project ideas', 'Portfolio Kanban'],
  },
  {
    id: 'tune-and-polish',
    title: 'Tune & Polish',
    subtitle: 'For Experienced Professionals',
    description: 'Job readiness checklist, STAR story generator, resume & LinkedIn optimization — everything to sharpen your application.',
    icon: Target,
    color: 'from-blue-500 to-indigo-600',
    bgAccent: 'bg-blue-50 dark:bg-blue-900/10',
    path: '/preparation/tune-and-polish',
    minPlan: 'Tune & Polish',
    features: ['Job readiness tracker', 'STAR story generator', 'Resume & ATS tools', 'Mock interviews'],
  },
  {
    id: 'zero-to-hero',
    title: 'Zero to Hero',
    subtitle: 'Complete Beginner Roadmap',
    description: 'Start from scratch with roadmap.sh content, an AI Tutor, and module assessments (MCQ, coding, system design).',
    icon: Rocket,
    color: 'from-emerald-400 to-teal-600',
    bgAccent: 'bg-emerald-50 dark:bg-emerald-900/10',
    path: '/preparation/zero-to-hero',
    minPlan: 'Zero to Hero',
    features: ['163 learning modules', 'AI Tutor sidebar', 'Mixed assessments', 'Flashcard review'],
  },
];

export default function JobPreparation() {
  const [status, setStatus] = useState('loading'); // 'loading' | 'onboarding' | 'hub'
  const [recommendedTrack, setRecommendedTrack] = useState(null);
  const { userPlan } = useSubscriptionStore();
  const planTier = PLAN_TIER[userPlan?.name] || 0;

  useEffect(() => {
    let cancelled = false;
    api.get('/progress/preferences')
      .then(({ data }) => {
        if (cancelled) return;
        const prefs = data?.data || {};
        if (prefs.prepOnboardingDone) {
          setRecommendedTrack(prefs.recommendedTrack || null);
          setStatus('hub');
        } else {
          setStatus('onboarding');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('onboarding');
      });
    return () => { cancelled = true; };
  }, []);

  const handleOnboardingComplete = ({ recommendedTrack: track }) => {
    setRecommendedTrack(track);
    setStatus('hub');
  };

  if (status === 'loading') {
    return (
      <div className="w-full min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  if (status === 'onboarding') {
    return <PreparationOnboarding onComplete={handleOnboardingComplete} />;
  }

  // ---- HUB VIEW ----
  return (
    <div className="page-container space-y-12">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl mb-2">
          <BrainCircuit className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h1 className="page-title text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Preparation Dashboard
        </h1>
        <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Your three AI-powered tracks are ready. Pick up where you left off or explore a new path.
        </p>
      </div>

      {/* Tracks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TRACKS.map((track) => {
          const Icon = track.icon;
          const isRecommended = track.id === recommendedTrack;
          const requiredTier = PLAN_TIER[track.minPlan] || 1;
          const hasAccess = planTier >= requiredTier;

          const CardInner = (
            <>
              {isRecommended && hasAccess && (
                <div className="absolute top-4 right-4 flex items-center gap-1 bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                  <Star className="w-3 h-3" /> Your Track
                </div>
              )}
              {!hasAccess && (
                <div className="absolute top-4 right-4 flex items-center gap-1 bg-slate-700 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                  <Lock className="w-3 h-3" /> Locked
                </div>
              )}

              <div className={`absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-gradient-to-br ${track.color} opacity-10 blur-2xl group-hover:opacity-20 transition-opacity`} />

              <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${track.color} text-white mb-6 shadow-lg ${!hasAccess ? 'opacity-50' : ''}`}>
                {hasAccess ? <Icon className="w-7 h-7" /> : <Lock className="w-7 h-7" />}
              </div>

              <div className="flex-1">
                <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-1 uppercase tracking-wider">
                  {track.subtitle}
                </p>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">{track.title}</h2>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-4">{track.description}</p>
                <ul className="space-y-1.5 mb-6">
                  {track.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${hasAccess ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              <div className={`flex items-center text-sm font-bold transition-colors mt-auto ${
                hasAccess
                  ? 'text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400'
                  : 'text-slate-400'
              }`}>
                {hasAccess
                  ? (isRecommended ? 'Continue Track' : 'Start Track')
                  : `Upgrade to ${track.minPlan}`}
                <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </>
          );

          return hasAccess ? (
            <Link
              key={track.id}
              to={track.path}
              className={`group relative flex flex-col rounded-2xl p-8 hover:-translate-y-2 transition-all duration-300 hover:shadow-xl overflow-hidden border ${
                isRecommended
                  ? 'border-blue-300 dark:border-blue-700 shadow-lg shadow-blue-100 dark:shadow-blue-900/20 ' + track.bgAccent
                  : 'border-white/50 dark:border-slate-700/50 card'
              }`}
            >
              {CardInner}
            </Link>
          ) : (
            <Link
              key={track.id}
              to="/plan-settings"
              className="group relative flex flex-col rounded-2xl p-8 transition-all duration-300 hover:shadow-md overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 cursor-pointer"
            >
              {CardInner}
            </Link>
          );
        })}
      </div>

      {/* Upgrade Banner if on free/lower tier */}
      {planTier < 3 && (
        <div className="card rounded-2xl p-5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border border-blue-200 dark:border-blue-800/50">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-100 dark:bg-blue-950/50 rounded-xl">
                <Zap className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white">
                  {planTier === 0 ? 'Unlock all three preparation tracks' : planTier === 1 ? 'Upgrade to Tune & Polish or Zero to Hero' : 'Upgrade to Zero to Hero for the full roadmap'}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Get access to advanced tracks, AI assessments, and structured learning paths.</p>
              </div>
            </div>
            <Link to="/plan-settings" className="btn-primary shrink-0 flex items-center gap-2">
              View Plans <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Re-take questionnaire link */}
      <div className="text-center">
        <button
          onClick={async () => {
            try {
              await api.patch('/progress/preferences', { data: { prepOnboardingDone: false } });
            } catch {}
            window.dispatchEvent(new Event('prep-onboarding-reset'));
            setStatus('onboarding');
            setRecommendedTrack(null);
          }}
          className="text-sm text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
        >
          Not sure which track? Retake the questionnaire →
        </button>
      </div>
    </div>
  );
}
