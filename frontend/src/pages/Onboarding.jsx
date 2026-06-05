import React, { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import useAuthStore, { api } from '../store/useAuthStore';
import { ArrowRight, CheckCircle2, FileText, Linkedin, Code2, Zap } from 'lucide-react';

const ONBOARDING_STEPS = [
  {
    id: 'resume_status',
    question: 'Do you have a resume ready?',
    options: [
      { label: 'Yes, I have one', value: 'yes' },
      { label: 'No, need to build one', value: 'no' },
      { label: 'Have one but needs updating', value: 'update' },
    ],
    icon: FileText,
  },
  {
    id: 'linkedin_status',
    question: "How's your LinkedIn profile?",
    options: [
      { label: 'Profile complete and up-to-date', value: 'complete' },
      { label: 'Profile needs optimization', value: 'needs_work' },
      { label: "Don't have a profile", value: 'none' },
    ],
    icon: Linkedin,
  },
  {
    id: 'interview_prep',
    question: "How prepared are you for interviews?",
    options: [
      { label: 'Very prepared, ready to practice', value: 'ready' },
      { label: 'Could use some practice', value: 'some_prep' },
      { label: "Haven't practiced at all", value: "no_prep" },
    ],
    icon: Zap,
  },
  {
    id: 'github_status',
    question: "How visible is your GitHub presence?",
    options: [
      { label: 'Strong profile with projects', value: 'strong' },
      { label: 'Profile exists, needs polish', value: 'exists' },
      { label: "Don't have public projects", value: "none" },
    ],
    icon: Code2,
  },
];

function getRecommendations(answers) {
  const recs = [];

  if (answers.resume_status === 'no' || answers.resume_status === 'update') {
    recs.push({ path: '/resume/build', label: 'Build Resume', priority: 1 });
  } else if (answers.resume_status === 'yes') {
    recs.push({ path: '/resume', label: 'Optimize Resume', priority: 1 });
  }

  if (answers.linkedin_status === 'needs_work' || answers.linkedin_status === 'none') {
    recs.push({ path: '/linkedin', label: 'LinkedIn Optimizer', priority: 2 });
  }

  if (answers.interview_prep === 'some_prep' || answers.interview_prep === 'no_prep') {
    recs.push({ path: '/interview', label: 'Mock Interview', priority: 2 });
  }

  if (answers.github_status === 'exists' || answers.github_status === 'none') {
    recs.push({ path: '/github', label: 'GitHub Optimizer', priority: 2 });
  }

  return recs.sort((a, b) => a.priority - b.priority);
}

export default function Onboarding() {
  const { user, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [recommendations, setRecommendations] = useState([]);
  const [isCompleting, setIsCompleting] = useState(false);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const step = ONBOARDING_STEPS[currentStep];
  const allAnswered = currentStep === ONBOARDING_STEPS.length;

  const handleAnswer = (value) => {
    const newAnswers = { ...answers, [step.id]: value };
    setAnswers(newAnswers);

    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setTimeout(() => setCurrentStep(currentStep + 1), 300);
    }
  };

  const handleComplete = async () => {
    setIsCompleting(true);
    try {
      await api.post('/onboarding/complete', answers);
      const recs = getRecommendations(answers);
      setRecommendations(recs);
    } catch (err) {
      console.error('Onboarding save failed:', err);
    } finally {
      setIsCompleting(false);
    }
  };

  const handleSkipToPath = (path) => {
    navigate(path);
  };

  if (allAnswered && recommendations.length > 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center px-4">
        <div className="max-w-2xl w-full bg-white rounded-3xl shadow-2xl p-8 sm:p-12">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 mb-2">Your Personalized Path</h1>
            <p className="text-slate-600">Based on your answers, here's what we recommend:</p>
          </div>

          <div className="space-y-3 mb-8">
            {recommendations.map((rec, i) => (
              <button
                key={rec.path}
                onClick={() => handleSkipToPath(rec.path)}
                className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl hover:shadow-lg hover:border-blue-400 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-10 h-10 bg-white rounded-full font-bold text-blue-600 group-hover:bg-blue-100 transition-colors">
                    {i + 1}
                  </div>
                  <span className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">{rec.label}</span>
                </div>
                <ArrowRight className="w-5 h-5 text-blue-400 group-hover:translate-x-1 transition-transform" />
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex-1 py-3 px-4 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-colors"
            >
              Go to Dashboard
            </button>
            <button
              onClick={() => handleSkipToPath(recommendations[0].path)}
              className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              Start with Step 1 <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-2xl w-full">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex gap-2">
            {ONBOARDING_STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i < currentStep ? 'bg-emerald-500' : i === currentStep ? 'bg-blue-600' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-slate-500 font-semibold mt-2">
            Step {currentStep + 1} of {ONBOARDING_STEPS.length}
          </p>
        </div>

        {/* Question card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-12">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-100 rounded-2xl mb-6">
              <step.icon className="w-7 h-7 text-blue-600" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 mb-2">{step.question}</h1>
            <p className="text-slate-500">This helps us personalize your career path</p>
          </div>

          <div className="space-y-3 mb-8">
            {step.options.map((option) => (
              <button
                key={option.value}
                onClick={() => handleAnswer(option.value)}
                className="w-full flex items-center gap-4 p-4 text-left bg-slate-50 border border-slate-200 rounded-2xl hover:bg-blue-50 hover:border-blue-300 transition-all group cursor-pointer"
              >
                <div className="w-5 h-5 rounded-full border-2 border-slate-300 group-hover:border-blue-500 transition-colors flex items-center justify-center shrink-0">
                  <div className="w-2.5 h-2.5 bg-blue-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className="font-medium text-slate-700 group-hover:text-blue-700 transition-colors">
                  {option.label}
                </span>
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => currentStep > 0 && setCurrentStep(currentStep - 1)}
              disabled={currentStep === 0}
              className="flex-1 py-3 px-4 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Back
            </button>
            {currentStep === ONBOARDING_STEPS.length - 1 && (
              <button
                onClick={handleComplete}
                disabled={isCompleting}
                className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-75 transition-colors"
              >
                {isCompleting ? 'Saving...' : 'See My Path'}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-sm text-slate-500 mt-6">
          You can skip this and update your preferences later in your dashboard
        </p>
      </div>
    </div>
  );
}
