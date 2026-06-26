import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../store/useAuthStore';
import { BookmarkIcon, Code2, Play, Send, Lightbulb, ChevronLeft, ChevronRight, Filter, Search, Flame, Trophy, Target, CheckCircle2, XCircle, Loader2, X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIES = ['All', 'Arrays', 'Strings', 'Trees', 'Graphs', 'DP', 'SQL', 'Aptitude'];
const DIFFICULTIES = ['All', 'Easy', 'Medium', 'Hard'];
const STATUSES = ['All', 'Solved', 'Attempted', 'New'];
const LANGUAGES = ['javascript', 'python', 'java', 'cpp'];

const LANGUAGE_LABELS = {
  javascript: 'JavaScript',
  python: 'Python',
  java: 'Java',
  cpp: 'C++',
};

const DIFFICULTY_COLORS = {
  Easy: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Hard: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
};

const STATUS_ICONS = {
  Solved: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  Attempted: <Target className="w-4 h-4 text-amber-400" />,
  New: <span className="w-4 h-4 rounded-full border-2 border-slate-500 inline-block" />,
};

// ─────────────────────────────────────────────────────────────────────────────
// Line-number textarea
// ─────────────────────────────────────────────────────────────────────────────

function CodeEditor({ value, onChange, language }) {
  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);

  const lines = (value || '').split('\n');
  const lineCount = lines.length;

  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      onChange(newValue);
      requestAnimationFrame(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 2;
      });
    }
  };

  return (
    <div className="flex h-full rounded-xl overflow-hidden border border-outline/20 bg-slate-950/80">
      <div
        ref={lineNumbersRef}
        className="select-none px-3 py-3 text-right text-slate-500 text-sm font-mono leading-6 overflow-hidden bg-slate-900/60 border-r border-outline/10"
        style={{ minWidth: 48 }}
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        className="flex-1 bg-transparent text-slate-200 text-sm font-mono leading-6 p-3 resize-none outline-none placeholder-slate-600"
        placeholder={`// Write your ${LANGUAGE_LABELS[language] || language} code here...`}
        spellCheck={false}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Problem List View
// ─────────────────────────────────────────────────────────────────────────────

function ProblemList({ problems, loading, filters, onFilterChange, onSelectProblem, onBookmark, stats }) {
  const [searchInput, setSearchInput] = useState(filters.search || '');

  const handleSearch = (e) => {
    e.preventDefault();
    onFilterChange({ search: searchInput });
  };

  return (
    <div className="flex gap-6 h-full">
      {/* Main problem list */}
      <div className="flex-1 flex flex-col gap-4">
        {/* Search & Filters */}
        <div className="glass-card rounded-2xl p-4 border border-outline/20 bg-surface-container/50">
          <form onSubmit={handleSearch} className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search problems..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/60 border border-outline/20 text-on-surface placeholder-on-surface-variant/50 text-sm outline-none focus:border-sky-500/50 transition-colors"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-sky-600/80 hover:bg-sky-600 text-white text-sm font-bold transition-colors"
            >
              Search
            </button>
          </form>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-on-surface-variant" />
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Filters</span>
            </div>
            <select
              value={filters.category}
              onChange={(e) => onFilterChange({ category: e.target.value })}
              className="px-3 py-1.5 rounded-lg bg-slate-900/60 border border-outline/20 text-on-surface text-sm outline-none"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={filters.difficulty}
              onChange={(e) => onFilterChange({ difficulty: e.target.value })}
              className="px-3 py-1.5 rounded-lg bg-slate-900/60 border border-outline/20 text-on-surface text-sm outline-none"
            >
              {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select
              value={filters.status}
              onChange={(e) => onFilterChange({ status: e.target.value })}
              className="px-3 py-1.5 rounded-lg bg-slate-900/60 border border-outline/20 text-on-surface text-sm outline-none"
            >
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Problem cards */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
          </div>
        ) : problems.length === 0 ? (
          <div className="text-center py-20 text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl mb-2 block">search_off</span>
            <p className="text-lg font-bold">No problems found</p>
            <p className="text-sm mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {problems.map((problem) => (
              <button
                key={problem.id}
                onClick={() => onSelectProblem(problem.id)}
                className="glass-card rounded-xl p-4 border border-outline/20 bg-surface-container/50 hover:border-sky-500/30 hover:bg-surface-container/80 transition-all text-left group"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {STATUS_ICONS[problem.status]}
                    <span className="text-on-surface font-bold text-sm truncate">{problem.title}</span>
                    <span className={`px-2 py-0.5 rounded-md text-xs font-bold border ${DIFFICULTY_COLORS[problem.difficulty]}`}>
                      {problem.difficulty}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex gap-1.5">
                      {problem.tags?.slice(0, 2).map(tag => (
                        <span key={tag} className="px-2 py-0.5 rounded-md bg-slate-700/50 text-slate-300 text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <span className="text-xs text-on-surface-variant">{problem.acceptance}%</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onBookmark(problem.id); }}
                      className="p-1 rounded-lg hover:bg-slate-700/50 transition-colors"
                    >
                      <BookmarkIcon
                        className={`w-4 h-4 ${problem.bookmarked ? 'text-amber-400 fill-amber-400' : 'text-slate-500'}`}
                      />
                    </button>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stats sidebar */}
      <div className="w-72 shrink-0 flex flex-col gap-4">
        <div className="glass-card rounded-2xl p-5 border border-outline/20 bg-surface-container/50">
          <h3 className="text-on-surface font-bold text-sm mb-4 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            Your Progress
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-on-surface-variant text-sm">Solved</span>
              <span className="text-on-surface font-bold">{stats.totalSolved}/{stats.totalProblems || 17}</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all"
                style={{ width: `${Math.min(((stats.totalSolved || 0) / (stats.totalProblems || 17)) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-outline/20 bg-surface-container/50">
          <h3 className="text-on-surface font-bold text-sm mb-4 flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-400" />
            Streak
          </h3>
          <div className="text-center">
            <span className="text-3xl font-black text-on-surface">{stats.streak || 0}</span>
            <span className="text-sm text-on-surface-variant block mt-1">day{stats.streak !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-outline/20 bg-surface-container/50">
          <h3 className="text-on-surface font-bold text-sm mb-4">Difficulty Breakdown</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-emerald-400 text-sm font-bold">Easy</span>
              <span className="text-on-surface text-sm">{stats.easySolved || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-amber-400 text-sm font-bold">Medium</span>
              <span className="text-on-surface text-sm">{stats.mediumSolved || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-rose-400 text-sm font-bold">Hard</span>
              <span className="text-on-surface text-sm">{stats.hardSolved || 0}</span>
            </div>
          </div>
        </div>

        {stats.recentSubmissions?.length > 0 && (
          <div className="glass-card rounded-2xl p-5 border border-outline/20 bg-surface-container/50">
            <h3 className="text-on-surface font-bold text-sm mb-3">Recent Activity</h3>
            <div className="space-y-2">
              {stats.recentSubmissions.slice(0, 5).map((sub, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {sub.passed ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  )}
                  <span className="text-on-surface-variant truncate">{sub.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Problem Detail View
// ─────────────────────────────────────────────────────────────────────────────

function ProblemDetail({ problemId, onBack }) {
  const [problem, setProblem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState('javascript');
  const [code, setCode] = useState('');
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [submitResult, setSubmitResult] = useState(null);
  const [hints, setHints] = useState([]);
  const [hintLoading, setHintLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('description');
  const [testTab, setTestTab] = useState('testcases');

  useEffect(() => {
    loadProblem();
  }, [problemId]);

  const loadProblem = async () => {
    setLoading(true);
    setTestResults(null);
    setSubmitResult(null);
    setHints([]);
    try {
      const res = await api.get(`/practice/problems/${problemId}`);
      setProblem(res.data);
      setCode(res.data.starterCode?.[language] || '');
    } catch (err) {
      console.error('Failed to load problem:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (problem?.starterCode?.[language] && !code.trim()) {
      setCode(problem.starterCode[language]);
    }
  }, [language]);

  const handleRun = async () => {
    setRunning(true);
    setTestTab('results');
    try {
      const res = await api.post(`/practice/problems/${problemId}/run`, { code, language });
      setTestResults(res.data);
    } catch (err) {
      setTestResults({ results: [], summary: 'Failed to run code. Please try again.' });
    } finally {
      setRunning(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setTestTab('results');
    try {
      const res = await api.post(`/practice/problems/${problemId}/submit`, { code, language });
      setSubmitResult(res.data);
      setTestResults(res.data);
    } catch (err) {
      setSubmitResult({ passed: false, feedback: 'Submission failed. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleHint = async () => {
    const nextLevel = hints.length + 1;
    if (nextLevel > 3) return;
    setHintLoading(true);
    try {
      const res = await api.post(`/practice/problems/${problemId}/hint`, { hintLevel: nextLevel });
      setHints(prev => [...prev, { level: nextLevel, text: res.data.hint }]);
    } catch (err) {
      setHints(prev => [...prev, { level: nextLevel, text: 'Unable to load hint. Please try again.' }]);
    } finally {
      setHintLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="text-center py-20 text-on-surface-variant">
        <p className="text-lg font-bold">Problem not found</p>
        <button onClick={onBack} className="mt-4 text-sky-400 hover:text-sky-300 text-sm font-bold">
          Back to problems
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl hover:bg-surface-container/80 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-on-surface-variant" />
          </button>
          <h2 className="text-on-surface font-bold text-lg">{problem.title}</h2>
          <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold border ${DIFFICULTY_COLORS[problem.difficulty]}`}>
            {problem.difficulty}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
              if (problem.starterCode?.[e.target.value]) {
                setCode(problem.starterCode[e.target.value]);
              }
            }}
            className="px-3 py-1.5 rounded-lg bg-slate-900/60 border border-outline/20 text-on-surface text-sm outline-none"
          >
            {LANGUAGES.map(l => (
              <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: Problem description */}
        <div className="w-1/2 flex flex-col glass-card rounded-2xl border border-outline/20 bg-surface-container/50 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-outline/10">
            {['description', 'hints', 'submissions'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-bold capitalize transition-colors ${
                  activeTab === tab
                    ? 'text-sky-400 border-b-2 border-sky-400'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {activeTab === 'description' && (
              <div className="space-y-5">
                <div className="flex gap-2 flex-wrap">
                  {problem.tags?.map(tag => (
                    <span key={tag} className="px-2 py-0.5 rounded-md bg-slate-700/50 text-slate-300 text-xs">
                      {tag}
                    </span>
                  ))}
                  <span className="text-xs text-on-surface-variant">Acceptance: {problem.acceptance}%</span>
                </div>
                <div className="text-on-surface text-sm leading-relaxed whitespace-pre-wrap">
                  {problem.description}
                </div>
                {problem.examples?.map((ex, i) => (
                  <div key={i} className="rounded-xl bg-slate-900/60 border border-outline/10 p-4">
                    <p className="text-xs font-bold text-on-surface-variant mb-2">Example {i + 1}</p>
                    <div className="space-y-1 text-sm font-mono">
                      <p className="text-on-surface"><span className="text-slate-400">Input: </span>{ex.input}</p>
                      <p className="text-on-surface"><span className="text-slate-400">Output: </span>{ex.output}</p>
                      {ex.explanation && (
                        <p className="text-on-surface-variant text-xs mt-2">{ex.explanation}</p>
                      )}
                    </div>
                  </div>
                ))}
                {problem.constraints?.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-on-surface-variant mb-2">Constraints</p>
                    <ul className="list-disc list-inside text-sm text-on-surface-variant space-y-1">
                      {problem.constraints.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'hints' && (
              <div className="space-y-4">
                {hints.length === 0 && (
                  <p className="text-on-surface-variant text-sm">
                    No hints requested yet. Click the button below to get a progressive hint.
                  </p>
                )}
                {hints.map((hint, i) => (
                  <div key={i} className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4">
                    <p className="text-xs font-bold text-amber-400 mb-2 flex items-center gap-1.5">
                      <Lightbulb className="w-3.5 h-3.5" />
                      Hint {hint.level}
                    </p>
                    <p className="text-on-surface text-sm whitespace-pre-wrap">{hint.text}</p>
                  </div>
                ))}
                {hints.length < 3 && (
                  <button
                    onClick={handleHint}
                    disabled={hintLoading}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-400 text-sm font-bold transition-colors disabled:opacity-50"
                  >
                    {hintLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Lightbulb className="w-4 h-4" />
                    )}
                    Get Hint {hints.length + 1} of 3
                  </button>
                )}
              </div>
            )}
            {activeTab === 'submissions' && (
              <div className="space-y-3">
                {problem.previousSubmissions?.length > 0 ? (
                  problem.previousSubmissions.map((sub, i) => (
                    <div key={i} className="rounded-xl bg-slate-900/60 border border-outline/10 p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {sub.passed ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <XCircle className="w-5 h-5 text-rose-400" />
                        )}
                        <div>
                          <p className="text-on-surface text-sm font-bold">{sub.passed ? 'Accepted' : 'Failed'}</p>
                          <p className="text-on-surface-variant text-xs">{sub.language}</p>
                        </div>
                      </div>
                      <span className="text-on-surface-variant text-xs">
                        {new Date(sub.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-on-surface-variant text-sm">No previous submissions</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Code editor + test results */}
        <div className="w-1/2 flex flex-col gap-4 min-h-0">
          {/* Code editor */}
          <div className="flex-1 min-h-0 flex flex-col">
            <CodeEditor value={code} onChange={setCode} language={language} />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleRun}
              disabled={running || !code.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-700/80 hover:bg-slate-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Run Code
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !code.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm font-bold transition-colors disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Submit
            </button>
          </div>

          {/* Test results panel */}
          <div className="glass-card rounded-2xl border border-outline/20 bg-surface-container/50 overflow-hidden" style={{ maxHeight: 280 }}>
            <div className="flex border-b border-outline/10">
              {['testcases', 'results'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setTestTab(tab)}
                  className={`px-4 py-2.5 text-sm font-bold capitalize transition-colors ${
                    testTab === tab
                      ? 'text-sky-400 border-b-2 border-sky-400'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {tab === 'testcases' ? 'Test Cases' : 'Results'}
                </button>
              ))}
            </div>
            <div className="p-4 overflow-y-auto" style={{ maxHeight: 220 }}>
              {testTab === 'testcases' && (
                <div className="space-y-3">
                  {problem.testCases?.map((tc, i) => (
                    <div key={i} className="rounded-lg bg-slate-900/60 p-3 text-sm font-mono">
                      <p className="text-slate-400 text-xs mb-1">Case {i + 1}</p>
                      <p className="text-on-surface"><span className="text-slate-500">Input: </span>{tc.input}</p>
                      <p className="text-on-surface"><span className="text-slate-500">Expected: </span>{tc.expected}</p>
                    </div>
                  ))}
                </div>
              )}
              {testTab === 'results' && (
                <div className="space-y-3">
                  {(running || submitting) && (
                    <div className="flex items-center gap-2 text-on-surface-variant text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {running ? 'Running tests...' : 'Evaluating submission...'}
                    </div>
                  )}
                  {testResults?.results?.map((r, i) => (
                    <div key={i} className={`rounded-lg p-3 text-sm font-mono border ${
                      r.passed ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        {r.passed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-400" />
                        )}
                        <span className={`text-xs font-bold ${r.passed ? 'text-emerald-400' : 'text-rose-400'}`}>
                          Test {r.testCase} — {r.passed ? 'Passed' : 'Failed'}
                        </span>
                      </div>
                      <p className="text-on-surface-variant text-xs">
                        <span className="text-slate-500">Expected: </span>{r.expected}
                      </p>
                      <p className="text-on-surface-variant text-xs">
                        <span className="text-slate-500">Actual: </span>{r.actual}
                      </p>
                    </div>
                  ))}
                  {submitResult && (
                    <div className={`rounded-lg p-4 border ${
                      submitResult.passed ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-slate-900/60 border-outline/10'
                    }`}>
                      {submitResult.passed && (
                        <p className="text-emerald-400 font-bold text-sm mb-2 flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5" />
                          Solution Accepted
                        </p>
                      )}
                      {submitResult.feedback && (
                        <p className="text-on-surface-variant text-sm whitespace-pre-wrap">{submitResult.feedback}</p>
                      )}
                      {submitResult.timeComplexity && (
                        <p className="text-xs text-on-surface-variant mt-2">
                          Time: {submitResult.timeComplexity} | Space: {submitResult.spaceComplexity}
                        </p>
                      )}
                      {submitResult.suggestions?.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-bold text-on-surface-variant mb-1">Suggestions</p>
                          <ul className="list-disc list-inside text-xs text-on-surface-variant space-y-0.5">
                            {submitResult.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                  {!testResults && !running && !submitting && (
                    <p className="text-on-surface-variant text-sm">Run your code or submit to see results</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CodingPractice() {
  const [view, setView] = useState('list'); // 'list' | 'detail'
  const [selectedProblem, setSelectedProblem] = useState(null);
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({});
  const [filters, setFilters] = useState({
    category: 'All',
    difficulty: 'All',
    status: 'All',
    search: '',
  });

  const loadProblems = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.category !== 'All') params.category = filters.category;
      if (filters.difficulty !== 'All') params.difficulty = filters.difficulty;
      if (filters.status !== 'All') params.status = filters.status;
      if (filters.search) params.search = filters.search;
      const res = await api.get('/practice/problems', { params });
      setProblems(res.data.problems || []);
    } catch (err) {
      console.error('Failed to load problems:', err);
      setProblems([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get('/practice/stats');
      setStats(res.data);
    } catch {
      // continue
    }
  }, []);

  useEffect(() => {
    loadProblems();
  }, [loadProblems]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleFilterChange = (newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const handleSelectProblem = (id) => {
    setSelectedProblem(id);
    setView('detail');
  };

  const handleBack = () => {
    setView('list');
    setSelectedProblem(null);
    loadProblems();
    loadStats();
  };

  const handleBookmark = async (id) => {
    try {
      const res = await api.post(`/practice/problems/${id}/bookmark`);
      setProblems(prev => prev.map(p =>
        p.id === id ? { ...p, bookmarked: res.data.bookmarked } : p
      ));
    } catch {
      // continue
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8" style={{ minHeight: 'calc(100vh - 120px)' }}>
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-sky-400 text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
            code
          </span>
          <h1 className="font-headline text-on-surface text-2xl font-black">Coding Practice</h1>
        </div>
        <p className="text-on-surface-variant text-sm">
          Sharpen your coding skills with problems across categories and difficulty levels
        </p>
      </div>

      {/* Content */}
      {view === 'list' ? (
        <ProblemList
          problems={problems}
          loading={loading}
          filters={filters}
          onFilterChange={handleFilterChange}
          onSelectProblem={handleSelectProblem}
          onBookmark={handleBookmark}
          stats={stats}
        />
      ) : (
        <ProblemDetail
          problemId={selectedProblem}
          onBack={handleBack}
        />
      )}
    </div>
  );
}
