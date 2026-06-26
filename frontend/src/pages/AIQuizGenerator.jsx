import { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, CheckCircle2, XCircle, RotateCcw, ChevronRight, Trophy, Target, Zap } from 'lucide-react';
import { api } from '../store/useAuthStore';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DIFFICULTIES = [
  { id: 'easy', label: 'Easy', icon: 'sentiment_satisfied', color: 'emerald', description: 'Foundational concepts' },
  { id: 'medium', label: 'Medium', icon: 'trending_up', color: 'amber', description: 'Applied knowledge' },
  { id: 'hard', label: 'Hard', icon: 'local_fire_department', color: 'rose', description: 'Expert-level questions' },
];

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AIQuizGenerator() {
  // ── State ──────────────────────────────────────────────────────────────────

  const [phase, setPhase] = useState('setup'); // setup | loading | quiz | review | results
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [questionCount, setQuestionCount] = useState(10);

  // Quiz state
  const [quizData, setQuizData] = useState(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [answers, setAnswers] = useState({});
  const [timer, setTimer] = useState(0);
  const timerRef = useRef(null);

  // Results
  const [results, setResults] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // History
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jt_quiz_history') || '[]'); }
    catch { return []; }
  });
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState('');

  // ── Timer ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase === 'quiz') {
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [phase]);

  // ── Generate quiz ──────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!topic.trim()) { setError('Please enter a topic'); return; }
    setError('');
    setPhase('loading');
    try {
      const { data } = await api.post('/study-tools/quiz/generate', {
        topic: topic.trim(),
        difficulty,
        count: questionCount,
      });
      if (data.success && data.data) {
        setQuizData(data.data);
        setCurrentQ(0);
        setSelectedOption(null);
        setAnswered(false);
        setAnswers({});
        setTimer(0);
        setResults(null);
        setPhase('quiz');
      } else {
        setError('Failed to generate quiz');
        setPhase('setup');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate quiz');
      setPhase('setup');
    }
  }

  // ── Answer handling ────────────────────────────────────────────────────────

  function handleSelectOption(idx) {
    if (answered) return;
    setSelectedOption(idx);
  }

  function handleSubmitAnswer() {
    if (selectedOption === null || answered) return;
    setAnswered(true);
    setAnswers(prev => ({ ...prev, [currentQ]: selectedOption }));
  }

  function handleNextQuestion() {
    if (currentQ < quizData.questions.length - 1) {
      setCurrentQ(q => q + 1);
      setSelectedOption(null);
      setAnswered(false);
    } else {
      handleFinishQuiz();
    }
  }

  // ── Finish & submit ────────────────────────────────────────────────────────

  const handleFinishQuiz = useCallback(async () => {
    if (!quizData) return;
    setSubmitting(true);
    const finalAnswers = { ...answers, [currentQ]: selectedOption };
    try {
      const { data } = await api.post('/study-tools/quiz/submit', {
        quizId: quizData.quizId,
        answers: finalAnswers,
        questions: quizData.questions,
        topic: quizData.topic,
        difficulty: quizData.difficulty,
        timeTaken: timer,
      });
      if (data.success && data.data) {
        setResults(data.data);
        // Save to history
        const entry = {
          id: Date.now(),
          topic: quizData.topic,
          difficulty: quizData.difficulty,
          score: data.data.score,
          correct: data.data.correct,
          total: data.data.total,
          timeTaken: timer,
          date: new Date().toISOString(),
        };
        const updated = [entry, ...history].slice(0, 30);
        setHistory(updated);
        localStorage.setItem('jt_quiz_history', JSON.stringify(updated));
        setPhase('results');
      }
    } catch {
      // Compute results locally as fallback
      let correct = 0;
      const breakdown = quizData.questions.map((q, i) => {
        const userAns = finalAnswers[i];
        const isCorrect = userAns === q.correct;
        if (isCorrect) correct++;
        return { question: q.question, userAnswer: userAns, correctAnswer: q.correct, isCorrect, explanation: q.explanation };
      });
      const score = Math.round((correct / quizData.questions.length) * 100);
      setResults({
        score,
        correct,
        total: quizData.questions.length,
        timeTaken: timer,
        feedback: score >= 70 ? 'Great job!' : 'Keep studying!',
        suggestions: ['Review incorrect answers', 'Try again to improve'],
        breakdown,
      });
      setPhase('results');
    } finally {
      setSubmitting(false);
    }
  }, [quizData, answers, currentQ, selectedOption, timer, history]);

  // ── Retry wrong answers ────────────────────────────────────────────────────

  function retryWrongAnswers() {
    if (!results || !quizData) return;
    const wrongIndices = results.breakdown
      .map((b, i) => (b.isCorrect ? null : i))
      .filter(i => i !== null);
    const wrongQuestions = wrongIndices.map(i => quizData.questions[i]);
    if (wrongQuestions.length === 0) return;
    setQuizData(prev => ({
      ...prev,
      questions: wrongQuestions,
      quizId: `retry_${Date.now()}`,
    }));
    setCurrentQ(0);
    setSelectedOption(null);
    setAnswered(false);
    setAnswers({});
    setTimer(0);
    setResults(null);
    setPhase('quiz');
  }

  const question = quizData?.questions?.[currentQ];
  const totalQuestions = quizData?.questions?.length || 0;

  // ── Setup phase ────────────────────────────────────────────────────────────

  if (phase === 'setup') {
    return (
      <div className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-3xl text-sky-500">quiz</span>
            <h1 className="font-headline text-2xl md:text-3xl text-on-surface font-bold">AI Quiz Generator</h1>
          </div>
          <p className="text-on-surface-variant text-sm md:text-base">Test your knowledge with AI-generated quizzes on any topic.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Setup form */}
          <div className="md:col-span-2">
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-on-surface font-semibold text-lg mb-5">Create Your Quiz</h2>

              {/* Topic */}
              <label className="text-on-surface font-medium text-sm mb-2 block">Topic</label>
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                placeholder="e.g., JavaScript Promises, Data Structures, HTTP Methods..."
                className="w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-sky-500/40 transition-all mb-5"
              />

              {/* Difficulty */}
              <label className="text-on-surface font-medium text-sm mb-3 block">Difficulty</label>
              <div className="grid grid-cols-3 gap-3 mb-5">
                {DIFFICULTIES.map(d => (
                  <button
                    key={d.id}
                    onClick={() => setDifficulty(d.id)}
                    className={`p-4 rounded-xl border text-center transition-all ${
                      difficulty === d.id
                        ? `bg-${d.color}-600/20 border-${d.color}-500/40 ring-2 ring-${d.color}-500/30`
                        : 'bg-surface-container/50 border-outline/20 hover:bg-surface-container'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-2xl mb-1 ${
                      difficulty === d.id ? `text-${d.color}-400` : 'text-on-surface-variant'
                    }`}>{d.icon}</span>
                    <p className={`text-sm font-semibold ${difficulty === d.id ? `text-${d.color}-400` : 'text-on-surface'}`}>{d.label}</p>
                    <p className="text-on-surface-variant/50 text-xs mt-0.5">{d.description}</p>
                  </button>
                ))}
              </div>

              {/* Question count */}
              <label className="text-on-surface font-medium text-sm mb-2 block">Number of Questions</label>
              <div className="flex items-center gap-3 mb-6">
                {[5, 10, 15].map(n => (
                  <button
                    key={n}
                    onClick={() => setQuestionCount(n)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                      questionCount === n
                        ? 'bg-sky-600 text-white'
                        : 'bg-surface-container/50 border border-outline/20 text-on-surface-variant hover:bg-surface-container'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <button
                onClick={handleGenerate}
                className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold transition-all flex items-center justify-center gap-2"
              >
                <Zap className="w-5 h-5" /> Start Quiz
              </button>
            </div>
          </div>

          {/* History sidebar */}
          <div>
            <div className="glass-card rounded-2xl p-5">
              <h3 className="text-on-surface font-semibold text-sm mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-sky-500 text-lg">history</span> Quiz History
              </h3>
              {history.length === 0 ? (
                <p className="text-on-surface-variant/50 text-xs">No quizzes taken yet</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {history.map(h => (
                    <div key={h.id} className="bg-surface-container/50 rounded-xl p-3 border border-outline/10">
                      <p className="text-on-surface text-sm font-medium truncate">{h.topic}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs font-semibold ${h.score >= 70 ? 'text-emerald-400' : h.score >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                          {h.score}%
                        </span>
                        <span className="text-on-surface-variant/40 text-xs">{h.correct}/{h.total}</span>
                        <span className="text-on-surface-variant/40 text-xs">&middot;</span>
                        <span className="text-on-surface-variant/40 text-xs">{formatTime(h.timeTaken)}</span>
                      </div>
                      <p className="text-on-surface-variant/30 text-xs mt-0.5">{new Date(h.date).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading phase ──────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto flex items-center justify-center">
        <div className="glass-card rounded-2xl p-12 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full border-3 border-sky-500 border-t-transparent animate-spin mb-5" />
          <h2 className="text-on-surface font-bold text-xl mb-2">Generating Your Quiz</h2>
          <p className="text-on-surface-variant text-sm">Creating {questionCount} {difficulty} questions about {topic}...</p>
        </div>
      </div>
    );
  }

  // ── Quiz phase ─────────────────────────────────────────────────────────────

  if (phase === 'quiz' && question) {
    const isCorrect = answered && selectedOption === question.correct;
    const isWrong = answered && selectedOption !== question.correct;

    return (
      <div className="min-h-screen p-4 md:p-8 max-w-3xl mx-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-sky-500">quiz</span>
            <h1 className="font-headline text-lg text-on-surface font-bold">Quiz: {quizData.topic}</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-on-surface-variant">
              <Clock className="w-4 h-4" />
              <span className="text-sm font-mono font-semibold">{formatTime(timer)}</span>
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              difficulty === 'easy' ? 'bg-emerald-500/20 text-emerald-400' :
              difficulty === 'hard' ? 'bg-rose-500/20 text-rose-400' :
              'bg-amber-500/20 text-amber-400'
            }`}>{difficulty}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-2.5 bg-surface-container/50 rounded-full overflow-hidden border border-outline/10">
            <div
              className="h-full bg-gradient-to-r from-sky-500 to-blue-600 transition-all duration-500 rounded-full"
              style={{ width: `${((currentQ + 1) / totalQuestions) * 100}%` }}
            />
          </div>
          <span className="text-on-surface-variant text-sm font-semibold shrink-0">
            {currentQ + 1}/{totalQuestions}
          </span>
        </div>

        {/* Question card */}
        <div className="glass-card rounded-2xl overflow-hidden mb-6">
          <div className="p-6 border-b border-outline/10">
            <p className="text-on-surface-variant text-xs font-semibold mb-2">Question {currentQ + 1}</p>
            <h2 className="text-on-surface font-semibold text-lg leading-relaxed">{question.question}</h2>
          </div>

          {/* Options */}
          <div className="p-6 space-y-3">
            {question.options.map((opt, i) => {
              let optClasses = 'bg-surface-container/50 border-outline/20 hover:bg-surface-container hover:border-sky-500/30 cursor-pointer';

              if (answered) {
                if (i === question.correct) {
                  optClasses = 'bg-emerald-600/20 border-emerald-500/40 cursor-default';
                } else if (i === selectedOption && i !== question.correct) {
                  optClasses = 'bg-rose-600/20 border-rose-500/40 cursor-default';
                } else {
                  optClasses = 'bg-surface-container/30 border-outline/10 opacity-50 cursor-default';
                }
              } else if (selectedOption === i) {
                optClasses = 'bg-sky-600/20 border-sky-500/40 ring-2 ring-sky-500/30 cursor-pointer';
              }

              return (
                <button
                  key={i}
                  onClick={() => handleSelectOption(i)}
                  disabled={answered}
                  className={`w-full text-left p-4 rounded-xl border transition-all flex items-center gap-3 ${optClasses}`}
                >
                  <span className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold shrink-0 ${
                    answered && i === question.correct ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10' :
                    answered && i === selectedOption ? 'border-rose-500 text-rose-400 bg-rose-500/10' :
                    selectedOption === i ? 'border-sky-500 text-sky-400 bg-sky-500/10' :
                    'border-outline/30 text-on-surface-variant'
                  }`}>
                    {answered && i === question.correct ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : answered && i === selectedOption ? (
                      <XCircle className="w-4 h-4" />
                    ) : (
                      String.fromCharCode(65 + i)
                    )}
                  </span>
                  <span className={`text-sm ${
                    answered && i === question.correct ? 'text-emerald-400 font-semibold' :
                    answered && i === selectedOption ? 'text-rose-400' :
                    'text-on-surface'
                  }`}>{opt}</span>
                </button>
              );
            })}
          </div>

          {/* Explanation (shown after answer) */}
          {answered && question.explanation && (
            <div className="px-6 pb-6">
              <div className={`rounded-xl p-4 border ${isCorrect ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`material-symbols-outlined text-lg ${isCorrect ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {isCorrect ? 'check_circle' : 'info'}
                  </span>
                  <p className={`text-sm font-semibold ${isCorrect ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {isCorrect ? 'Correct!' : 'Incorrect'}
                  </p>
                </div>
                <p className="text-on-surface-variant text-sm">{question.explanation}</p>
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-3">
          {!answered && (
            <button
              onClick={handleSubmitAnswer}
              disabled={selectedOption === null}
              className="px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              Submit Answer
            </button>
          )}
          {answered && (
            <button
              onClick={handleNextQuestion}
              disabled={submitting}
              className="px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm transition-all flex items-center gap-2"
            >
              {submitting ? (
                <><span className="material-symbols-outlined text-lg animate-spin">sync</span> Submitting...</>
              ) : currentQ < totalQuestions - 1 ? (
                <>Next Question <ChevronRight className="w-4 h-4" /></>
              ) : (
                <>Finish Quiz <Trophy className="w-4 h-4" /></>
              )}
            </button>
          )}
        </div>

        {/* Question dots */}
        <div className="flex flex-wrap gap-1.5 mt-8 justify-center">
          {quizData.questions.map((_, i) => {
            let dotColor = 'bg-surface-container border-outline/20';
            if (answers[i] !== undefined) {
              const wasCorrect = answers[i] === quizData.questions[i].correct;
              dotColor = wasCorrect ? 'bg-emerald-500' : 'bg-rose-500';
            }
            return (
              <div
                key={i}
                className={`w-3 h-3 rounded-full border transition-all ${dotColor} ${i === currentQ ? 'ring-2 ring-sky-500 ring-offset-1 ring-offset-transparent scale-125' : ''}`}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // ── Results phase ──────────────────────────────────────────────────────────

  if (phase === 'results' && results) {
    const scoreColor = results.score >= 70 ? 'text-emerald-400' : results.score >= 50 ? 'text-amber-400' : 'text-rose-400';
    const scoreRing = results.score >= 70 ? 'border-emerald-500' : results.score >= 50 ? 'border-amber-500' : 'border-rose-500';
    const wrongCount = results.breakdown?.filter(b => !b.isCorrect).length || 0;

    return (
      <div className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <span className="material-symbols-outlined text-4xl text-sky-500 mb-2">emoji_events</span>
          <h1 className="font-headline text-2xl md:text-3xl text-on-surface font-bold">Quiz Complete!</h1>
        </div>

        {/* Score card */}
        <div className="glass-card rounded-2xl p-8 mb-6 text-center">
          <div className={`w-28 h-28 rounded-full border-4 ${scoreRing} flex items-center justify-center mx-auto mb-5`}>
            <span className={`text-4xl font-bold ${scoreColor}`}>{results.score}%</span>
          </div>

          <p className="text-on-surface font-semibold text-lg mb-2">{results.feedback}</p>

          <div className="flex items-center justify-center gap-6 mt-4">
            <div className="text-center">
              <div className="flex items-center gap-1.5 justify-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400 font-bold text-lg">{results.correct}</span>
              </div>
              <p className="text-on-surface-variant text-xs">Correct</p>
            </div>
            <div className="w-px h-8 bg-outline/20" />
            <div className="text-center">
              <div className="flex items-center gap-1.5 justify-center">
                <XCircle className="w-4 h-4 text-rose-400" />
                <span className="text-rose-400 font-bold text-lg">{wrongCount}</span>
              </div>
              <p className="text-on-surface-variant text-xs">Wrong</p>
            </div>
            <div className="w-px h-8 bg-outline/20" />
            <div className="text-center">
              <div className="flex items-center gap-1.5 justify-center">
                <Clock className="w-4 h-4 text-sky-400" />
                <span className="text-sky-400 font-bold text-lg">{formatTime(results.timeTaken || timer)}</span>
              </div>
              <p className="text-on-surface-variant text-xs">Time</p>
            </div>
            <div className="w-px h-8 bg-outline/20" />
            <div className="text-center">
              <div className="flex items-center gap-1.5 justify-center">
                <Target className="w-4 h-4 text-purple-400" />
                <span className="text-purple-400 font-bold text-lg">{results.total}</span>
              </div>
              <p className="text-on-surface-variant text-xs">Total</p>
            </div>
          </div>
        </div>

        {/* Suggestions */}
        {results.suggestions && results.suggestions.length > 0 && (
          <div className="glass-card rounded-2xl p-5 mb-6">
            <h3 className="text-on-surface font-semibold text-sm mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-500 text-lg">tips_and_updates</span> Suggestions
            </h3>
            <ul className="space-y-2">
              {results.suggestions.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-on-surface-variant text-sm">
                  <ChevronRight className="w-4 h-4 text-sky-500 mt-0.5 shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Question breakdown */}
        {results.breakdown && (
          <div className="glass-card rounded-2xl overflow-hidden mb-6">
            <div className="p-5 border-b border-outline/10">
              <h3 className="text-on-surface font-semibold text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-sky-500 text-lg">fact_check</span> Question Breakdown
              </h3>
            </div>
            <div className="divide-y divide-outline/10">
              {results.breakdown.map((b, i) => (
                <div key={i} className="p-5">
                  <div className="flex items-start gap-3">
                    <span className={`material-symbols-outlined text-xl mt-0.5 ${b.isCorrect ? 'text-emerald-400' : 'text-rose-400'}`}
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      {b.isCorrect ? 'check_circle' : 'cancel'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-on-surface text-sm font-medium mb-1">Q{i + 1}: {b.question}</p>
                      {!b.isCorrect && quizData?.questions?.[i] && (
                        <div className="text-xs space-y-0.5 mb-2">
                          <p className="text-rose-400">Your answer: {quizData.questions[i].options[b.userAnswer] || 'No answer'}</p>
                          <p className="text-emerald-400">Correct answer: {quizData.questions[i].options[b.correctAnswer]}</p>
                        </div>
                      )}
                      {b.explanation && (
                        <p className="text-on-surface-variant/70 text-xs mt-1">{b.explanation}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap justify-center gap-3">
          {wrongCount > 0 && (
            <button
              onClick={retryWrongAnswers}
              className="px-5 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm transition-all flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Retry Wrong Answers ({wrongCount})
            </button>
          )}
          <button
            onClick={() => { setPhase('setup'); setQuizData(null); setResults(null); }}
            className="px-5 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm transition-all flex items-center gap-2"
          >
            <Zap className="w-4 h-4" /> New Quiz
          </button>
        </div>
      </div>
    );
  }

  // Fallback
  return null;
}
