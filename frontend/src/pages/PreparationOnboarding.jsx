import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Rocket, Target, Wrench, ArrowRight, CheckCircle2, Sparkles,
  BrainCircuit, ChevronRight, Play
} from 'lucide-react';
import { api } from '../store/useAuthStore';

const QUESTIONS = [
  {
    id: 'goal',
    question: 'What is your primary goal right now?',
    type: 'single',
    options: [
      { value: 'land-faang', label: '🚀 Land at a top company', desc: 'FAANG, unicorn, or high-growth startup' },
      { value: 'first-job', label: '🌱 Get my first tech job', desc: 'Breaking into the industry from scratch' },
      { value: 'level-up', label: '📈 Level up my career', desc: 'Grow from where I am right now' },
      { value: 'switch', label: '🔄 Switch into tech', desc: 'Transitioning from a different field' },
    ],
  },
  {
    id: 'experience',
    question: 'How much professional experience do you have?',
    type: 'single',
    options: [
      { value: 'beginner', label: '🌱 Beginner', desc: '0–1 year or no professional experience' },
      { value: 'intermediate', label: '📈 Intermediate', desc: '1–3 years in the industry' },
      { value: 'advanced', label: '⭐ Advanced', desc: '3+ years, looking to make a big leap' },
    ],
  },
  {
    id: 'challenges',
    question: 'What are your biggest challenges? (Pick all that apply)',
    type: 'multiple',
    options: [
      { value: 'resume', label: '📄 Resume & Portfolio', desc: 'Getting past ATS and standing out' },
      { value: 'interviews', label: '🎤 Interview Skills', desc: 'Technical & behavioral interviews' },
      { value: 'skills', label: '🛠️ Skill Gaps', desc: 'Missing key technical knowledge' },
      { value: 'projects', label: '⚙️ Project Building', desc: 'Need portfolio-worthy project ideas' },
      { value: 'search', label: '🔍 Job Search Strategy', desc: 'Finding the right opportunities' },
    ],
  },
];

const TRACK_RECOMMENDATIONS = {
  beginner: 'zero-to-hero',
  intermediate: 'learn-and-build',
  advanced: 'tune-and-polish',
};

const TRACKS = {
  'zero-to-hero': {
    id: 'zero-to-hero',
    title: 'Zero to Hero',
    subtitle: 'Your complete beginner-to-hired roadmap',
    description: 'Start from scratch with an AI-generated roadmap tailored to your target role. Your personal AI Tutor explains every concept along the way.',
    icon: Rocket,
    color: 'from-emerald-400 to-teal-600',
    features: ['AI-generated learning roadmap', 'Personal AI Tutor', 'Step-by-step skill tracking'],
    path: '/preparation/zero-to-hero',
  },
  'learn-and-build': {
    id: 'learn-and-build',
    title: 'Learn & Build',
    subtitle: 'Fill gaps. Build projects. Get hired.',
    description: 'Generate hyper-targeted portfolio projects based on your current skills and target role. Track every project on a visual Kanban board.',
    icon: Wrench,
    color: 'from-orange-400 to-rose-500',
    features: ['AI project suggestions', 'Blueprint generator', 'Portfolio Kanban tracker'],
    path: '/preparation/learn-and-build',
  },
  'tune-and-polish': {
    id: 'tune-and-polish',
    title: 'Tune & Polish',
    subtitle: 'Sharpen everything before the big leap',
    description: 'Generate perfect STAR interview stories, run your resume through ATS, and practice targeted mock interviews.',
    icon: Target,
    color: 'from-blue-500 to-indigo-600',
    features: ['STAR story generator', 'ATS resume analysis', 'Mock interview prep'],
    path: '/preparation/tune-and-polish',
  },
};

const STEPS = { QUESTIONS: 'questions', REVEAL: 'reveal', READY: 'ready' };

export default function PreparationOnboarding({ onComplete }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(STEPS.QUESTIONS);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState({ goal: null, experience: null, challenges: [] });
  const [isSaving, setIsSaving] = useState(false);
  const [recommended, setRecommended] = useState(null);

  const currentQ = QUESTIONS[qIndex];
  const isLast = qIndex === QUESTIONS.length - 1;

  const handleAnswer = (value) => {
    if (currentQ.type === 'single') {
      setAnswers(prev => ({ ...prev, [currentQ.id]: value }));
      if (!isLast) setTimeout(() => setQIndex(i => i + 1), 280);
    } else {
      setAnswers(prev => ({
        ...prev,
        challenges: prev.challenges.includes(value)
          ? prev.challenges.filter(v => v !== value)
          : [...prev.challenges, value],
      }));
    }
  };

  const handleSubmit = async () => {
    const track = TRACK_RECOMMENDATIONS[answers.experience] || 'zero-to-hero';
    setRecommended(track);

    setIsSaving(true);
    try {
      await api.patch('/progress/preferences', {
        data: {
          prepOnboardingDone: true,
          recommendedTrack: track,
          prepAnswers: answers,
        },
      });
    } catch {
      // non-fatal — still proceed
    } finally {
      setIsSaving(false);
    }
    setStep(STEPS.REVEAL);
  };

  const handleStartTrack = async (trackId) => {
    window.dispatchEvent(new Event('prep-onboarding-complete'));
    onComplete({ recommendedTrack: trackId });
    navigate(TRACKS[trackId].path);
  };

  const handleGoToDashboard = () => {
    window.dispatchEvent(new Event('prep-onboarding-complete'));
    onComplete({ recommendedTrack: recommended });
    navigate('/preparation');
  };

  // ---- STEP: QUESTIONS ----
  if (step === STEPS.QUESTIONS) {
    const isAnswered = currentQ.type === 'single'
      ? !!answers[currentQ.id]
      : answers.challenges.length > 0;

    return (
      <div className="w-full min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white mb-5 shadow-lg shadow-blue-200">
              <BrainCircuit className="w-7 h-7" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white">
              Let's find your path
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2">
              3 quick questions to recommend the best preparation track for you
            </p>
          </div>

          {/* Progress dots */}
          <div className="flex gap-2 mb-8 justify-center">
            {QUESTIONS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i < qIndex ? 'w-8 bg-blue-500' :
                  i === qIndex ? 'w-12 bg-blue-600' :
                  'w-8 bg-slate-200 dark:bg-slate-700'
                }`}
              />
            ))}
          </div>

          {/* Question card */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl shadow-slate-200/60 dark:shadow-slate-900/60 p-8 mb-5">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-500 mb-3">
              Question {qIndex + 1} of {QUESTIONS.length}
            </p>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
              {currentQ.question}
            </h2>
            <div className="space-y-3">
              {currentQ.options.map(opt => {
                const selected = currentQ.type === 'single'
                  ? answers[currentQ.id] === opt.value
                  : answers.challenges.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleAnswer(opt.value)}
                    className={`w-full text-left p-4 rounded-2xl border-2 transition-all duration-150 flex items-start gap-3 group ${
                      selected
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                        : 'border-slate-100 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
                    }`}
                  >
                    <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      selected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-slate-500'
                    }`}>
                      {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <div>
                      <p className={`font-semibold text-sm ${selected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-800 dark:text-slate-200'}`}>
                        {opt.label}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{opt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nav buttons */}
          <div className="flex gap-3">
            {qIndex > 0 && (
              <button
                onClick={() => setQIndex(i => i - 1)}
                className="px-5 py-3 rounded-xl font-semibold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition-colors"
              >
                Back
              </button>
            )}
            {isLast ? (
              <button
                onClick={handleSubmit}
                disabled={!isAnswered || isSaving}
                className="flex-1 py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"
              >
                {isSaving ? 'Saving…' : <>Find My Track <ArrowRight className="w-5 h-5" /></>}
              </button>
            ) : (
              <button
                onClick={() => setQIndex(i => i + 1)}
                disabled={!isAnswered}
                className="flex-1 py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"
              >
                Next <ArrowRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- STEP: REVEAL (recommended track + all tracks) ----
  if (step === STEPS.REVEAL) {
    const rec = TRACKS[recommended];
    const RecIcon = rec.icon;
    const others = Object.values(TRACKS).filter(t => t.id !== recommended);

    return (
      <div className="w-full min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 py-12 px-6 flex items-start justify-center">
        <div className="w-full max-w-3xl">
          {/* Hero reveal */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-sm font-bold px-4 py-1.5 rounded-full mb-5">
              <Sparkles className="w-4 h-4" /> Your personalized track is ready
            </div>
            <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-3">
              We recommend <span className="text-blue-600">{rec.title}</span>
            </h1>
            <p className="text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
              Based on your answers, this track is the perfect fit for where you are right now.
            </p>
          </div>

          {/* Recommended track card — prominent */}
          <div className={`relative rounded-3xl p-8 bg-gradient-to-br ${rec.color} text-white shadow-2xl mb-5 overflow-hidden`}>
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/10 -mr-16 -mt-16 blur-2xl" />
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-5">
                <div className="p-3 bg-white/20 rounded-2xl">
                  <RecIcon className="w-8 h-8" />
                </div>
                <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">⭐ Recommended</span>
              </div>
              <h2 className="text-3xl font-black mb-1">{rec.title}</h2>
              <p className="text-white/80 text-sm font-medium mb-4">{rec.subtitle}</p>
              <p className="text-white/90 mb-6 leading-relaxed">{rec.description}</p>
              <div className="space-y-2 mb-8">
                {rec.features.map(f => (
                  <div key={f} className="flex items-center gap-2 text-sm text-white/90">
                    <CheckCircle2 className="w-4 h-4 text-white flex-shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
              <button
                onClick={() => handleStartTrack(rec.id)}
                className="flex items-center gap-2 bg-white text-slate-900 px-6 py-3 rounded-xl font-bold hover:bg-white/90 transition-all shadow-lg"
              >
                <Play className="w-5 h-5" /> Start {rec.title}
              </button>
            </div>
          </div>

          {/* Other tracks — smaller */}
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Or choose a different track</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {others.map(track => {
              const Icon = track.icon;
              return (
                <button
                  key={track.id}
                  onClick={() => handleStartTrack(track.id)}
                  className="text-left bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-5 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md transition-all group"
                >
                  <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${track.color} text-white mb-3`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <p className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-blue-600 transition-colors">
                    {track.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{track.subtitle}</p>
                  <div className="flex items-center gap-1 text-xs text-blue-600 mt-3 font-semibold">
                    Choose this track <ChevronRight className="w-3 h-3" />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Skip to hub */}
          <div className="text-center">
            <button
              onClick={handleGoToDashboard}
              className="text-sm text-slate-400 hover:text-blue-600 transition-colors font-medium"
            >
              Go to Preparation Dashboard instead →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
