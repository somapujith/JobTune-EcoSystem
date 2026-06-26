import React, { useState, useEffect } from 'react';
import { api } from '../store/useAuthStore';
import { useActivityTracker } from '../hooks/useActivityTracker';
import { useNavigate } from 'react-router-dom';

// Fallback questions (the original 4) mapped to new format
const FALLBACK_QUESTIONS = [
  { id: 'f1', text: "How do you handle state in a large React application?", category: "React", difficulty: "medium" },
  { id: 'f2', text: "Explain the concept of Event Loop in JavaScript.", category: "JavaScript", difficulty: "medium" },
  { id: 'f3', text: "How would you optimize a slow SQL query?", category: "Database", difficulty: "medium" },
  { id: 'f4', text: "Describe a time you resolved a conflict with a teammate.", category: "Soft Skills", difficulty: "easy" }
];

const DIFFICULTY_MAP = {
  beginner: { value: 'easy', label: 'Beginner', icon: 'school', color: 'emerald', description: 'Fundamental concepts, basic syntax, and introductory topics' },
  intermediate: { value: 'medium', label: 'Intermediate', icon: 'trending_up', color: 'amber', description: 'Applied knowledge, design patterns, and real-world scenarios' },
  advanced: { value: 'hard', label: 'Advanced', icon: 'rocket_launch', color: 'rose', description: 'System design, optimization, and expert-level concepts' },
};

const DIFFICULTY_BADGE_COLORS = {
  easy: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  hard: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
};

const ScoreRing = ({ value, label, color, delta }) => {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-slate-200 dark:text-slate-700" />
          <circle cx="40" cy="40" r={radius} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1.2s ease-out' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-extrabold text-slate-900 dark:text-white">{value}</span>
        </div>
      </div>
      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">{label}</span>
      {delta !== undefined && delta !== null && (
        <span className={`text-xs font-bold ${delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : delta < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
          {delta > 0 ? `+${delta}` : delta === 0 ? '--' : delta}
        </span>
      )}
    </div>
  );
};

export default function SkillAssessment() {
  useActivityTracker('Skill Assessment');
  const navigate = useNavigate();

  const [step, setStep] = useState('setup'); // setup | assessment | analyzing | results
  const [difficulty, setDifficulty] = useState('medium');
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [roadmap, setRoadmap] = useState(null);
  const [roadmapLoading, setRoadmapLoading] = useState(false);

  // Fetch history on mount
  useEffect(() => {
    api.get('/skills/history').then(({ data }) => setHistory(data.history || [])).catch(() => {});
  }, []);

  // Start assessment: fetch questions from API
  const startAssessment = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/skills/questions?difficulty=${difficulty}&count=8`);
      setQuestions(data.questions);
      setStep('assessment');
    } catch {
      // Fallback to hardcoded questions
      setQuestions(FALLBACK_QUESTIONS);
      setStep('assessment');
    } finally {
      setLoading(false);
    }
  };

  // Submit all answers
  const submitAssessment = async () => {
    setStep('analyzing');
    const answerArray = questions.map(q => ({
      questionId: q.id,
      questionText: q.text,
      answer: answers[q.id] || '',
      category: q.category,
      difficulty: q.difficulty,
    }));

    try {
      const { data } = await api.post('/skills/assessment', { answers: answerArray });
      setResult(data);
      setStep('results');
      // Refresh history
      api.get('/skills/history').then(({ data: d }) => setHistory(d.history || [])).catch(() => {});
    } catch {
      setResult({
        strengths: ['JavaScript', 'Soft Skills'],
        gaps: ['Database Optimization', 'Advanced React Patterns'],
        role_matches: ['Frontend Developer (Junior)', 'Full Stack Trainee'],
        analysis: 'Based on your responses, you demonstrate foundational knowledge with room for growth.',
        scores: { technical_depth: 55, problem_solving: 60, communication: 70, industry_readiness: 45 },
        recommendations: [],
      });
      setStep('results');
    }
  };

  const resetAssessment = () => {
    setStep('setup');
    setQuestions([]);
    setCurrentQ(0);
    setAnswers({});
    setResult(null);
    setRoadmap(null);
  };

  const generateRoadmap = async () => {
    if (!result?.gaps) return;
    setRoadmapLoading(true);
    try {
      const { data } = await api.post('/learning/generate-roadmap', {
        gaps: result.gaps,
        targetRole: result.role_matches?.[0] || 'Junior Developer'
      });
      setRoadmap(data.data.roadmap);
    } catch (err) {
      console.error('Roadmap error:', err);
    } finally {
      setRoadmapLoading(false);
    }
  };

  // Compute deltas from previous assessment
  const getScoreDeltas = () => {
    if (!result?.scores || history.length < 2) return null;
    // history[0] is the current one (just saved), history[1] is the previous
    const prev = history[1]?.scores;
    if (!prev) return null;
    return {
      technical_depth: (result.scores.technical_depth || 0) - (prev.technical_depth || 0),
      problem_solving: (result.scores.problem_solving || 0) - (prev.problem_solving || 0),
      communication: (result.scores.communication || 0) - (prev.communication || 0),
      industry_readiness: (result.scores.industry_readiness || 0) - (prev.industry_readiness || 0),
    };
  };

  // Determine action plan links based on gaps
  const getActionLinks = () => {
    if (!result?.gaps) return [];
    const gapsText = result.gaps.join(' ').toLowerCase();
    const links = [];
    if (gapsText.includes('coding') || gapsText.includes('algorithm') || gapsText.includes('data structure') || gapsText.includes('function')) {
      links.push({ label: 'Practice Coding Problems', path: '/coding-practice', icon: 'code' });
    }
    if (gapsText.includes('system design') || gapsText.includes('architecture') || gapsText.includes('distributed') || gapsText.includes('microservice')) {
      links.push({ label: 'Learn with AI Tutor', path: '/ai-tutor', icon: 'school' });
    }
    if (gapsText.includes('communication') || gapsText.includes('stakeholder') || gapsText.includes('articulation') || gapsText.includes('soft skill')) {
      links.push({ label: 'Improve Communication', path: '/communication-skills', icon: 'record_voice_over' });
    }
    if (gapsText.includes('database') || gapsText.includes('sql') || gapsText.includes('query')) {
      links.push({ label: 'Study Database Concepts', path: '/ai-tutor', icon: 'storage' });
    }
    if (gapsText.includes('testing') || gapsText.includes('tdd') || gapsText.includes('ci/cd') || gapsText.includes('devops')) {
      links.push({ label: 'Explore DevOps & Testing', path: '/ai-tutor', icon: 'bug_report' });
    }
    // Always offer the tutor as a catch-all if no specific links
    if (links.length === 0) {
      links.push({ label: 'Study with AI Tutor', path: '/ai-tutor', icon: 'school' });
    }
    return links;
  };

  const answeredCount = questions.filter(q => (answers[q.id] || '').trim().length > 0).length;
  const currentAnswer = answers[questions[currentQ]?.id] || '';

  // ── Roadmap View ──────────────────────────────────────────────────────────
  if (roadmap) {
    const typeIcons = { video: 'play_circle', article: 'article', project: 'code', exercise: 'fitness_center' };
    const priorityColors = { high: 'bg-rose-500/10 text-rose-700 dark:text-rose-400', medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400', low: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' };

    return (
      <div className="page-container">
        <button onClick={() => setRoadmap(null)} className="mb-6 flex items-center gap-2 text-primary font-bold hover:underline">
          <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>arrow_back</span>
          Back to Results
        </button>
        <div className="mb-10">
          <h1 className="page-title">{roadmap.title}</h1>
          <p className="page-subtitle">{roadmap.summary}</p>
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary/5 dark:bg-primary/10 rounded-xl text-primary font-bold text-sm">
            <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 0" }}>schedule</span>
            ~{roadmap.estimated_total_hours} hours total
          </div>
        </div>

        <div className="space-y-6">
          {roadmap.weeks?.map((week, wi) => (
            <div key={wi} className="card rounded-2xl p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary-container rounded-2xl flex items-center justify-center text-on-primary font-extrabold text-lg">
                  {week.week}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{week.theme}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{week.goals?.join(' * ')}</p>
                </div>
              </div>
              <div className="space-y-3">
                {week.tasks?.map((task, ti) => (
                  <div key={ti} className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-all">
                    <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>
                      {typeIcons[task.type] || 'task'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white text-sm">{task.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{task.resource} &middot; {task.duration}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-xl text-xs font-bold uppercase ${priorityColors[task.priority] || ''}`}>
                      {task.priority}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {roadmap.milestones && (
          <div className="mt-10 card rounded-2xl p-8">
            <h3 className="section-title flex items-center gap-3">
              <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>flag</span>
              Milestones
            </h3>
            <ul className="space-y-3">
              {roadmap.milestones.map((m, i) => (
                <li key={i} className="flex items-start gap-3 text-slate-600 dark:text-slate-300 font-medium">
                  <span className="material-symbols-outlined text-emerald-500 text-sm mt-1" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  {m}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // ── Results View ──────────────────────────────────────────────────────────
  if (step === 'results' && result) {
    const scoreColors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b'];
    const scoreLabels = ['Technical Depth', 'Problem Solving', 'Communication', 'Industry Ready'];
    const scoreKeys = ['technical_depth', 'problem_solving', 'communication', 'industry_readiness'];
    const scoreValues = result.scores
      ? [result.scores.technical_depth, result.scores.problem_solving, result.scores.communication, result.scores.industry_readiness]
      : [55, 60, 70, 45];
    const deltas = getScoreDeltas();
    const actionLinks = getActionLinks();

    return (
      <div className="page-container">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h2 className="page-title flex items-center gap-3">
              <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>psychology</span>
              AI Assessment Complete
            </h2>
            {result.ai_powered && (
              <span className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-xl">
                <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                AI-Powered Analysis
              </span>
            )}
          </div>
          <button onClick={resetAssessment} className="btn-secondary text-sm">
            Retake Assessment
          </button>
        </div>

        {/* Score Rings */}
        <div className="card rounded-2xl p-8 mb-8">
          <h3 className="section-title">Performance Breakdown</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 justify-items-center">
            {scoreLabels.map((label, i) => (
              <ScoreRing
                key={i}
                value={scoreValues[i] || 50}
                label={label}
                color={scoreColors[i]}
                delta={deltas ? deltas[scoreKeys[i]] : null}
              />
            ))}
          </div>
          {deltas && (
            <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-4">
              Compared to your previous assessment
            </p>
          )}
        </div>

        {/* Analysis */}
        {result.analysis && (
          <div className="card rounded-2xl bg-primary/5 dark:bg-primary/10 p-6 mb-8">
            <p className="text-slate-900 dark:text-slate-100 font-medium leading-relaxed">{result.analysis}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="card rounded-2xl p-8">
            <h3 className="section-title flex items-center gap-3">
              <span className="material-symbols-outlined text-emerald-500 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              Strengths
            </h3>
            <ul className="space-y-3">
              {result.strengths?.map((s, i) => (
                <li key={i} className="text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 rounded-xl font-medium flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>star</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="card rounded-2xl p-8">
            <h3 className="section-title flex items-center gap-3">
              <span className="material-symbols-outlined text-rose-500 text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>warning</span>
              Skill Gaps Identified
            </h3>
            <ul className="space-y-3">
              {result.gaps?.map((g, i) => (
                <li key={i} className="text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 rounded-xl font-medium flex items-center gap-3">
                  <span className="material-symbols-outlined text-amber-500 text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>lightbulb</span>
                  {g}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="card rounded-2xl bg-primary/5 dark:bg-primary/10 p-8 mb-8">
          <h3 className="section-title text-primary">Recommended Roles</h3>
          <div className="flex flex-wrap gap-3">
            {result.role_matches?.map((r, i) => (
              <span key={i} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-5 py-3 rounded-full font-semibold shadow-sm">{r}</span>
            ))}
          </div>
        </div>

        {/* Action Plan */}
        <div className="card rounded-2xl p-8 mb-8">
          <h3 className="section-title flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>route</span>
            Action Plan
          </h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Based on your identified gaps, here are recommended next steps:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {actionLinks.map((link, i) => (
              <button
                key={i}
                onClick={() => navigate(link.path)}
                className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl hover:bg-primary/5 dark:hover:bg-primary/10 transition-all text-left group"
              >
                <span className="material-symbols-outlined text-primary text-xl group-hover:scale-110 transition-transform" style={{ fontVariationSettings: "'FILL' 0" }}>{link.icon}</span>
                <span className="font-bold text-slate-900 dark:text-white text-sm">{link.label}</span>
                <span className="material-symbols-outlined text-slate-400 text-sm ml-auto" style={{ fontVariationSettings: "'FILL' 0" }}>arrow_forward</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recommendations from AI */}
        {result.recommendations?.length > 0 && (
          <div className="card rounded-2xl p-8 mb-8">
            <h3 className="section-title flex items-center gap-3">
              <span className="material-symbols-outlined text-amber-500 text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>tips_and_updates</span>
              Personalized Recommendations
            </h3>
            <div className="space-y-4">
              {result.recommendations.map((rec, i) => (
                <div key={i} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-bold text-slate-900 dark:text-white text-sm">{rec.skill}</span>
                    {rec.timeframe && (
                      <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">{rec.timeframe}</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{rec.action}</p>
                  {rec.resource && <p className="text-xs text-primary mt-1 font-medium">{rec.resource}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Generate Roadmap CTA */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-8 rounded-2xl text-center">
          <h3 className="text-2xl font-bold text-white mb-3 font-headline">Bridge Your Gaps in 4 Weeks</h3>
          <p className="text-indigo-100 mb-6 font-medium">AI will generate a personalized learning roadmap based on your skill gaps.</p>
          <button
            onClick={generateRoadmap}
            disabled={roadmapLoading}
            className="px-8 py-4 bg-white text-indigo-700 font-bold rounded-2xl hover:bg-indigo-50 active:scale-95 transition-all shadow-lg flex items-center gap-3 mx-auto disabled:opacity-60"
          >
            {roadmapLoading ? (
              <>
                <span className="material-symbols-outlined animate-spin text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
                Generating...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                Generate AI Learning Roadmap
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Analyzing View ────────────────────────────────────────────────────────
  if (step === 'analyzing') {
    return (
      <div className="page-container flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 relative">
            <div className="absolute inset-0 rounded-full border-4 border-slate-200 dark:border-slate-700" />
            <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3 font-headline">Analyzing Your Responses</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium max-w-md mx-auto">
            Our AI is evaluating your technical depth, problem-solving ability, communication clarity, and industry readiness...
          </p>
          <div className="mt-8 flex justify-center gap-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2.5 h-2.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Assessment View ───────────────────────────────────────────────────────
  if (step === 'assessment' && questions.length > 0) {
    const q = questions[currentQ];
    const isLastQuestion = currentQ === questions.length - 1;

    return (
      <div className="page-container">
        {/* Header with progress */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="page-title">Skill Assessment</h1>
            <p className="page-subtitle flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
              AI-Powered Technical Evaluation
            </p>
          </div>
          <div className="card px-6 py-3 rounded-2xl text-center">
            <div className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Progress</div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {currentQ + 1} / {questions.length}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {answeredCount} answered
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-200 dark:bg-slate-700 h-3 rounded-full mb-8 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-primary-container rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(0,78,159,0.4)]"
            style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }}
          />
        </div>

        {/* Question dots */}
        <div className="flex justify-center gap-2 mb-8">
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentQ(i)}
              className={`w-3 h-3 rounded-full transition-all ${
                i === currentQ
                  ? 'bg-primary scale-125'
                  : answers[questions[i]?.id]
                    ? 'bg-emerald-500'
                    : 'bg-slate-300 dark:bg-slate-600'
              }`}
              title={`Question ${i + 1}`}
            />
          ))}
        </div>

        {/* Question card */}
        <div className="card rounded-2xl p-8 min-h-[400px] flex flex-col">
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>category</span>
            <span className="inline-block px-4 py-2 bg-primary/10 dark:bg-primary/20 text-primary text-sm font-bold rounded-xl uppercase tracking-wider">{q.category}</span>
            <span className={`inline-block px-3 py-1.5 text-xs font-bold rounded-xl uppercase tracking-wider ${DIFFICULTY_BADGE_COLORS[q.difficulty] || DIFFICULTY_BADGE_COLORS.medium}`}>
              {q.difficulty}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-8 font-headline leading-tight">{q.text}</h2>
          <textarea
            className="input-field flex-grow resize-none p-6"
            placeholder="Type your answer here (minimum 50 characters)... Be detailed but concise. The AI will analyze your technical depth and communication clarity."
            value={currentAnswer}
            onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
          />
          <div className="flex items-center justify-between mt-3">
            <span className={`text-xs font-medium ${currentAnswer.length >= 50 ? 'text-emerald-500' : 'text-slate-400'}`}>
              {currentAnswer.length} characters {currentAnswer.length < 50 ? `(${50 - currentAnswer.length} more recommended)` : ''}
            </span>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-8 gap-4">
          <button
            onClick={() => currentQ > 0 && setCurrentQ(prev => prev - 1)}
            disabled={currentQ === 0}
            className="btn-secondary px-8 py-4"
          >
            Previous
          </button>

          {isLastQuestion ? (
            <button
              onClick={submitAssessment}
              disabled={answeredCount === 0}
              className="btn-gradient bg-gradient-to-r from-primary to-primary-container px-8 py-4 flex items-center gap-3"
            >
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
              Complete Assessment
            </button>
          ) : (
            <button
              onClick={() => setCurrentQ(prev => prev + 1)}
              className="btn-primary px-8 py-4 flex items-center gap-3"
            >
              Next Question
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>arrow_forward</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Setup View ────────────────────────────────────────────────────────────
  return (
    <div className="page-container">
      <div className="mb-12">
        <h1 className="page-title flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>psychology</span>
          Skill Assessment
        </h1>
        <p className="page-subtitle">Evaluate your technical and behavioral skills with AI-powered analysis</p>
      </div>

      {/* Difficulty Selection */}
      <div className="mb-10">
        <h3 className="section-title">Choose Your Difficulty</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(DIFFICULTY_MAP).map(([key, d]) => {
            const isSelected = difficulty === d.value;
            const colorClasses = {
              emerald: isSelected ? 'border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10' : '',
              amber: isSelected ? 'border-amber-500 bg-amber-500/5 dark:bg-amber-500/10' : '',
              rose: isSelected ? 'border-rose-500 bg-rose-500/5 dark:bg-rose-500/10' : '',
            };
            const iconColors = {
              emerald: 'text-emerald-500',
              amber: 'text-amber-500',
              rose: 'text-rose-500',
            };

            return (
              <button
                key={key}
                onClick={() => setDifficulty(d.value)}
                className={`card rounded-2xl p-6 text-left transition-all border-2 hover:shadow-lg ${
                  isSelected
                    ? colorClasses[d.color]
                    : 'border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className={`material-symbols-outlined text-2xl ${iconColors[d.color]}`} style={{ fontVariationSettings: "'FILL' 0" }}>{d.icon}</span>
                  <span className="text-lg font-bold text-slate-900 dark:text-white">{d.label}</span>
                  {isSelected && (
                    <span className="material-symbols-outlined text-primary text-lg ml-auto" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  )}
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{d.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Assessment Info */}
      <div className="card rounded-2xl p-8 mb-10">
        <h3 className="section-title flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>info</span>
          What to Expect
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-blue-500 text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>code</span>
            </div>
            <div>
              <p className="font-bold text-slate-900 dark:text-white text-sm">4 Technical Questions</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">JavaScript, React, databases, system design</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-purple-500 text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>groups</span>
            </div>
            <div>
              <p className="font-bold text-slate-900 dark:text-white text-sm">2 Behavioral Questions</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Teamwork, problem solving, communication</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-emerald-500 text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>terminal</span>
            </div>
            <div>
              <p className="font-bold text-slate-900 dark:text-white text-sm">2 Coding Questions</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Algorithms, data structures, practical coding</p>
            </div>
          </div>
        </div>
      </div>

      {/* Start Button */}
      <div className="text-center mb-12">
        <button
          onClick={startAssessment}
          disabled={loading}
          className="btn-gradient bg-gradient-to-r from-primary to-primary-container px-10 py-4 text-lg flex items-center gap-3 mx-auto"
        >
          {loading ? (
            <>
              <span className="material-symbols-outlined animate-spin text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
              Loading Questions...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
              Start Assessment
            </>
          )}
        </button>
      </div>

      {/* Previous Assessments */}
      {history.length > 0 && (
        <div>
          <h3 className="section-title flex items-center gap-3">
            <span className="material-symbols-outlined text-slate-400 text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>history</span>
            Previous Assessments
          </h3>
          <div className="space-y-4">
            {history.slice(0, 5).map((entry, i) => {
              const scores = entry.scores || {};
              const avg = Math.round(
                ((scores.technical_depth || 0) + (scores.problem_solving || 0) +
                 (scores.communication || 0) + (scores.industry_readiness || 0)) / 4
              );

              return (
                <div key={entry.id || i} className="card rounded-2xl p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-extrabold text-lg ${
                        avg >= 70 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                        avg >= 50 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                        'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      }`}>
                        {avg || '--'}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white text-sm">
                          Assessment {history.length - i}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown date'}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <span>Tech: {scores.technical_depth || '--'}</span>
                      <span>PS: {scores.problem_solving || '--'}</span>
                      <span>Comm: {scores.communication || '--'}</span>
                      <span>Ready: {scores.industry_readiness || '--'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
