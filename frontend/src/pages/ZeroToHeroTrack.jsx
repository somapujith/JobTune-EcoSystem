import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../store/useAuthStore';
import { useUserProgress } from '../hooks/useUserProgress';
import { useActivityTracker } from '../hooks/useActivityTracker';

const TRACKS = [
  { id: 'frontend', label: 'Frontend Development', icon: 'web', desc: 'HTML, CSS, JavaScript, React' },
  { id: 'backend', label: 'Backend Development', icon: 'dns', desc: 'Node.js, Python, Databases, APIs' },
  { id: 'javascript', label: 'JavaScript', icon: 'code', desc: 'Deep dive into JS fundamentals' },
  { id: 'react', label: 'React', icon: 'widgets', desc: 'Components, Hooks, State Management' },
  { id: 'python', label: 'Python', icon: 'terminal', desc: 'Syntax, OOP, Data Science basics' },
  { id: 'nodejs', label: 'Node.js', icon: 'memory', desc: 'Express, APIs, Server-side JS' },
  { id: 'datastructures-and-algorithms', label: 'DSA', icon: 'account_tree', desc: 'Arrays, Trees, Graphs, DP' },
  { id: 'computer-science', label: 'Computer Science', icon: 'school', desc: 'OS, Networking, Databases' },
];

const DEFAULT_PROGRESS = {
  step: 'intro',
  track: null,
  interviewData: {},
  knowledgeCheck: {},
  modules: {},
  currentModuleId: null,
};

function Icon({ name, fill = 0, className = '' }) {
  return (
    <span className={`material-symbols-outlined ${className}`} style={{ fontVariationSettings: `'FILL' ${fill}` }}>
      {name}
    </span>
  );
}

// ─── Intro Screen ──────────────────────────────────────────────────────────

function IntroScreen({ onStart, hasProgress }) {
  return (
    <div className="text-center max-w-2xl mx-auto py-16 fade-up">
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-8 shadow-lg">
        <Icon name="rocket_launch" fill={1} className="text-white text-4xl" />
      </div>
      <h1 className="page-title mb-4">Zero to Hero</h1>
      <p className="text-lg text-slate-500 dark:text-slate-400 leading-relaxed mb-10 max-w-lg mx-auto">
        Start from scratch and master software development through structured learning modules, hands-on practice, and AI-powered assessments.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        {[
          { icon: 'school', title: 'Learn', desc: 'Structured modules with real content' },
          { icon: 'quiz', title: 'Assess', desc: 'Tests scoped to what you learned' },
          { icon: 'trending_up', title: 'Progress', desc: 'Unlock modules as you grow' },
        ].map((f, i) => (
          <div key={i} className="card p-5 text-center">
            <Icon name={f.icon} className="text-blue-500 text-2xl mb-2" />
            <p className="font-bold text-slate-900 dark:text-white text-sm">{f.title}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{f.desc}</p>
          </div>
        ))}
      </div>
      <button onClick={onStart} className="btn-primary-lg">
        {hasProgress ? 'Continue Your Journey' : 'Start Your Journey'}
        <Icon name="arrow_forward" className="text-lg" />
      </button>
    </div>
  );
}

// ─── Interview Wizard ──────────────────────────────────────────────────────

const INTERVIEW_STEPS = [
  { id: 'track', question: 'What area of development interests you most?', type: 'track-select' },
  { id: 'experience', question: 'Have you written code before?', type: 'single', options: [
    { value: 'none', label: 'No, I am completely new', icon: 'spa' },
    { value: 'some', label: 'Yes, I have some experience', icon: 'code' },
  ]},
  { id: 'skills', question: 'Which of these have you worked with?', type: 'multi-select', conditional: 'some' },
  { id: 'knowledge-check', question: 'Quick check — let us verify your knowledge', type: 'knowledge-check', conditional: 'has-skills' },
  { id: 'time', question: 'How much time can you dedicate daily?', type: 'single', options: [
    { value: '1hr', label: 'Less than 1 hour' },
    { value: '2-3hrs', label: '2-3 hours' },
    { value: '4-5hrs', label: '4-5 hours' },
    { value: '5+hrs', label: '5+ hours' },
  ]},
  { id: 'timeline', question: 'What is your preparation timeline?', type: 'single', options: [
    { value: '1month', label: '1 month' },
    { value: '3months', label: '2-3 months' },
    { value: '6months', label: '4-6 months' },
    { value: '1year', label: '6-12 months' },
  ]},
];

function InterviewWizard({ onComplete, initialData }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState(initialData || {});
  const [trackSkills, setTrackSkills] = useState([]);
  const [knowledgeQuestions, setKnowledgeQuestions] = useState(null);
  const [kcAnswers, setKcAnswers] = useState({});
  const [kcLoading, setKcLoading] = useState(false);

  const visibleSteps = INTERVIEW_STEPS.filter(step => {
    if (step.conditional === 'some') return data.experience === 'some';
    if (step.conditional === 'has-skills') return data.skills && data.skills.length > 0;
    return true;
  });

  const currentStep = visibleSteps[stepIndex];

  const loadTrackSkills = useCallback(async (trackId) => {
    try {
      const { data: trackData } = await api.get(`/learning-modules/${trackId}`);
      setTrackSkills(trackData.skills || []);
    } catch { setTrackSkills([]); }
  }, []);

  const loadKnowledgeCheck = useCallback(async (skills) => {
    setKcLoading(true);
    try {
      const { data: kcData } = await api.post('/learning-modules/knowledge-check', { skills });
      setKnowledgeQuestions(kcData.checks);
    } catch { setKnowledgeQuestions([]); }
    finally { setKcLoading(false); }
  }, []);

  const handleNext = () => {
    if (stepIndex < visibleSteps.length - 1) {
      const nextStep = visibleSteps[stepIndex + 1];
      if (nextStep?.id === 'skills' && data.track) loadTrackSkills(data.track);
      if (nextStep?.id === 'knowledge-check' && data.skills?.length > 0) loadKnowledgeCheck(data.skills);
      setStepIndex(stepIndex + 1);
    } else {
      const knowledgeCheck = {};
      if (knowledgeQuestions) {
        for (const check of knowledgeQuestions) {
          let correct = 0;
          for (const q of check.questions) {
            if (parseInt(kcAnswers[q.id]) === q.correct) correct++;
          }
          knowledgeCheck[check.skill.toLowerCase()] = correct >= 2 ? 'verified' : 'beginner';
        }
      }
      onComplete({ ...data, knowledgeCheck });
    }
  };

  const canProceed = () => {
    if (!currentStep) return false;
    if (currentStep.id === 'track') return !!data.track;
    if (currentStep.id === 'experience') return !!data.experience;
    if (currentStep.id === 'skills') return true;
    if (currentStep.id === 'knowledge-check') {
      if (!knowledgeQuestions || knowledgeQuestions.length === 0) return true;
      const totalQs = knowledgeQuestions.reduce((sum, c) => sum + c.questions.length, 0);
      return Object.keys(kcAnswers).length >= totalQs;
    }
    if (currentStep.id === 'time') return !!data.time;
    if (currentStep.id === 'timeline') return !!data.timeline;
    return true;
  };

  const progress = visibleSteps.length > 0 ? ((stepIndex + 1) / visibleSteps.length) * 100 : 0;

  return (
    <div className="max-w-2xl mx-auto py-10 fade-up">
      <div className="progress-track mb-8">
        <div className="progress-fill bg-gradient-to-r from-blue-500 to-indigo-500" style={{ width: `${progress}%` }} />
      </div>
      <div className="card p-8 rounded-2xl">
        <p className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-2">Step {stepIndex + 1} of {visibleSteps.length}</p>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">{currentStep?.question}</h2>

        {currentStep?.type === 'track-select' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TRACKS.map(t => (
              <button key={t.id} onClick={() => setData(d => ({ ...d, track: t.id }))}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${data.track === t.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${data.track === t.id ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                  <Icon name={t.icon} className="text-xl" />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-900 dark:text-white">{t.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t.desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {currentStep?.type === 'single' && (
          <div className="space-y-3">
            {currentStep.options.map(opt => (
              <button key={opt.value} onClick={() => setData(d => ({ ...d, [currentStep.id]: opt.value }))}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${data[currentStep.id] === opt.value ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}>
                {opt.icon && <Icon name={opt.icon} className={`text-xl ${data[currentStep.id] === opt.value ? 'text-blue-500' : 'text-slate-400'}`} />}
                <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">{opt.label}</span>
              </button>
            ))}
          </div>
        )}

        {currentStep?.type === 'multi-select' && (
          <div>
            <div className="flex flex-wrap gap-2">
              {(trackSkills.length > 0 ? trackSkills : ['HTML', 'CSS', 'JavaScript', 'Python', 'SQL', 'Git', 'React', 'Node.js']).map(skill => {
                const selected = (data.skills || []).includes(skill);
                return (
                  <button key={skill} onClick={() => setData(d => { const cur = d.skills || []; return { ...d, skills: selected ? cur.filter(s => s !== skill) : [...cur, skill] }; })}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${selected ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'}`}>
                    <Icon name={selected ? 'check_circle' : 'radio_button_unchecked'} fill={selected ? 1 : 0} className={`text-base ${selected ? 'text-blue-500' : 'text-slate-400'}`} />
                    {skill}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-400 mt-3">Select all that apply, or skip if none.</p>
          </div>
        )}

        {currentStep?.type === 'knowledge-check' && (
          <div className="space-y-6">
            {kcLoading && (
              <div className="flex items-center justify-center py-8 gap-3">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-slate-500 text-sm">Loading verification questions...</span>
              </div>
            )}
            {!kcLoading && knowledgeQuestions?.map((check, ci) => (
              <div key={ci} className="space-y-3">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Icon name="verified" className="text-base text-blue-500" /> {check.skill}
                </p>
                {check.questions.map((q) => (
                  <div key={q.id} className="pl-4 border-l-2 border-slate-200 dark:border-slate-700">
                    <p className="text-sm text-slate-800 dark:text-slate-200 mb-2">{q.question}</p>
                    <div className="space-y-1.5">
                      {q.options.map((opt, oi) => (
                        <label key={oi}
                          className={`flex items-start gap-2 p-2.5 rounded-lg cursor-pointer text-sm transition-colors ${parseInt(kcAnswers[q.id]) === oi ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'}`}>
                          <input type="radio" name={q.id} value={oi} checked={parseInt(kcAnswers[q.id]) === oi}
                            onChange={() => setKcAnswers(a => ({ ...a, [q.id]: oi }))} className="mt-0.5 accent-blue-500" />
                          <span className="leading-snug">{typeof opt === 'string' ? opt.substring(0, 150) : String(opt)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {!kcLoading && (!knowledgeQuestions || knowledgeQuestions.length === 0) && (
              <p className="text-sm text-slate-500 text-center py-4">No verification needed. Continue to the next step.</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
          <button onClick={() => stepIndex > 0 && setStepIndex(stepIndex - 1)} disabled={stepIndex === 0} className="btn-ghost disabled:opacity-30">
            <Icon name="arrow_back" className="text-lg" /> Back
          </button>
          <button onClick={handleNext} disabled={!canProceed()} className="btn-primary-lg disabled:opacity-40">
            {stepIndex === visibleSteps.length - 1 ? 'Generate My Plan' : 'Continue'}
            <Icon name={stepIndex === visibleSteps.length - 1 ? 'auto_awesome' : 'arrow_forward'} className="text-lg" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Flashcard Review ─────────────────────────────────────────────────────

function FlashcardReview({ cards, onClose }) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState([]);
  const [again, setAgain] = useState([]);

  if (!cards || cards.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl" onClick={e => e.stopPropagation()}>
          <Icon name="check_circle" fill={1} className="text-4xl text-emerald-500 mb-3" />
          <p className="font-bold text-slate-900 dark:text-white">No review cards yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Complete module assessments to generate flashcards from questions you missed.</p>
          <button onClick={onClose} className="btn-primary mt-4">Got it</button>
        </div>
      </div>
    );
  }

  const card = cards[idx];
  const remaining = cards.length - known.length;

  const handleKnow = () => {
    setKnown(prev => [...prev, card.id]);
    setFlipped(false);
    if (idx < cards.length - 1) setIdx(idx + 1);
  };

  const handleAgain = () => {
    setAgain(prev => [...prev, card.id]);
    setFlipped(false);
    if (idx < cards.length - 1) setIdx(idx + 1);
  };

  const isDone = idx >= cards.length - 1 && flipped;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">Flashcard Review</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{idx + 1} of {cards.length} · {known.length} known · {again.length} to retry</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <Icon name="close" className="text-lg text-slate-500" />
          </button>
        </div>

        <div className="p-6">
          <div
            className="min-h-[180px] p-5 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 cursor-pointer flex items-center justify-center text-center transition-all hover:border-blue-300 dark:hover:border-blue-700"
            onClick={() => setFlipped(!flipped)}
          >
            {!flipped ? (
              <div>
                <p className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-3">{card.topic}</p>
                <p className="text-slate-800 dark:text-slate-200 font-semibold">{card.question}</p>
                <p className="text-xs text-slate-400 mt-4">Tap to reveal answer</p>
              </div>
            ) : (
              <div>
                <p className="text-xs font-bold text-emerald-500 uppercase tracking-wider mb-3">Answer</p>
                <p className="text-slate-800 dark:text-slate-200">{card.answer}</p>
                {card.explanation && <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 italic">{card.explanation}</p>}
              </div>
            )}
          </div>

          {flipped && !isDone && (
            <div className="flex gap-3 mt-4">
              <button onClick={handleAgain} className="flex-1 py-3 rounded-xl border-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 font-bold text-sm hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                <Icon name="refresh" className="text-base mr-1" /> Again
              </button>
              <button onClick={handleKnow} className="flex-1 py-3 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 font-bold text-sm hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors">
                <Icon name="check" className="text-base mr-1" /> Know it
              </button>
            </div>
          )}

          {!flipped && (
            <div className="flex justify-center mt-4">
              <button onClick={() => setFlipped(true)} className="btn-primary">
                Show Answer <Icon name="flip" className="text-lg" />
              </button>
            </div>
          )}

          {isDone && (
            <div className="text-center mt-4">
              <p className="font-bold text-slate-900 dark:text-white mb-1">Session complete!</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{known.length} known · {again.length} still need review</p>
              <button onClick={onClose} className="btn-primary mt-3">Done</button>
            </div>
          )}
        </div>

        <div className="flex gap-1 justify-center pb-4">
          {cards.map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full transition-all ${i === idx ? 'bg-blue-500 scale-125' : known.includes(cards[i]?.id) ? 'bg-emerald-400' : again.includes(cards[i]?.id) ? 'bg-red-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Learning Plan ─────────────────────────────────────────────────────────

function LearningPlan({ modules, moduleProgress, knowledgeCheck, onStartModule }) {
  const [showFlashcards, setShowFlashcards] = useState(false);
  const completedCount = Object.values(moduleProgress || {}).filter(m => m.status === 'completed').length;
  const totalModules = modules.length;

  const flashcards = modules
    .filter(m => moduleProgress?.[m.id]?.failedQuestions?.length > 0)
    .flatMap(m => moduleProgress[m.id].failedQuestions.map(q => ({ ...q, moduleTopic: m.topic })));

  const completedWithLowScore = Object.entries(moduleProgress || {})
    .filter(([, mp]) => mp.status === 'completed' && mp.score != null && mp.score < 80)
    .length;

  const getStatus = (mod) => {
    const mp = moduleProgress?.[mod.id];
    if (mp?.status === 'completed') return 'completed';
    if (mp?.status === 'in-progress') return 'in-progress';
    const skill = mod.topic.toLowerCase();
    if (knowledgeCheck?.[skill] === 'verified') return 'verified';
    const prereqsMet = mod.prerequisites.every(p => {
      const pp = moduleProgress?.[p];
      if (pp?.status === 'completed') return true;
      const prereqMod = modules.find(m => m.id === p);
      return prereqMod && knowledgeCheck?.[prereqMod.topic?.toLowerCase()] === 'verified';
    });
    if (mod.order === 1 || prereqsMet) return 'available';
    return 'locked';
  };

  const statusConfig = {
    completed: { icon: 'check_circle', fill: 1, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', label: 'Completed', badge: 'badge-success' },
    verified: { icon: 'verified', fill: 1, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800', label: 'Verified', badge: 'badge-info' },
    'in-progress': { icon: 'play_circle', fill: 1, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', label: 'In Progress', badge: 'badge-warning' },
    available: { icon: 'lock_open', fill: 0, color: 'text-slate-500', bg: 'bg-white dark:bg-slate-900', border: 'border-slate-200 dark:border-slate-700', label: 'Available', badge: 'badge-neutral' },
    locked: { icon: 'lock', fill: 0, color: 'text-slate-300 dark:text-slate-600', bg: 'bg-slate-50 dark:bg-slate-900/40', border: 'border-slate-100 dark:border-slate-800', label: 'Locked', badge: 'badge-neutral' },
  };

  return (
    <>
    {showFlashcards && (
      <FlashcardReview cards={flashcards} onClose={() => setShowFlashcards(false)} />
    )}
    <div className="max-w-3xl mx-auto py-10 fade-up">
      <div className="text-center mb-8">
        <h2 className="page-title mb-2">Your Learning Plan</h2>
        <p className="text-slate-500 dark:text-slate-400">{completedCount}/{totalModules} modules completed</p>
        <div className="progress-track max-w-xs mx-auto mt-3">
          <div className="progress-fill bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${totalModules > 0 ? (completedCount / totalModules) * 100 : 0}%` }} />
        </div>
        {completedWithLowScore > 0 && (
          <button onClick={() => setShowFlashcards(true)} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-sm font-semibold hover:bg-amber-200 dark:hover:bg-amber-950/50 transition-colors">
            <Icon name="style" fill={1} className="text-base" />
            Review Flashcards ({completedWithLowScore} module{completedWithLowScore > 1 ? 's' : ''} below 80%)
          </button>
        )}
        {completedCount > 0 && completedWithLowScore === 0 && (
          <button onClick={() => setShowFlashcards(true)} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 text-sm font-semibold hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors">
            <Icon name="style" fill={0} className="text-base" />
            Flashcard Review
          </button>
        )}
      </div>
      <div className="space-y-3">
        {modules.map((mod) => {
          const status = getStatus(mod);
          const cfg = statusConfig[status];
          const score = moduleProgress?.[mod.id]?.score;
          const clickable = status === 'available' || status === 'in-progress';
          return (
            <div key={mod.id}
              className={`flex items-center gap-4 p-4 rounded-2xl border ${cfg.border} ${cfg.bg} transition-all ${clickable ? 'cursor-pointer hover:shadow-md' : ''} ${status === 'locked' ? 'opacity-60' : ''}`}
              onClick={() => clickable && onStartModule(mod.id)}>
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0">
                <Icon name={cfg.icon} fill={cfg.fill} className={`text-xl ${cfg.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-slate-900 dark:text-white">{mod.topic}</span>
                  <span className={`badge text-[10px] ${cfg.badge}`}>{cfg.label}</span>
                  {score != null && <span className="text-xs font-bold text-emerald-600">{score}%</span>}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {mod.subtopicCount || 0} subtopics · ~{mod.estimatedHours}h
                </p>
              </div>
              {clickable && <Icon name="arrow_forward" className="text-lg text-slate-400 shrink-0" />}
            </div>
          );
        })}
      </div>
    </div>
    </>
  );
}

// ─── Module Learning ───────────────────────────────────────────────────────

function ModuleLearning({ moduleData, completedSubtopics, onSubtopicComplete, onTakeAssessment, onBack }) {
  const [activeSubtopic, setActiveSubtopic] = useState(0);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [tutorMessages, setTutorMessages] = useState([]);
  const [tutorInput, setTutorInput] = useState('');
  const [tutorLoading, setTutorLoading] = useState(false);
  const chatEndRef = useRef(null);

  if (!moduleData) return null;
  const done = completedSubtopics || [];
  const allDone = moduleData.subtopics.every(s => done.includes(s.id));
  const currentSub = moduleData.subtopics[activeSubtopic];

  const handleAskTutor = async () => {
    if (!tutorInput.trim() || tutorLoading) return;
    const userMsg = tutorInput.trim();
    setTutorInput('');
    setTutorMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setTutorLoading(true);
    try {
      const history = tutorMessages.map(m => ({ role: m.role, content: m.content }));
      const { data } = await api.post('/ai-tutor/chat', { topic: moduleData.topic, message: userMsg, history });
      setTutorMessages(prev => [...prev, { role: 'assistant', content: data.reply || data.response || 'I could not generate a response.' }]);
    } catch {
      setTutorMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, the AI tutor is currently unavailable.' }]);
    } finally {
      setTutorLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 fade-up">
      <button onClick={onBack} className="btn-ghost mb-6"><Icon name="arrow_back" className="text-lg" /> Back to Plan</button>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0">
          {/* Module header */}
          <div className="card p-6 rounded-2xl mb-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{moduleData.topic}</h2>
              <span className="text-xs font-bold text-slate-400">{done.length}/{moduleData.subtopics.length} done</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{moduleData.description}</p>
            <div className="progress-track">
              <div className="progress-fill bg-gradient-to-r from-blue-400 to-blue-600"
                style={{ width: `${moduleData.subtopics.length > 0 ? (done.length / moduleData.subtopics.length) * 100 : 0}%` }} />
            </div>
          </div>

          {/* Subtopic tabs */}
          <div className="flex gap-1 flex-wrap mb-4">
            {moduleData.subtopics.map((sub, i) => {
              const isDone = done.includes(sub.id);
              return (
                <button key={sub.id} onClick={() => setActiveSubtopic(i)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    i === activeSubtopic ? 'bg-blue-600 text-white' :
                    isDone ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400' :
                    'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                  {isDone && <Icon name="check" fill={0} className="text-xs" />}
                  {sub.title}
                </button>
              );
            })}
          </div>

          {/* Subtopic content */}
          {currentSub && (
            <div className="card p-6 rounded-2xl">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">{currentSub.title}</h3>
              <div className="mb-6">
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap text-sm">{currentSub.description}</p>
              </div>
              {currentSub.resources?.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Learning Resources</h4>
                  <div className="space-y-2">
                    {currentSub.resources.map((r, ri) => (
                      <a key={ri} href={r.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-blue-50 dark:hover:bg-blue-950/20 border border-slate-200 dark:border-slate-700 transition-colors group">
                        <Icon name={r.type === 'video' ? 'play_circle' : r.type === 'course' ? 'school' : 'article'}
                          className="text-lg text-slate-400 group-hover:text-blue-500" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">{r.title}</p>
                          <p className="text-xs text-slate-400 capitalize">{r.type}</p>
                        </div>
                        <Icon name="open_in_new" className="text-sm text-slate-300 group-hover:text-blue-400" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                <button onClick={() => onSubtopicComplete(currentSub.id)} disabled={done.includes(currentSub.id)}
                  className={`btn-primary ${done.includes(currentSub.id) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {done.includes(currentSub.id) ? <><Icon name="check_circle" fill={1} className="text-lg" /> Completed</> : <><Icon name="check" className="text-lg" /> Mark Complete</>}
                </button>
                {activeSubtopic < moduleData.subtopics.length - 1 && (
                  <button onClick={() => setActiveSubtopic(activeSubtopic + 1)} className="btn-ghost">Next <Icon name="arrow_forward" className="text-lg" /></button>
                )}
              </div>
            </div>
          )}

          {/* Assessment CTA */}
          {allDone && (
            <div className="card p-6 rounded-2xl mt-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="w-12 h-12 rounded-2xl bg-blue-500 flex items-center justify-center shrink-0">
                  <Icon name="quiz" fill={1} className="text-white text-2xl" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 dark:text-white">Ready for the assessment!</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Test your understanding of {moduleData.topic}.</p>
                </div>
                <button onClick={onTakeAssessment} className="btn-primary-lg shrink-0">
                  Take Assessment <Icon name="arrow_forward" className="text-lg" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* AI Tutor Sidebar */}
        <div className="lg:w-80 shrink-0">
          <div className="card rounded-2xl overflow-hidden sticky top-20">
            <button onClick={() => setTutorOpen(!tutorOpen)}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <div className="flex items-center gap-2">
                <Icon name="smart_toy" fill={1} className="text-lg text-blue-500" />
                <span className="font-bold text-sm text-slate-900 dark:text-white">AI Tutor</span>
              </div>
              <Icon name={tutorOpen ? 'expand_less' : 'expand_more'} className="text-lg text-slate-400" />
            </button>
            {tutorOpen && (
              <div className="border-t border-slate-200 dark:border-slate-800">
                <div className="h-64 overflow-y-auto p-4 space-y-3">
                  {tutorMessages.length === 0 && <p className="text-xs text-slate-400 text-center py-8">Ask me anything about {moduleData.topic}!</p>}
                  {tutorMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'}`}>
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                  {tutorLoading && (
                    <div className="flex justify-start"><div className="bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-xl"><div className="flex gap-1">
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div></div></div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="p-3 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex gap-2">
                    <input type="text" value={tutorInput} onChange={e => setTutorInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAskTutor()} placeholder={`Ask about ${moduleData.topic}...`}
                      className="input-field text-xs py-2" />
                    <button onClick={handleAskTutor} disabled={tutorLoading || !tutorInput.trim()} className="btn-primary px-3 py-2">
                      <Icon name="send" className="text-sm" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Module Assessment ─────────────────────────────────────────────────────

function ModuleAssessment({ moduleId, moduleTopic, topics, onComplete, onBack }) {
  const [questions, setQuestions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [assessmentId, setAssessmentId] = useState(null);

  const fetchAssessment = useCallback(() => {
    setLoading(true);
    setResult(null);
    setAnswers({});
    setCurrentQ(0);
    api.post('/learning-modules/module-assessment', { moduleId, topics, difficulty: 'beginner' })
      .then(({ data }) => { setQuestions(data.questions); setAssessmentId(data.assessmentId); })
      .catch(() => setQuestions([]))
      .finally(() => setLoading(false));
  }, [moduleId, topics]);

  useEffect(() => { fetchAssessment(); }, [fetchAssessment]);

  const handleSubmit = async () => {
    if (submitting || !questions) return;
    setSubmitting(true);
    try {
      const { data } = await api.post('/learning-modules/module-assessment/submit', { assessmentId, moduleId, answers, questions });
      setResult(data);
    } catch { setResult({ score: 0, passed: false, message: 'Failed to submit. Please try again.' }); }
    finally { setSubmitting(false); }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-500">Generating assessment for {moduleTopic}...</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="max-w-2xl mx-auto py-10 fade-up">
        <div className="card p-8 rounded-2xl text-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${result.passed ? 'bg-emerald-100 dark:bg-emerald-950/30' : 'bg-amber-100 dark:bg-amber-950/30'}`}>
            <Icon name={result.passed ? 'celebration' : 'refresh'} fill={result.passed ? 1 : 0}
              className={`text-4xl ${result.passed ? 'text-emerald-500' : 'text-amber-500'}`} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{result.passed ? 'You passed!' : 'Not quite yet'}</h2>
          <p className="text-lg font-extrabold text-blue-600 mb-2">{result.score}%</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{result.message}</p>

          {result.results && (
            <div className="text-left mb-6 space-y-3">
              {result.results.map((r, i) => (
                <div key={i} className={`p-3 rounded-xl border ${r.isCorrect ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20' : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20'}`}>
                  <div className="flex items-start gap-2">
                    <Icon name={r.isCorrect ? 'check_circle' : 'cancel'} fill={1} className={`text-base mt-0.5 ${r.isCorrect ? 'text-emerald-500' : 'text-red-500'}`} />
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase">{r.type} · {r.topic}</p>
                      {r.explanation && <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{r.explanation}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-center gap-4">
            {result.passed ? (
              <button onClick={() => {
                const failedQs = (result.results || []).filter(r => !r.isCorrect).map(r => {
                  const q = questions.find(q2 => q2.id === r.questionId);
                  return q ? { id: q.id, question: q.text, answer: q.explanation || '', topic: q.topic || '', type: q.type } : null;
                }).filter(Boolean);
                onComplete(result.score, failedQs);
              }} className="btn-primary-lg">
                Continue to Next Module <Icon name="arrow_forward" className="text-lg" />
              </button>
            ) : (
              <>
                <button onClick={onBack} className="btn-secondary-lg">Review Material</button>
                <button onClick={fetchAssessment} className="btn-primary-lg">Try Again <Icon name="refresh" className="text-lg" /></button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!questions || questions.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <p className="text-slate-500">No questions available.</p>
        <button onClick={onBack} className="btn-secondary mt-4">Go Back</button>
      </div>
    );
  }

  const q = questions[currentQ];
  const totalQ = questions.length;
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="max-w-2xl mx-auto py-10 fade-up">
      <button onClick={onBack} className="btn-ghost mb-4"><Icon name="arrow_back" className="text-lg" /> Back</button>
      <div className="card p-6 rounded-2xl mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold text-blue-500 uppercase tracking-wider">{moduleTopic} Assessment</span>
          <span className="text-xs font-bold text-slate-400">{currentQ + 1} / {totalQ}</span>
        </div>
        <div className="progress-track mt-2">
          <div className="progress-fill bg-blue-500" style={{ width: `${((currentQ + 1) / totalQ) * 100}%` }} />
        </div>
      </div>

      <div className="card p-6 rounded-2xl">
        <div className="flex items-center gap-2 mb-4">
          <span className={`badge ${q.type === 'mcq' ? 'badge-info' : q.type === 'coding' ? 'badge-warning' : q.type === 'system-design' ? 'badge-danger' : 'badge-neutral'}`}>
            {q.type === 'mcq' ? 'Multiple Choice' : q.type === 'short-answer' ? 'Short Answer' : q.type === 'system-design' ? 'System Design' : 'Coding'}
          </span>
          {q.topic && <span className="text-xs text-slate-400">{q.topic}</span>}
        </div>
        <p className="text-slate-900 dark:text-white font-semibold mb-5 leading-relaxed">{q.text}</p>

        {q.type === 'mcq' && q.options && (
          <div className="space-y-2">
            {q.options.map((opt, oi) => (
              <button key={oi} onClick={() => setAnswers(a => ({ ...a, [q.id]: oi }))}
                className={`w-full text-left p-3.5 rounded-xl border-2 text-sm font-medium transition-all ${parseInt(answers[q.id]) === oi ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'}`}>
                <span className="font-bold text-slate-400 mr-2">{String.fromCharCode(65 + oi)}.</span>{opt}
              </button>
            ))}
          </div>
        )}

        {(q.type === 'short-answer' || q.type === 'system-design') && (
          <textarea value={answers[q.id] || ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
            placeholder="Type your answer here..." rows={4} className="textarea-field" />
        )}

        {q.type === 'coding' && (
          <div>
            {q.starterCode && <pre className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl text-sm font-mono text-slate-800 dark:text-slate-200 mb-3 overflow-x-auto">{q.starterCode}</pre>}
            <textarea value={answers[q.id] || q.starterCode || ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
              placeholder="Write your code here..." rows={8} className="textarea-field font-mono text-sm" />
          </div>
        )}

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
          <button onClick={() => currentQ > 0 && setCurrentQ(currentQ - 1)} disabled={currentQ === 0} className="btn-ghost disabled:opacity-30">
            <Icon name="arrow_back" className="text-lg" /> Previous
          </button>
          {currentQ < totalQ - 1 ? (
            <button onClick={() => setCurrentQ(currentQ + 1)} className="btn-primary">Next <Icon name="arrow_forward" className="text-lg" /></button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting || answeredCount < totalQ} className="btn-primary-lg disabled:opacity-40">
              {submitting ? 'Evaluating...' : 'Submit Assessment'}
              <Icon name={submitting ? 'sync' : 'check'} className={`text-lg ${submitting ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      <div className="flex justify-center gap-1.5 mt-4">
        {questions.map((_, i) => (
          <button key={i} onClick={() => setCurrentQ(i)}
            className={`w-2.5 h-2.5 rounded-full transition-all ${i === currentQ ? 'bg-blue-500 scale-125' : answers[questions[i].id] != null ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function ZeroToHeroTrack() {
  useActivityTracker('Zero to Hero');
  const { data: progress, updateProgress, isLoading, isReady } = useUserProgress('zero-to-hero', DEFAULT_PROGRESS);
  const [trackData, setTrackData] = useState(null);
  const [currentModule, setCurrentModule] = useState(null);
  const [viewState, setViewState] = useState(null);

  const step = progress?.step || 'intro';

  useEffect(() => {
    if (progress?.track && !trackData) {
      api.get(`/learning-modules/${progress.track}`).then(({ data }) => setTrackData(data)).catch(() => {});
    }
  }, [progress?.track]);

  useEffect(() => {
    if (progress?.currentModuleId && progress?.track && !currentModule) {
      api.get(`/learning-modules/${progress.track}/${progress.currentModuleId}`).then(({ data }) => setCurrentModule(data)).catch(() => {});
    }
  }, [progress?.currentModuleId, progress?.track]);

  if (isLoading || !isReady) {
    return (
      <div className="page-container">
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 font-medium">Loading your journey...</p>
        </div>
      </div>
    );
  }

  const handleStartInterview = () => updateProgress({ step: 'interview' });

  const handleInterviewComplete = async (interviewData) => {
    updateProgress({ step: 'plan', interviewData, track: interviewData.track || progress.track, knowledgeCheck: interviewData.knowledgeCheck || {} });
    try {
      const { data } = await api.get(`/learning-modules/${interviewData.track || progress.track}`);
      setTrackData(data);
    } catch {}
  };

  const handleStartModule = async (moduleId) => {
    try {
      const { data: modData } = await api.get(`/learning-modules/${progress.track}/${moduleId}`);
      setCurrentModule(modData);
      setViewState('learning');
      updateProgress(prev => ({
        ...prev, currentModuleId: moduleId,
        modules: { ...(prev.modules || {}), [moduleId]: prev.modules?.[moduleId] || { status: 'in-progress', subtopicsCompleted: [] } },
      }));
    } catch {}
  };

  const handleSubtopicComplete = (subtopicId) => {
    const moduleId = progress.currentModuleId;
    updateProgress(prev => {
      const mp = prev.modules?.[moduleId] || { status: 'in-progress', subtopicsCompleted: [] };
      const completed = [...new Set([...(mp.subtopicsCompleted || []), subtopicId])];
      return { ...prev, modules: { ...(prev.modules || {}), [moduleId]: { ...mp, status: 'in-progress', subtopicsCompleted: completed } } };
    });
  };

  const handleAssessmentComplete = (score, failedQuestions = []) => {
    const moduleId = progress.currentModuleId;
    updateProgress(prev => ({
      ...prev,
      modules: {
        ...(prev.modules || {}),
        [moduleId]: {
          status: 'completed',
          score,
          completedAt: new Date().toISOString(),
          failedQuestions: failedQuestions.length > 0 ? failedQuestions : undefined,
        },
      },
      currentModuleId: null,
    }));
    setViewState(null);
    setCurrentModule(null);
  };

  const handleBackToPlan = () => { setViewState(null); setCurrentModule(null); };

  return (
    <div className="page-container">
      {step === 'intro' && <IntroScreen onStart={handleStartInterview} hasProgress={progress.track != null} />}
      {step === 'interview' && <InterviewWizard onComplete={handleInterviewComplete} initialData={progress.interviewData} />}
      {step === 'plan' && !viewState && trackData && (
        <LearningPlan modules={trackData.modules} moduleProgress={progress.modules} knowledgeCheck={progress.knowledgeCheck} onStartModule={handleStartModule} />
      )}
      {step === 'plan' && viewState === 'learning' && currentModule && (
        <ModuleLearning moduleData={currentModule} completedSubtopics={progress.modules?.[progress.currentModuleId]?.subtopicsCompleted || []}
          onSubtopicComplete={handleSubtopicComplete} onTakeAssessment={() => setViewState('assessment')} onBack={handleBackToPlan} />
      )}
      {step === 'plan' && viewState === 'assessment' && currentModule && (
        <ModuleAssessment moduleId={progress.currentModuleId} moduleTopic={currentModule.topic}
          topics={currentModule.subtopics.map(s => s.title)} onComplete={handleAssessmentComplete} onBack={() => setViewState('learning')} />
      )}
    </div>
  );
}
