import React, { useState, useEffect } from 'react';
import { api } from '../store/useAuthStore';
import { Code2, Shield, Zap, Bug, CheckCircle2, AlertTriangle, Info, Lightbulb, History, RefreshCw, Copy, Check, Eye, SplitSquareHorizontal } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'go', label: 'Go' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
];

const REVIEW_TYPES = [
  { value: 'full', label: 'Full Review', icon: 'checklist', description: 'Comprehensive analysis' },
  { value: 'bugs', label: 'Bug Detection', icon: 'bug_report', description: 'Find potential bugs' },
  { value: 'performance', label: 'Performance', icon: 'speed', description: 'Optimize performance' },
  { value: 'security', label: 'Security', icon: 'security', description: 'Security vulnerabilities' },
  { value: 'best-practices', label: 'Best Practices', icon: 'star', description: 'Industry standards' },
  { value: 'readability', label: 'Readability', icon: 'visibility', description: 'Code clarity' },
];

function getScoreColor(score) {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

function getScoreLabel(score) {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Needs Improvement';
  return 'Poor';
}

function getSeverityConfig(severity) {
  switch (severity) {
    case 'critical':
      return { color: 'bg-rose-500/20 text-rose-400 border-rose-500/30', icon: AlertTriangle, label: 'Critical' };
    case 'warning':
      return { color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: AlertTriangle, label: 'Warning' };
    case 'info':
      return { color: 'bg-sky-500/20 text-sky-400 border-sky-500/30', icon: Info, label: 'Info' };
    case 'suggestion':
      return { color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: Lightbulb, label: 'Suggestion' };
    default:
      return { color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: Info, label: severity };
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AICodeReviewer() {
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [reviewType, setReviewType] = useState('full');
  const [activeTab, setActiveTab] = useState('input');

  // Review result
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // History
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Code view mode
  const [codeViewMode, setCodeViewMode] = useState('side-by-side');
  const [copied, setCopied] = useState(false);

  // ── Fetch history on mount ───────────────────────────────────────────────
  useEffect(() => {
    fetchHistory();
  }, []);

  async function fetchHistory() {
    setLoadingHistory(true);
    try {
      const { data } = await api.get('/api/ai-coach/review-history');
      setHistory(data.reviews || []);
    } catch (err) {
      console.error('Failed to fetch review history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function submitReview() {
    if (!code.trim() || code.trim().length < 5) {
      setError('Please enter at least 5 characters of code to review.');
      return;
    }

    setError('');
    setLoading(true);
    setReview(null);

    try {
      const { data } = await api.post('/api/ai-coach/code-review', {
        code: code.trim(),
        language,
        reviewType,
      });

      setReview(data.review || null);
      setActiveTab('results');
      // Refresh history
      fetchHistory();
    } catch (err) {
      console.error('Code review failed:', err);
      setError(err.response?.data?.error || 'Failed to review code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleCopyImproved() {
    if (!review?.improvedCode) return;
    navigator.clipboard.writeText(review.improvedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleReviewAgain() {
    if (review?.improvedCode) {
      setCode(review.improvedCode);
    }
    setReview(null);
    setActiveTab('input');
  }

  // Issue counts by severity
  const issueCounts = review
    ? {
        critical: review.issues.filter((i) => i.severity === 'critical').length,
        warning: review.issues.filter((i) => i.severity === 'warning').length,
        info: review.issues.filter((i) => i.severity === 'info').length,
        suggestion: review.issues.filter((i) => i.severity === 'suggestion').length,
      }
    : {};

  const TABS = [
    { id: 'input', label: 'Code Input', icon: 'code' },
    { id: 'results', label: 'Results', icon: 'analytics', disabled: !review },
    { id: 'improved', label: 'Improved Code', icon: 'auto_fix_high', disabled: !review },
    { id: 'history', label: 'History', icon: 'history' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-cyan-950/20 to-slate-950 px-4 py-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="font-headline text-3xl font-black text-on-surface flex items-center gap-3">
              <Code2 className="w-8 h-8 text-cyan-400" />
              AI Code Reviewer
            </h1>
            <p className="text-on-surface-variant mt-1">
              Get instant, detailed code reviews powered by AI
            </p>
          </div>
        </div>

        {/* ── Tab Navigation ──────────────────────────────────────────────── */}
        <div className="flex gap-1 bg-surface-container/30 rounded-2xl p-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && setActiveTab(tab.id)}
              disabled={tab.disabled}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                tab.disabled
                  ? 'text-on-surface-variant/40 cursor-not-allowed'
                  : activeTab === tab.id
                    ? 'bg-cyan-600 text-white shadow-lg'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container/50'
              }`}
            >
              <span className="material-symbols-outlined text-lg">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Code Input Tab ──────────────────────────────────────────────── */}
        {activeTab === 'input' && (
          <div className="space-y-6">
            {/* Language and Review Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Language Selector */}
              <div className="glass-card rounded-2xl border border-outline/20 p-5">
                <h3 className="font-bold text-on-surface text-sm mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-cyan-400">language</span>
                  Language
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.value}
                      onClick={() => setLanguage(lang.value)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                        language === lang.value
                          ? 'bg-cyan-600 text-white shadow-lg'
                          : 'bg-surface-container/50 text-on-surface-variant hover:text-on-surface hover:bg-surface-container/80 border border-outline/10'
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Review Type Selector */}
              <div className="glass-card rounded-2xl border border-outline/20 p-5">
                <h3 className="font-bold text-on-surface text-sm mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-cyan-400">tune</span>
                  Review Type
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {REVIEW_TYPES.map((type) => (
                    <button
                      key={type.value}
                      onClick={() => setReviewType(type.value)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                        reviewType === type.value
                          ? 'bg-cyan-600 text-white shadow-lg'
                          : 'bg-surface-container/50 text-on-surface-variant hover:text-on-surface hover:bg-surface-container/80 border border-outline/10'
                      }`}
                    >
                      <span className="material-symbols-outlined text-base">{type.icon}</span>
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Code Textarea */}
            <div className="glass-card rounded-2xl border border-outline/20 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-outline/10 bg-surface-container/30">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-on-surface-variant">code</span>
                  <span className="font-bold text-on-surface text-sm">Paste your code</span>
                </div>
                <span className="text-xs text-on-surface-variant">{code.length} chars</span>
              </div>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="// Paste your code here for review..."
                className="w-full h-80 bg-slate-950/60 text-on-surface font-mono text-sm p-5 resize-none focus:outline-none placeholder:text-on-surface-variant/40 leading-relaxed"
                spellCheck={false}
              />
            </div>

            {/* Error */}
            {error && (
              <div className="glass-card rounded-2xl border border-rose-500/30 p-4 text-rose-400 text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end">
              <button
                onClick={submitReview}
                disabled={loading || !code.trim()}
                className="flex items-center gap-2 px-6 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition-colors"
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined text-lg animate-spin">sync</span>
                    Reviewing...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-lg">rate_review</span>
                    Review Code
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Results Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'results' && review && (
          <div className="space-y-6">
            {/* Score + Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Overall Score */}
              <div className="glass-card rounded-2xl border border-outline/20 p-6 flex flex-col items-center">
                <h3 className="font-bold text-on-surface-variant text-xs uppercase tracking-wider mb-3">Quality Score</h3>
                <div className="relative w-28 h-28">
                  <svg viewBox="0 0 36 36" className="-rotate-90 w-28 h-28">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1e293b" strokeWidth="3.2" />
                    <circle
                      cx="18" cy="18" r="15.9" fill="none"
                      stroke={getScoreColor(review.score)}
                      strokeWidth="3.2"
                      strokeDasharray={`${review.score} 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-black text-on-surface">{review.score}</span>
                    <span className="text-xs font-bold" style={{ color: getScoreColor(review.score) }}>
                      {getScoreLabel(review.score)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Metrics */}
              {[
                { label: 'Lines of Code', value: review.metrics?.linesOfCode || 0, icon: 'code', color: 'text-cyan-400' },
                { label: 'Complexity', value: review.metrics?.complexityScore || 0, icon: 'account_tree', color: 'text-amber-400' },
                { label: 'Maintainability', value: review.metrics?.maintainabilityIndex || 0, icon: 'build', color: 'text-emerald-400' },
              ].map((metric) => (
                <div key={metric.label} className="glass-card rounded-2xl border border-outline/20 p-6 flex flex-col items-center">
                  <h3 className="font-bold text-on-surface-variant text-xs uppercase tracking-wider mb-3">{metric.label}</h3>
                  <span className={`material-symbols-outlined text-3xl ${metric.color} mb-2`}>{metric.icon}</span>
                  <span className="text-2xl font-black text-on-surface">{metric.value}</span>
                </div>
              ))}
            </div>

            {/* Issue Summary */}
            <div className="glass-card rounded-2xl border border-outline/20 p-5">
              <h3 className="font-bold text-on-surface text-lg mb-4">Issue Summary</h3>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Critical', count: issueCounts.critical, color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
                  { label: 'Warning', count: issueCounts.warning, color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
                  { label: 'Info', count: issueCounts.info, color: 'bg-sky-500/20 text-sky-400 border-sky-500/30' },
                  { label: 'Suggestion', count: issueCounts.suggestion, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
                ].map((item) => (
                  <div key={item.label} className={`rounded-xl border p-3 text-center ${item.color}`}>
                    <div className="text-2xl font-black">{item.count || 0}</div>
                    <div className="text-xs font-bold">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Issues List */}
            <div className="space-y-3">
              <h3 className="font-bold text-on-surface text-lg">Issues Found</h3>
              {review.issues.length === 0 ? (
                <div className="glass-card rounded-2xl border border-outline/20 p-8 text-center">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
                  <p className="text-on-surface-variant font-medium">No issues found. Your code looks great!</p>
                </div>
              ) : (
                review.issues.map((issue, i) => {
                  const config = getSeverityConfig(issue.severity);
                  const SeverityIcon = config.icon;
                  return (
                    <div key={i} className="glass-card rounded-2xl border border-outline/20 p-5">
                      <div className="flex items-start gap-3">
                        <SeverityIcon className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: issue.severity === 'critical' ? '#fb7185' : issue.severity === 'warning' ? '#fbbf24' : issue.severity === 'suggestion' ? '#34d399' : '#38bdf8' }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${config.color}`}>
                              {config.label}
                            </span>
                            <span className="text-xs bg-surface-container/50 text-on-surface-variant px-2 py-0.5 rounded-lg border border-outline/10">
                              {issue.category}
                            </span>
                            {issue.line && (
                              <span className="text-xs text-on-surface-variant font-mono">
                                Line {issue.line}
                              </span>
                            )}
                          </div>
                          <p className="text-on-surface text-sm font-medium mb-2">{issue.description}</p>
                          {issue.suggestedFix && (
                            <div className="bg-slate-950/60 rounded-xl p-3 border border-outline/10">
                              <div className="text-xs text-on-surface-variant font-bold mb-1 flex items-center gap-1">
                                <Lightbulb className="w-3 h-3" />
                                Suggested Fix
                              </div>
                              <pre className="text-emerald-400 font-mono text-xs whitespace-pre-wrap leading-relaxed">
                                {issue.suggestedFix}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Explanation Panel */}
            {review.explanation && (
              <div className="glass-card rounded-2xl border border-cyan-500/20 p-5">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-cyan-400 text-xl">auto_awesome</span>
                  <div>
                    <h3 className="font-bold text-on-surface text-sm mb-1">AI Explanation</h3>
                    <p className="text-on-surface-variant text-sm leading-relaxed">{review.explanation}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Review Again button */}
            <div className="flex justify-end">
              <button
                onClick={handleReviewAgain}
                className="flex items-center gap-2 px-5 py-2.5 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface font-bold text-sm hover:bg-surface-container/80 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Review Again
              </button>
            </div>
          </div>
        )}

        {/* ── Improved Code Tab ───────────────────────────────────────────── */}
        {activeTab === 'improved' && review && (
          <div className="space-y-4">
            {/* View Mode Toggle */}
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-on-surface text-xl flex items-center gap-2">
                <span className="material-symbols-outlined text-cyan-400">auto_fix_high</span>
                Improved Code
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCodeViewMode('side-by-side')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    codeViewMode === 'side-by-side'
                      ? 'bg-cyan-600 text-white'
                      : 'bg-surface-container/50 text-on-surface-variant border border-outline/10'
                  }`}
                >
                  <SplitSquareHorizontal className="w-3.5 h-3.5" />
                  Side by Side
                </button>
                <button
                  onClick={() => setCodeViewMode('toggle')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    codeViewMode === 'toggle'
                      ? 'bg-cyan-600 text-white'
                      : 'bg-surface-container/50 text-on-surface-variant border border-outline/10'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Toggle
                </button>
                <button
                  onClick={handleCopyImproved}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface text-xs font-bold hover:bg-surface-container/80 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            {codeViewMode === 'side-by-side' ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Original */}
                <div className="glass-card rounded-2xl border border-outline/20 overflow-hidden">
                  <div className="px-5 py-3 border-b border-outline/10 bg-surface-container/30 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    <span className="font-bold text-on-surface text-sm">Original</span>
                  </div>
                  <pre className="p-5 text-on-surface font-mono text-xs whitespace-pre-wrap leading-relaxed overflow-auto max-h-96 bg-slate-950/60">
                    {code}
                  </pre>
                </div>

                {/* Improved */}
                <div className="glass-card rounded-2xl border border-outline/20 overflow-hidden">
                  <div className="px-5 py-3 border-b border-outline/10 bg-surface-container/30 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="font-bold text-on-surface text-sm">Improved</span>
                  </div>
                  <pre className="p-5 text-emerald-300 font-mono text-xs whitespace-pre-wrap leading-relaxed overflow-auto max-h-96 bg-slate-950/60">
                    {review.improvedCode}
                  </pre>
                </div>
              </div>
            ) : (
              <ImprovedCodeToggle original={code} improved={review.improvedCode} />
            )}
          </div>
        )}

        {/* ── History Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-on-surface text-xl flex items-center gap-2">
                <History className="w-5 h-5 text-cyan-400" />
                Review History
              </h2>
              <button
                onClick={fetchHistory}
                disabled={loadingHistory}
                className="flex items-center gap-2 px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface text-sm font-bold hover:bg-surface-container/80 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loadingHistory ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {loadingHistory ? (
              <div className="glass-card rounded-2xl border border-outline/20 p-12 flex items-center justify-center">
                <span className="material-symbols-outlined text-cyan-400 text-4xl animate-spin">sync</span>
                <span className="ml-3 text-on-surface-variant font-medium">Loading history...</span>
              </div>
            ) : history.length === 0 ? (
              <div className="glass-card rounded-2xl border border-outline/20 p-12 text-center">
                <span className="material-symbols-outlined text-on-surface-variant text-5xl mb-3">history</span>
                <p className="text-on-surface-variant">No reviews yet. Submit your first code review to see it here.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {history.map((item) => (
                  <div key={item.id} className="glass-card rounded-2xl border border-outline/20 p-5 flex items-center gap-4">
                    {/* Score circle */}
                    <div className="relative w-14 h-14 flex-shrink-0">
                      <svg viewBox="0 0 36 36" className="-rotate-90 w-14 h-14">
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1e293b" strokeWidth="3" />
                        <circle
                          cx="18" cy="18" r="15.9" fill="none"
                          stroke={getScoreColor(item.score)}
                          strokeWidth="3"
                          strokeDasharray={`${item.score} 100`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-sm font-black text-on-surface">{item.score}</span>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 uppercase">
                          {item.language}
                        </span>
                        <span className="text-xs bg-surface-container/50 text-on-surface-variant px-2 py-0.5 rounded-lg border border-outline/10">
                          {item.review_type === 'full' ? 'Full Review' : item.review_type}
                        </span>
                        <span className="text-xs text-on-surface-variant">
                          {item.issues_count} issue{item.issues_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {item.code_snippet && (
                        <p className="text-on-surface-variant text-xs font-mono truncate">
                          {item.code_snippet}
                        </p>
                      )}
                    </div>

                    <div className="text-xs text-on-surface-variant text-right whitespace-nowrap">
                      {formatDate(item.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Toggle View Sub-component
// ─────────────────────────────────────────────────────────────────────────────

function ImprovedCodeToggle({ original, improved }) {
  const [showing, setShowing] = useState('improved');

  return (
    <div className="glass-card rounded-2xl border border-outline/20 overflow-hidden">
      <div className="px-5 py-3 border-b border-outline/10 bg-surface-container/30 flex items-center gap-3">
        <button
          onClick={() => setShowing('original')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            showing === 'original'
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-rose-400" />
          Original
        </button>
        <button
          onClick={() => setShowing('improved')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            showing === 'improved'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          Improved
        </button>
      </div>
      <pre className={`p-5 font-mono text-xs whitespace-pre-wrap leading-relaxed overflow-auto max-h-96 bg-slate-950/60 ${
        showing === 'improved' ? 'text-emerald-300' : 'text-on-surface'
      }`}>
        {showing === 'improved' ? improved : original}
      </pre>
    </div>
  );
}
