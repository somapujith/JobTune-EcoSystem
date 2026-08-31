import React, { useState, useEffect } from 'react';
import useSubscriptionStore from '../store/useSubscriptionStore';
import { ArrowRight, CheckCircle2, MessageCircle } from 'lucide-react';

const QUESTIONS = [
  {
    id: 'career-goal',
    question: 'What\'s your primary career goal?',
    type: 'single',
    options: [
      { value: 'service-role', label: '🔧 Service & Support Roles', desc: 'Customer success, technical support, entry-level' },
      { value: 'skill-development', label: '📚 Improve My Skills', desc: 'Build expertise, get better at current role' },
      { value: 'faang-or-top-company', label: '🚀 Land at Top Company', desc: 'FAANG, unicorn, or premium tier company' }
    ]
  },
  {
    id: 'experience',
    question: 'What\'s your experience level?',
    type: 'single',
    options: [
      { value: 'beginner', label: '🌱 Beginner', desc: '0-1 year or career switcher' },
      { value: 'intermediate', label: '📈 Intermediate', desc: '1-3 years in industry' },
      { value: 'advanced', label: '⭐ Advanced', desc: '3+ years, looking to level up' }
    ]
  },
  {
    id: 'pain-points',
    question: 'What challenges are you facing? (Select all that apply)',
    type: 'multiple',
    options: [
      { value: 'resume-portfolio', label: '📄 Resume & Portfolio', desc: 'Need help optimizing resume or GitHub' },
      { value: 'interviews', label: '🎤 Interview Prep', desc: 'Worried about technical or behavioral interviews' },
      { value: 'job-search', label: '🔍 Job Search', desc: 'Finding right opportunities, applying effectively' },
      { value: 'skill-gaps', label: '🛠️ Skill Gaps', desc: 'Missing key technical skills' },
      { value: 'networking', label: '🤝 Networking', desc: 'Building professional network, getting referrals' },
      { value: 'project-building', label: '⚙️ Project Building', desc: 'Need ideas for portfolio projects' }
    ]
  },
  {
    id: 'field-of-interest',
    question: 'Which field are you focused on?',
    type: 'single',
    options: [
      { value: 'frontend', label: '🎨 Frontend', desc: 'React, UI/UX, web interfaces' },
      { value: 'backend', label: '⚙️ Backend', desc: 'APIs, servers, databases' },
      { value: 'fullstack', label: '🧩 Full Stack', desc: 'Both frontend and backend' },
      { value: 'data-ml', label: '📊 Data & ML', desc: 'Data science, machine learning, analytics' },
      { value: 'devops', label: '☁️ DevOps', desc: 'Infrastructure, CI/CD, cloud' },
      { value: 'mobile', label: '📱 Mobile', desc: 'iOS, Android, cross-platform apps' }
    ]
  }
];

export default function OnboardingQuestionnaire({ onComplete }) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({
    'career-goal': null,
    'experience': null,
    'pain-points': [],
    'field-of-interest': null
  });
  const { getRecommendation, isLoading } = useSubscriptionStore();

  const currentQuestion = QUESTIONS?.[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === (QUESTIONS?.length || 0) - 1;
  const answeredAll = answers['career-goal'] && answers['experience'] && answers['pain-points']?.length > 0 && answers['field-of-interest'];

  if (!currentQuestion) {
    return <div className="text-center py-12">Loading questions...</div>;
  }

  const handleAnswer = (value) => {
    if (currentQuestion.type === 'single') {
      setAnswers(prev => ({ ...prev, [currentQuestion.id]: value }));
      if (!isLastQuestion) {
        setTimeout(() => setCurrentQuestionIndex(prev => prev + 1), 300);
      }
    } else {
      setAnswers(prev => ({
        ...prev,
        'pain-points': prev['pain-points'].includes(value)
          ? prev['pain-points'].filter(v => v !== value)
          : [...prev['pain-points'], value]
      }));
    }
  };

  const handleSubmit = async () => {
    if (!answers['career-goal'] || !answers['experience'] || answers['pain-points'].length === 0 || !answers['field-of-interest']) {
      alert('Please answer all questions before continuing');
      return;
    }

    try {
      const result = await getRecommendation(
        answers['career-goal'],
        answers['experience'],
        answers['pain-points'],
        answers['field-of-interest']
      );

      if (result) {
        onComplete();
      } else {
        alert('Failed to get recommendation. Please try again.');
      }
    } catch (err) {
      console.error('Failed to get recommendation:', err);
      alert('Error: ' + (err.message || 'Failed to get recommendation'));
    }
  };

  return (
    <div className="w-full h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <MessageCircle className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            <h1 className="text-4xl font-black text-slate-900 dark:text-white">Let's Get Started</h1>
          </div>
          <p className="text-lg text-slate-600 dark:text-slate-400">Answer a few questions to find your perfect plan</p>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex gap-2">
            {QUESTIONS.map((_, idx) => (
              <div
                key={idx}
                className={`h-2 flex-1 rounded-full transition-all ${
                  idx < currentQuestionIndex ? 'bg-green-500' :
                  idx === currentQuestionIndex ? 'bg-blue-600' :
                  'bg-slate-300 dark:bg-slate-600'
                }`}
              />
            ))}
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">Question {currentQuestionIndex + 1} of {QUESTIONS.length}</p>
        </div>

        {/* Question */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 mb-8 shadow-lg">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">{currentQuestion.question}</h2>

          <div className="space-y-3">
            {currentQuestion.options.map(option => (
              <button
                key={option.value}
                onClick={() => handleAnswer(option.value)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  currentQuestion.type === 'single'
                    ? answers[currentQuestion.id] === option.value
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30'
                      : 'border-slate-200 dark:border-slate-600 hover:border-blue-400'
                    : answers['pain-points'].includes(option.value)
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30'
                      : 'border-slate-200 dark:border-slate-600 hover:border-blue-400'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-5 h-5 rounded border-2 mt-1 flex items-center justify-center flex-shrink-0 ${
                    (currentQuestion.type === 'single' ? answers[currentQuestion.id] === option.value : answers['pain-points'].includes(option.value))
                      ? 'bg-blue-600 border-blue-600'
                      : 'border-slate-300 dark:border-slate-500'
                  }`}>
                    {(currentQuestion.type === 'single' ? answers[currentQuestion.id] === option.value : answers['pain-points'].includes(option.value)) && (
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">{option.label}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{option.desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex gap-4">
          {currentQuestionIndex > 0 && (
            <button
              onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
              className="flex-1 py-3 px-6 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all"
            >
              Back
            </button>
          )}

          {isLastQuestion ? (
            <button
              onClick={handleSubmit}
              disabled={!answeredAll || isLoading}
              className="flex-1 py-3 px-6 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? 'Getting Your Recommendation...' : <>Get My Plan <ArrowRight className="w-5 h-5" /></>}
            </button>
          ) : (
            <button
              onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
              disabled={!answers[currentQuestion.id] && currentQuestion.type === 'single'}
              className="flex-1 py-3 px-6 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              Next <ArrowRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
