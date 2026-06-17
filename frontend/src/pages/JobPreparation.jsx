import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Target, Rocket, Wrench, ChevronRight, BrainCircuit, Loader2, Star } from 'lucide-react';
import { api } from '../store/useAuthStore';
import PreparationOnboarding from './PreparationOnboarding';

const TRACKS = [
  {
    id: 'zero-to-hero',
    title: 'Zero to Hero',
    subtitle: 'For Complete Beginners',
    description: 'Start from scratch with an AI-generated roadmap tailored to your role. Your personal AI Tutor explains every concept along the way.',
    icon: Rocket,
    color: 'from-emerald-400 to-teal-600',
    bgAccent: 'bg-emerald-50 dark:bg-emerald-900/10',
    path: '/preparation/zero-to-hero',
  },
  {
    id: 'tune-and-polish',
    title: 'Tune & Polish',
    subtitle: 'For Experienced Professionals',
    description: 'Generate STAR interview stories, run your resume through ATS, and sharpen everything before the big leap.',
    icon: Target,
    color: 'from-blue-500 to-indigo-600',
    bgAccent: 'bg-blue-50 dark:bg-blue-900/10',
    path: '/preparation/tune-and-polish',
  },
  {
    id: 'learn-and-build',
    title: 'Learn & Build',
    subtitle: 'For Intermediate Builders',
    description: 'Generate hyper-targeted portfolio projects to fill skill gaps and track everything on a visual Kanban board.',
    icon: Wrench,
    color: 'from-orange-400 to-rose-500',
    bgAccent: 'bg-orange-50 dark:bg-orange-900/10',
    path: '/preparation/learn-and-build',
  },
];

export default function JobPreparation() {
  const [status, setStatus] = useState('loading'); // 'loading' | 'onboarding' | 'hub'
  const [recommendedTrack, setRecommendedTrack] = useState(null);

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
          <p className="text-slate-500 font-medium">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  if (status === 'onboarding') {
    return <PreparationOnboarding onComplete={handleOnboardingComplete} />;
  }

  // ---- HUB VIEW ----
  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-12 w-full">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl mb-2">
          <BrainCircuit className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">
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
          return (
            <Link
              key={track.id}
              to={track.path}
              className={`group relative flex flex-col rounded-3xl p-8 hover:-translate-y-2 transition-all duration-300 hover:shadow-xl overflow-hidden border ${
                isRecommended
                  ? 'border-blue-300 dark:border-blue-700 shadow-lg shadow-blue-100 dark:shadow-blue-900/20'
                  : 'border-white/50 dark:border-slate-700/50 glass-card'
              } ${isRecommended ? track.bgAccent : ''}`}
            >
              {isRecommended && (
                <div className="absolute top-4 right-4 flex items-center gap-1 bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                  <Star className="w-3 h-3" /> Your Track
                </div>
              )}

              {/* Background gradient blur */}
              <div className={`absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-gradient-to-br ${track.color} opacity-10 blur-2xl group-hover:opacity-20 transition-opacity`} />

              <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${track.color} text-white mb-6 shadow-lg`}>
                <Icon className="w-7 h-7" />
              </div>

              <div className="flex-1">
                <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-1 uppercase tracking-wider">
                  {track.subtitle}
                </p>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">{track.title}</h2>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-8">{track.description}</p>
              </div>

              <div className="flex items-center text-sm font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mt-auto">
                {isRecommended ? 'Continue Track' : 'Start Track'}
                <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          );
        })}
      </div>

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
          className="text-sm text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
        >
          Not sure which track? Retake the questionnaire →
        </button>
      </div>
    </div>
  );
}
