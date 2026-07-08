import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../store/useAuthStore';
import { Clock, BookOpen, Trophy, Target, CheckCircle2, XCircle, Loader2, ChevronLeft, ChevronRight, Flag, BarChart3, ArrowRight, Play, RotateCcw } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_BADGES = {
  'Topic Tests': 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  'Mock Exams': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'Semester Assessments': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'Skill Assessments': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

const DIFFICULTY_COLORS = {
  Easy: 'text-emerald-400',
  Medium: 'text-amber-400',
  Hard: 'text-rose-400',
};

const TYPE_FILTERS = ['All', 'Topic Tests', 'Mock Exams', 'Semester Assessments', 'Skill Assessments'];

// ─────────────────────────────────────────────────────────────────────────────
// Timer Hook
// ─────────────────────────────────────────────────────────────────────────────

function useTimer(durationMinutes, onTimeout) {
  const [remaining, setRemaining] = useState(durationMinutes * 60);
  const intervalRef = useRef(null);
  const callbackRef = useRef(onTimeout);
  callbackRef.current = onTimeout;

  useEffect(() => {
    setRemaining(durationMinutes * 60);
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          callbackRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [durationMinutes]);

  const stop = useCallback(() => {
    clearInterval(intervalRef.current);
  }, []);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const percentage = (remaining / (durationMinutes * 60)) * 100;

  return { remaining, formatted, percentage, stop };
}

// ─────────────────────────────────────────────────────────────────────────────
// Assessment Cards (Lobby)
// ─────────────────────────────────────────────────────────────────────────────

function AssessmentCard({ assessment, onStart }) {
  return (
    <div className="card rounded-2xl p-5 border border-outline/20 bg-surface-container/50 hover:border-sky-500/30 transition-all group">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <span className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-bold border mb-2 ${TYPE_BADGES[assessment.type] || TYPE_BADGES['Topic Tests']}`}>
            {assessment.type}
          </span>
          <h3 className="text-on-surface font-bold text-base">{assessment.title}</h3>
        </div>
        {assessment.bestScore !== null && (
          <div className="text-right shrink-0">
            <span className="text-2xl font-extrabold text-on-surface">{assessment.bestScore}</span>
            <span className="text-xs text-on-surface-variant block">best score</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-3 mb-4">
        <span className="flex items-center gap-1 text-xs text-on-surface-variant">
          <Clock className="w-3.5 h-3.5" />
          {assessment.duration} min
        </span>
        <span className="flex items-center gap-1 text-xs text-on-surface-variant">
          <BookOpen className="w-3.5 h-3.5" />
          {assessment.questionCount} questions
        </span>
        <span className={`text-xs font-bold ${DIFFICULTY_COLORS[assessment.difficulty]}`}>
          {assessment.difficulty}
        </span>
        {assessment.attempts > 0 && (
          <span className="flex items-center gap-1 text-xs text-on-surface-variant">
            <RotateCcw className="w-3.5 h-3.5" />
            {assessment.attempts} attempt{assessment.attempts !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {assessment.topics?.map(topic => (
          <span key={topic} className="px-2 py-0.5 rounded-md bg-slate-700/50 text-slate-300 text-xs">
            {topic}
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onStart(assessment.id, 'exam')}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600/80 hover:bg-sky-600 text-white text-sm font-bold transition-colors"
        >
          <Play className="w-4 h-4" />
          Exam Mode
        </button>
        <button
          onClick={() => onStart(assessment.id, 'practice')}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-700/80 hover:bg-slate-700 text-white text-sm font-bold transition-colors"
        >
          <BookOpen className="w-4 h-4" />
          Practice
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Instructions Screen
// ─────────────────────────────────────────────────────────────────────────────

function InstructionsScreen({ assessment, mode, onBegin, onBack }) {
  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-on-surface mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" />
        Back to assessments
      </button>
      <div className="card rounded-2xl p-8 border border-outline/20 bg-surface-container/50">
        <div className="text-center mb-6">
          <span className={`inline-block px-3 py-1 rounded-xl text-sm font-bold border mb-3 ${TYPE_BADGES[assessment.type]}`}>
            {assessment.type}
          </span>
          <h2 className="text-on-surface font-headline text-2xl font-extrabold mb-2">{assessment.title}</h2>
          <p className="text-on-surface-variant text-sm">
            {mode === 'exam' ? 'Timed assessment — answers shown at the end' : 'Practice mode — see answers immediately'}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="text-center p-4 rounded-xl bg-slate-900/60">
            <Clock className="w-5 h-5 text-sky-400 mx-auto mb-1" />
            <p className="text-on-surface font-bold">{mode === 'exam' ? `${assessment.duration} min` : 'No limit'}</p>
            <p className="text-on-surface-variant text-xs">Duration</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-slate-900/60">
            <BookOpen className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
            <p className="text-on-surface font-bold">{assessment.questionCount}</p>
            <p className="text-on-surface-variant text-xs">Questions</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-slate-900/60">
            <Target className="w-5 h-5 text-amber-400 mx-auto mb-1" />
            <p className={`font-bold ${DIFFICULTY_COLORS[assessment.difficulty]}`}>{assessment.difficulty}</p>
            <p className="text-on-surface-variant text-xs">Difficulty</p>
          </div>
        </div>
        <div className="space-y-3 mb-8">
          <h3 className="text-on-surface font-bold text-sm">Instructions</h3>
          <ul className="space-y-2 text-sm text-on-surface-variant">
            {mode === 'exam' ? (
              <>
                <li className="flex gap-2"><span className="text-sky-400 shrink-0">1.</span> You have {assessment.duration} minutes to complete this assessment.</li>
                <li className="flex gap-2"><span className="text-sky-400 shrink-0">2.</span> You can flag questions and return to them later.</li>
                <li className="flex gap-2"><span className="text-sky-400 shrink-0">3.</span> Answers and explanations are shown after submission.</li>
                <li className="flex gap-2"><span className="text-sky-400 shrink-0">4.</span> The assessment auto-submits when time runs out.</li>
              </>
            ) : (
              <>
                <li className="flex gap-2"><span className="text-emerald-400 shrink-0">1.</span> There is no time limit in practice mode.</li>
                <li className="flex gap-2"><span className="text-emerald-400 shrink-0">2.</span> Correct answers are shown immediately after answering.</li>
                <li className="flex gap-2"><span className="text-emerald-400 shrink-0">3.</span> Use this mode to learn and understand concepts.</li>
              </>
            )}
          </ul>
        </div>
        <div className="flex flex-wrap gap-2 mb-8">
          <span className="text-xs text-on-surface-variant font-bold">Topics: </span>
          {assessment.topics?.map(t => (
            <span key={t} className="px-2 py-0.5 rounded-md bg-slate-700/50 text-slate-300 text-xs">{t}</span>
          ))}
        </div>
        <button
          onClick={onBegin}
          className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-base transition-colors flex items-center justify-center gap-2"
        >
          Begin Assessment
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Active Test
// ─────────────────────────────────────────────────────────────────────────────

function ActiveTest({ assessment, mode, onSubmit, onBack }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [flagged, setFlagged] = useState(new Set());
  const [showAnswer, setShowAnswer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const startTimeRef = useRef(Date.now());

  const handleTimeout = useCallback(() => {
    handleSubmit();
  }, [answers]);

  const timer = mode === 'exam' ? useTimer(assessment.duration, handleTimeout) : null;
  const questions = assessment.questions || [];
  const question = questions[currentIndex];

  const setAnswer = (questionId, value) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
    if (mode === 'practice') setShowAnswer(true);
  };

  const toggleFlag = () => {
    setFlagged(prev => {
      const next = new Set(prev);
      if (next.has(question.id)) next.delete(question.id);
      else next.add(question.id);
      return next;
    });
  };

  const goTo = (idx) => {
    setCurrentIndex(idx);
    setShowAnswer(false);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    timer?.stop();
    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000);
    try {
      await onSubmit(answers, timeTaken);
    } catch {
      setSubmitting(false);
    }
  };

  if (!question) return null;

  const answered = Object.keys(answers).length;
  const total = questions.length;

  return (
    <div className="flex gap-4 h-full" style={{ minHeight: 'calc(100vh - 200px)' }}>
      {/* Question Navigator Sidebar */}
      <div className="w-56 shrink-0 card rounded-2xl border border-outline/20 bg-surface-container/50 p-4 flex flex-col">
        {mode === 'exam' && timer && (
          <div className="mb-4 text-center">
            <p className={`text-2xl font-mono font-extrabold ${timer.percentage < 20 ? 'text-rose-400' : 'text-on-surface'}`}>
              {timer.formatted}
            </p>
            <div className="w-full h-1.5 rounded-full bg-slate-800 mt-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${timer.percentage < 20 ? 'bg-rose-500' : 'bg-sky-500'}`}
                style={{ width: `${timer.percentage}%` }}
              />
            </div>
          </div>
        )}
        <p className="text-xs text-on-surface-variant mb-3 font-bold">
          {answered}/{total} answered
        </p>
        <div className="grid grid-cols-5 gap-1.5 flex-1 content-start">
          {questions.map((q, i) => {
            const isActive = i === currentIndex;
            const isAnswered = !!answers[q.id];
            const isFlagged = flagged.has(q.id);
            return (
              <button
                key={q.id}
                onClick={() => goTo(i)}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-all relative ${
                  isActive
                    ? 'bg-sky-600 text-white ring-2 ring-sky-400'
                    : isAnswered
                      ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800/60 text-on-surface-variant hover:bg-slate-700/60'
                }`}
              >
                {i + 1}
                {isFlagged && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400" />
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-4 w-full py-2.5 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm font-bold transition-colors disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit All'}
        </button>
      </div>

      {/* Question Area */}
      <div className="flex-1 flex flex-col card rounded-2xl border border-outline/20 bg-surface-container/50 overflow-hidden">
        {/* Question header */}
        <div className="px-6 py-4 border-b border-outline/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-on-surface-variant">
              Question {currentIndex + 1} of {total}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-700/50 text-slate-300 text-xs capitalize">
              {question.type === 'mcq' ? 'Multiple Choice' : question.type === 'true-false' ? 'True/False' : 'Short Answer'}
            </span>
          </div>
          <button
            onClick={toggleFlag}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              flagged.has(question.id)
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-slate-800/60 text-on-surface-variant hover:bg-slate-700/60'
            }`}
          >
            <Flag className={`w-3.5 h-3.5 ${flagged.has(question.id) ? 'fill-amber-400' : ''}`} />
            {flagged.has(question.id) ? 'Flagged' : 'Flag'}
          </button>
        </div>

        {/* Question body */}
        <div className="flex-1 p-6 overflow-y-auto">
          <h3 className="text-on-surface text-lg font-bold mb-6 leading-relaxed">{question.text}</h3>

          {/* MCQ */}
          {(question.type === 'mcq' && question.options) && (
            <div className="space-y-3">
              {question.options.map((option, i) => {
                const selected = answers[question.id] === option;
                const isCorrect = mode === 'practice' && showAnswer && option === question.correct;
                const isWrong = mode === 'practice' && showAnswer && selected && option !== question.correct;
                return (
                  <button
                    key={i}
                    onClick={() => setAnswer(question.id, option)}
                    disabled={mode === 'practice' && showAnswer}
                    className={`w-full text-left px-5 py-3.5 rounded-xl border text-sm font-medium transition-all ${
                      isCorrect
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : isWrong
                          ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                          : selected
                            ? 'bg-sky-600/20 border-sky-500/40 text-sky-300'
                            : 'bg-slate-900/40 border-outline/20 text-on-surface hover:border-sky-500/30 hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="inline-flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs shrink-0 ${
                        selected || isCorrect ? 'border-current' : 'border-slate-600'
                      }`}>
                        {isCorrect ? <CheckCircle2 className="w-4 h-4" /> : isWrong ? <XCircle className="w-4 h-4" /> : String.fromCharCode(65 + i)}
                      </span>
                      {option}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* True/False */}
          {question.type === 'true-false' && (
            <div className="flex gap-4">
              {['True', 'False'].map(opt => {
                const selected = answers[question.id] === opt;
                const isCorrect = mode === 'practice' && showAnswer && opt === question.correct;
                const isWrong = mode === 'practice' && showAnswer && selected && opt !== question.correct;
                return (
                  <button
                    key={opt}
                    onClick={() => setAnswer(question.id, opt)}
                    disabled={mode === 'practice' && showAnswer}
                    className={`flex-1 py-4 rounded-xl border text-sm font-bold transition-all ${
                      isCorrect
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : isWrong
                          ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                          : selected
                            ? 'bg-sky-600/20 border-sky-500/40 text-sky-300'
                            : 'bg-slate-900/40 border-outline/20 text-on-surface hover:border-sky-500/30'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          )}

          {/* Short Answer */}
          {question.type === 'short-answer' && (
            <div>
              <input
                type="text"
                value={answers[question.id] || ''}
                onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                onBlur={() => { if (mode === 'practice' && answers[question.id]) setShowAnswer(true); }}
                placeholder="Type your answer..."
                className="w-full px-5 py-3.5 rounded-xl bg-slate-900/60 border border-outline/20 text-on-surface placeholder-on-surface-variant/50 text-sm outline-none focus:border-sky-500/50 transition-colors"
                disabled={mode === 'practice' && showAnswer}
              />
              {mode === 'practice' && !showAnswer && answers[question.id] && (
                <button
                  onClick={() => setShowAnswer(true)}
                  className="mt-3 px-4 py-2 rounded-lg bg-sky-600/20 text-sky-400 text-xs font-bold hover:bg-sky-600/30 transition-colors"
                >
                  Check Answer
                </button>
              )}
            </div>
          )}

          {/* Practice mode explanation */}
          {mode === 'practice' && showAnswer && question.explanation && (
            <div className="mt-6 p-4 rounded-xl bg-sky-500/10 border border-sky-500/20">
              <p className="text-xs font-bold text-sky-400 mb-1">Explanation</p>
              <p className="text-on-surface-variant text-sm">{question.explanation}</p>
              {question.correct && (
                <p className="text-xs text-emerald-400 mt-2 font-bold">Correct answer: {question.correct}</p>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="px-6 py-4 border-t border-outline/10 flex items-center justify-between">
          <button
            onClick={() => goTo(Math.max(0, currentIndex - 1))}
            disabled={currentIndex === 0}
            className="flex items-center gap-1 px-4 py-2 rounded-xl bg-slate-800/60 text-on-surface-variant text-sm font-bold hover:bg-slate-700/60 transition-colors disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <button
            onClick={() => goTo(Math.min(total - 1, currentIndex + 1))}
            disabled={currentIndex === total - 1}
            className="flex items-center gap-1 px-4 py-2 rounded-xl bg-slate-800/60 text-on-surface-variant text-sm font-bold hover:bg-slate-700/60 transition-colors disabled:opacity-30"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Results Screen
// ─────────────────────────────────────────────────────────────────────────────

function ResultsScreen({ results, assessment, onBack }) {
  const [showReview, setShowReview] = useState(false);

  if (!results) return null;

  const timeMins = results.timeTaken ? Math.floor(results.timeTaken / 60) : 0;
  const timeSecs = results.timeTaken ? results.timeTaken % 60 : 0;

  const scoreColor = results.score >= 80 ? 'text-emerald-400' : results.score >= 60 ? 'text-amber-400' : 'text-rose-400';
  const scoreBg = results.score >= 80 ? 'from-emerald-500/20' : results.score >= 60 ? 'from-amber-500/20' : 'from-rose-500/20';

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-on-surface mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4" />
        Back to assessments
      </button>

      {/* Score card */}
      <div className={`card rounded-2xl p-8 border border-outline/20 bg-gradient-to-br ${scoreBg} to-transparent mb-6`}>
        <div className="text-center mb-6">
          <h2 className="text-on-surface font-headline text-xl font-extrabold mb-1">Assessment Complete</h2>
          <p className="text-on-surface-variant text-sm">{assessment?.title}</p>
        </div>
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <p className={`text-4xl font-extrabold ${scoreColor}`}>{results.score}%</p>
            <p className="text-on-surface-variant text-xs mt-1">Score</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-extrabold text-on-surface">{results.correct}/{results.total}</p>
            <p className="text-on-surface-variant text-xs mt-1">Correct</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-extrabold text-sky-400">{results.percentile}th</p>
            <p className="text-on-surface-variant text-xs mt-1">Percentile</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-extrabold text-on-surface">
              {timeMins > 0 ? `${timeMins}m ` : ''}{timeSecs}s
            </p>
            <p className="text-on-surface-variant text-xs mt-1">Time</p>
          </div>
        </div>
        <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              results.score >= 80 ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' :
              results.score >= 60 ? 'bg-gradient-to-r from-amber-500 to-amber-400' :
              'bg-gradient-to-r from-rose-500 to-rose-400'
            }`}
            style={{ width: `${results.score}%` }}
          />
        </div>
      </div>

      {/* Review toggle */}
      <button
        onClick={() => setShowReview(!showReview)}
        className="w-full card rounded-2xl p-4 border border-outline/20 bg-surface-container/50 text-left flex items-center justify-between hover:border-sky-500/30 transition-colors mb-4"
      >
        <span className="text-on-surface font-bold text-sm flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-sky-400" />
          Detailed Review
        </span>
        <ChevronRight className={`w-4 h-4 text-on-surface-variant transition-transform ${showReview ? 'rotate-90' : ''}`} />
      </button>

      {/* Detailed review */}
      {showReview && (
        <div className="space-y-3 mb-6">
          {results.results?.map((r, i) => (
            <div
              key={i}
              className={`glass-card rounded-xl p-5 border ${
                r.isCorrect ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5'
              }`}
            >
              <div className="flex items-start gap-3 mb-3">
                {r.isCorrect ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="text-on-surface text-sm font-bold mb-1">Q{i + 1}: {r.text}</p>
                  <div className="flex gap-4 text-xs mb-2">
                    <span className="text-on-surface-variant">
                      Your answer: <span className={r.isCorrect ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {r.userAnswer || '(no answer)'}
                      </span>
                    </span>
                    {!r.isCorrect && (
                      <span className="text-on-surface-variant">
                        Correct: <span className="text-emerald-400 font-bold">{r.correctAnswer}</span>
                      </span>
                    )}
                  </div>
                  {r.explanation && (
                    <p className="text-on-surface-variant text-xs bg-slate-900/40 rounded-lg p-3">{r.explanation}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function Assessments() {
  const [phase, setPhase] = useState('lobby'); // lobby | instructions | test | results
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('All');
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState('exam');
  const [activeAssessment, setActiveAssessment] = useState(null);
  const [results, setResults] = useState(null);
  const [stats, setStats] = useState({});

  const loadAssessments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/practice/assessments');
      setAssessments(res.data.assessments || []);
    } catch (err) {
      console.error('Failed to load assessments:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get('/practice/stats');
      setStats(res.data);
    } catch {
      // continue
    }
  }, []);

  useEffect(() => {
    loadAssessments();
    loadStats();
  }, [loadAssessments, loadStats]);

  const handleStart = (id, testMode) => {
    setSelectedId(id);
    setMode(testMode);
    setPhase('instructions');
  };

  const handleBegin = async () => {
    try {
      const res = await api.get(`/practice/assessments/${selectedId}`, { params: { mode } });
      setActiveAssessment(res.data);
      setPhase('test');
    } catch (err) {
      console.error('Failed to load assessment:', err);
    }
  };

  const handleSubmit = async (answers, timeTaken) => {
    try {
      const res = await api.post(`/practice/assessments/${selectedId}/submit`, { answers, timeTaken });
      setResults(res.data);
      setPhase('results');
    } catch (err) {
      console.error('Failed to submit:', err);
      throw err;
    }
  };

  const handleBack = () => {
    setPhase('lobby');
    setSelectedId(null);
    setActiveAssessment(null);
    setResults(null);
    loadAssessments();
    loadStats();
  };

  const filteredAssessments = typeFilter === 'All'
    ? assessments
    : assessments.filter(a => a.type === typeFilter);

  // Find the selected assessment meta (from the lobby list)
  const selectedMeta = assessments.find(a => a.id === selectedId);

  return (
    <div className="page-container" style={{ minHeight: 'calc(100vh - 120px)' }}>
      {/* Page Header */}
      {phase === 'lobby' && (
        <>
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <span className="material-symbols-outlined text-purple-400 text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                quiz
              </span>
              <h1 className="font-headline text-on-surface text-2xl font-extrabold">Assessments</h1>
            </div>
            <p className="text-on-surface-variant text-sm">
              Test your knowledge with topic tests, mock exams, and skill assessments
            </p>
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="glass-card rounded-xl p-4 border border-outline/20 bg-surface-container/50 flex items-center gap-3">
              <Trophy className="w-5 h-5 text-amber-400" />
              <div>
                <p className="text-on-surface font-bold text-lg">{stats.assessmentsCompleted || 0}</p>
                <p className="text-on-surface-variant text-xs">Completed</p>
              </div>
            </div>
            <div className="glass-card rounded-xl p-4 border border-outline/20 bg-surface-container/50 flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-sky-400" />
              <div>
                <p className="text-on-surface font-bold text-lg">{stats.averageScore || 0}%</p>
                <p className="text-on-surface-variant text-xs">Average Score</p>
              </div>
            </div>
            <div className="glass-card rounded-xl p-4 border border-outline/20 bg-surface-container/50 flex items-center gap-3">
              <Target className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-on-surface font-bold text-lg">{stats.totalSolved || 0}</p>
                <p className="text-on-surface-variant text-xs">Problems Solved</p>
              </div>
            </div>
          </div>

          {/* Type filter tabs */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
            {TYPE_FILTERS.map(type => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${
                  typeFilter === type
                    ? 'bg-sky-600/80 text-white'
                    : 'bg-surface-container/50 text-on-surface-variant border border-outline/20 hover:border-sky-500/30'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Assessment grid */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
            </div>
          ) : filteredAssessments.length === 0 ? (
            <div className="text-center py-20 text-on-surface-variant">
              <span className="material-symbols-outlined text-4xl mb-2 block">assignment</span>
              <p className="text-lg font-bold">No assessments found</p>
              <p className="text-sm mt-1">Try a different category</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAssessments.map(a => (
                <AssessmentCard key={a.id} assessment={a} onStart={handleStart} />
              ))}
            </div>
          )}
        </>
      )}

      {phase === 'instructions' && selectedMeta && (
        <InstructionsScreen
          assessment={selectedMeta}
          mode={mode}
          onBegin={handleBegin}
          onBack={handleBack}
        />
      )}

      {phase === 'test' && activeAssessment && (
        <ActiveTest
          assessment={activeAssessment}
          mode={mode}
          onSubmit={handleSubmit}
          onBack={handleBack}
        />
      )}

      {phase === 'results' && (
        <ResultsScreen
          results={results}
          assessment={selectedMeta}
          onBack={handleBack}
        />
      )}
    </div>
  );
}
