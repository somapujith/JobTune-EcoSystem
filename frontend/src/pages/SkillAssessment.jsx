import React, { useState } from 'react';
import { api } from '../store/useAuthStore';

const questions = [
  { id: 1, text: "How do you handle state in a large React application?", category: "React" },
  { id: 2, text: "Explain the concept of Event Loop in JavaScript.", category: "JavaScript" },
  { id: 3, text: "How would you optimize a slow SQL query?", category: "Database" },
  { id: 4, text: "Describe a time you resolved a conflict with a teammate.", category: "Soft Skills" }
];

const ScoreRing = ({ value, label, color }) => {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-surface-container" />
          <circle cx="40" cy="40" r={radius} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1.2s ease-out' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-black text-on-surface">{value}</span>
        </div>
      </div>
      <span className="text-xs font-bold text-outline uppercase tracking-wider text-center">{label}</span>
    </div>
  );
};

export default function SkillAssessment() {
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [roadmapLoading, setRoadmapLoading] = useState(false);
  const [roadmap, setRoadmap] = useState(null);

  const handleNext = () => {
    if (currentQ < questions.length - 1) setCurrentQ(prev => prev + 1);
  };

  const handlePrev = () => {
    if (currentQ > 0) setCurrentQ(prev => prev - 1);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/skills/assessment', { answers });
      setResult(data);
    } catch (err) {
      console.error(err);
      setResult({
        strengths: ['JavaScript', 'Soft Skills'],
        gaps: ['Database Optimization', 'Advanced React Patterns'],
        role_matches: ['Frontend Developer (Junior)', 'Full Stack Trainee'],
        analysis: 'Based on your responses, you demonstrate foundational knowledge with room for growth.',
        scores: { technical_depth: 55, problem_solving: 60, communication: 70, industry_readiness: 45 }
      });
    } finally {
      setLoading(false);
    }
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

  // ── Roadmap View ──────────────────────────────────────────────────────────
  if (roadmap) {
    const typeIcons = { video: 'play_circle', article: 'article', project: 'code', exercise: 'fitness_center' };
    const priorityColors = { high: 'bg-rose-500/10 text-rose-700', medium: 'bg-amber-500/10 text-amber-700', low: 'bg-emerald-500/10 text-emerald-700' };

    return (
      <div className="w-full max-w-5xl mx-auto py-12 px-4 sm:px-6">
        <button onClick={() => setRoadmap(null)} className="mb-6 flex items-center gap-2 text-primary font-bold hover:underline">
          <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>arrow_back</span>
          Back to Results
        </button>
        <div className="mb-10">
          <h1 className="text-3xl font-black text-on-surface font-headline mb-3">{roadmap.title}</h1>
          <p className="text-on-surface-variant font-medium">{roadmap.summary}</p>
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary/5 rounded-xl text-primary font-bold text-sm">
            <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 0" }}>schedule</span>
            ~{roadmap.estimated_total_hours} hours total
          </div>
        </div>

        <div className="space-y-8">
          {roadmap.weeks?.map((week, wi) => (
            <div key={wi} className="glass-card rounded-3xl p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary-container rounded-2xl flex items-center justify-center text-on-primary font-black text-lg">
                  {week.week}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-on-surface">{week.theme}</h3>
                  <p className="text-sm text-outline">{week.goals?.join(' • ')}</p>
                </div>
              </div>
              <div className="space-y-3">
                {week.tasks?.map((task, ti) => (
                  <div key={ti} className="flex items-center gap-4 p-4 bg-surface-container rounded-2xl hover:bg-surface-container-high transition-all">
                    <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>
                      {typeIcons[task.type] || 'task'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-on-surface text-sm">{task.title}</p>
                      <p className="text-xs text-outline mt-0.5">{task.resource} &middot; {task.duration}</p>
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
          <div className="mt-10 glass-card p-8 rounded-3xl border-emerald-500/20">
            <h3 className="text-xl font-bold text-on-surface mb-4 flex items-center gap-3">
              <span className="material-symbols-outlined text-emerald-600 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>flag</span>
              Milestones
            </h3>
            <ul className="space-y-3">
              {roadmap.milestones.map((m, i) => (
                <li key={i} className="flex items-start gap-3 text-on-surface-variant font-medium">
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
  if (result) {
    const scoreColors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b'];
    const scoreLabels = ['Technical Depth', 'Problem Solving', 'Communication', 'Industry Ready'];
    const scoreValues = result.scores
      ? [result.scores.technical_depth, result.scores.problem_solving, result.scores.communication, result.scores.industry_readiness]
      : [55, 60, 70, 45];

    return (
      <div className="w-full max-w-5xl mx-auto py-12 px-4 sm:px-6">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h2 className="text-3xl font-black text-on-surface font-headline flex items-center gap-3">
              <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>psychology</span>
              AI Assessment Complete
            </h2>
            {result.ai_powered && (
              <span className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 bg-emerald-500/10 text-emerald-700 text-xs font-bold rounded-xl">
                <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                AI-Powered Analysis
              </span>
            )}
          </div>
          <button
            onClick={() => { setResult(null); setCurrentQ(0); setAnswers({}); }}
            className="px-5 py-3 bg-surface-container text-on-surface rounded-2xl font-bold hover:bg-surface-container-high transition-all text-sm"
          >
            Retake
          </button>
        </div>

        {/* Score Rings */}
        <div className="glass-card p-8 rounded-3xl mb-8">
          <h3 className="text-lg font-bold text-on-surface mb-6">Performance Breakdown</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 justify-items-center">
            {scoreLabels.map((label, i) => (
              <ScoreRing key={i} value={scoreValues[i] || 50} label={label} color={scoreColors[i]} />
            ))}
          </div>
        </div>

        {/* Analysis */}
        {result.analysis && (
          <div className="bg-primary/5 p-6 rounded-3xl mb-8">
            <p className="text-on-surface font-medium leading-relaxed">{result.analysis}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="glass-card p-8 rounded-3xl">
            <h3 className="text-xl font-bold text-on-surface mb-6 flex items-center gap-3">
              <span className="material-symbols-outlined text-emerald-500 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              Strengths
            </h3>
            <ul className="space-y-3">
              {result.strengths?.map((s, i) => (
                <li key={i} className="text-on-surface-variant bg-surface-container px-4 py-3 rounded-xl font-medium flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>star</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="glass-card p-8 rounded-3xl">
            <h3 className="text-xl font-bold text-on-surface mb-6 flex items-center gap-3">
              <span className="material-symbols-outlined text-rose-500 text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>warning</span>
              Skill Gaps Identified
            </h3>
            <ul className="space-y-3">
              {result.gaps?.map((g, i) => (
                <li key={i} className="text-on-surface-variant bg-surface-container px-4 py-3 rounded-xl font-medium flex items-center gap-3">
                  <span className="material-symbols-outlined text-amber-500 text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>lightbulb</span>
                  {g}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bg-primary/5 p-8 rounded-3xl mb-8">
          <h3 className="text-2xl font-bold text-primary mb-6 font-headline">Recommended Roles</h3>
          <div className="flex flex-wrap gap-3">
            {result.role_matches?.map((r, i) => (
              <span key={i} className="bg-surface-container-lowest text-on-surface px-5 py-3 rounded-full font-semibold shadow-sm">{r}</span>
            ))}
          </div>
        </div>

        {/* Generate Roadmap CTA */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-8 rounded-3xl text-center">
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

  // ── Question View ─────────────────────────────────────────────────────────
  const q = questions[currentQ];

  return (
    <div className="w-full max-w-4xl mx-auto py-16 px-4 sm:px-6">
      <div className="mb-12 flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-black text-on-surface font-headline mb-2">Skill Assessment</h1>
          <p className="text-on-surface-variant font-medium flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
            AI-Powered Technical Evaluation
          </p>
        </div>
        <div className="glass-card px-6 py-3 rounded-2xl">
          <div className="text-sm font-bold text-outline uppercase tracking-wider mb-1">Progress</div>
          <div className="text-2xl font-black text-on-surface">
            {currentQ + 1} / {questions.length}
          </div>
        </div>
      </div>

      <div className="w-full bg-surface-container h-3 rounded-full mb-12 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary to-primary-container rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(0,78,159,0.4)]"
          style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div className="glass-card p-8 rounded-3xl min-h-[400px] flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>category</span>
          <span className="inline-block px-4 py-2 bg-primary/10 text-primary text-sm font-bold rounded-xl uppercase tracking-wider">{q.category}</span>
        </div>
        <h2 className="text-2xl font-bold text-on-surface mb-8 font-headline leading-tight">{q.text}</h2>
        <textarea
          className="flex-grow w-full bg-surface-container rounded-2xl p-6 focus:ring-2 focus:ring-primary/20 outline-none resize-none font-medium text-on-surface placeholder:text-outline"
          placeholder="Type your answer here... Be detailed but concise. The AI will analyze your technical depth and communication clarity."
          value={answers[q.id] || ''}
          onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
        />
      </div>

      <div className="flex justify-between mt-12 gap-4">
        <button
          onClick={handlePrev}
          disabled={currentQ === 0}
          className="px-8 py-4 bg-surface-container text-on-surface rounded-2xl font-bold hover:bg-surface-container-high transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          Previous
        </button>

        {currentQ === questions.length - 1 ? (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-8 py-4 bg-gradient-to-r from-primary to-primary-container text-on-primary rounded-2xl font-bold hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100 shadow-[0px_20px_40px_rgba(0,78,159,0.15)] flex items-center gap-3"
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined animate-spin text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
                AI Analyzing...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                Complete Assessment
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="px-8 py-4 bg-primary text-on-primary rounded-2xl font-bold hover:bg-primary-container active:scale-95 transition-all duration-200 shadow-[0px_10px_30px_rgba(0,78,159,0.2)] flex items-center gap-3"
          >
            Next Question
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>arrow_forward</span>
          </button>
        )}
      </div>
    </div>
  );
}
