import React, { useState } from 'react';
import { api } from '../store/useAuthStore';
import GitHubReadmeGenerator from '../components/GitHubReadmeGenerator';

function getScoreColor(score) {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#0ea5e9';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

export default function GitHubOptimizer() {
  const [activeTab, setActiveTab] = useState('analyzer');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [copied, setCopied] = useState(false);

  const validateUsername = (value) => {
    if (!value.trim()) {
      return 'GitHub username is required';
    }
    if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(value)) {
      return 'Invalid GitHub username format';
    }
    return '';
  };

  const handleUsernameChange = (e) => {
    const value = e.target.value;
    setUsername(value);
    setValidationError(validateUsername(value));
  };

  const handleAnalyze = async (e) => {
    e.preventDefault();
    const validation = validateUsername(username);
    if (validation) {
      setValidationError(validation);
      return;
    }
    setLoading(true);
    setError('');
    setReport(null);
    try {
      const { data } = await api.post('/profiles/github/analyze', { username });
      setReport(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!report?.generatedReadme) return;
    navigator.clipboard.writeText(report.generatedReadme);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-6xl mx-auto py-16 px-4 sm:px-6">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-slate-900/5 mb-6">
          <span className="material-symbols-outlined text-slate-900 text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>code</span>
        </div>
        <h1 className="text-4xl font-black text-on-surface font-headline mb-4">
          GitHub Profile Optimizer
        </h1>
        <p className="text-lg text-on-surface-variant font-medium max-w-2xl mx-auto">
          Analyze your GitHub profile or create a custom README from scratch.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-4 mb-12 justify-center border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('analyzer')}
          className={`px-6 py-3 font-semibold transition-all border-b-2 ${
            activeTab === 'analyzer'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          📊 Analyzer
        </button>
        <button
          onClick={() => setActiveTab('generator')}
          className={`px-6 py-3 font-semibold transition-all border-b-2 ${
            activeTab === 'generator'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          ✏️ Generator
        </button>
      </div>

      {/* Analyzer Tab */}
      {activeTab === 'analyzer' && (
        <>
          {error && (
            <div className="max-w-2xl mx-auto mb-6 glass-card border-rose-200/50 p-4 rounded-2xl text-rose-600 text-sm font-medium">
              {error}
            </div>
          )}

          {validationError && (
            <div className="max-w-2xl mx-auto mb-6 glass-card border-rose-200/50 p-4 rounded-2xl text-rose-600 text-sm font-medium">
              {validationError}
            </div>
          )}

          <form onSubmit={handleAnalyze} className="max-w-2xl mx-auto mb-16">
        <div className="relative glass-card rounded-3xl p-2 shadow-lg">
          <div className="flex items-center gap-4 p-4">
            <div className="w-12 h-12 rounded-2xl glass-card flex items-center justify-center">
              <span className="material-symbols-outlined text-slate-900 text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>person</span>
            </div>
            <input
              type="text"
              placeholder="Enter your GitHub username"
              className={`flex-1 bg-transparent outline-none font-medium text-on-surface placeholder:text-outline text-lg ${validationError ? 'border-b-2 border-red-500' : ''}`}
              value={username}
              onChange={handleUsernameChange}
            />
            <button
              type="submit"
              disabled={loading || !!validationError}
              className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700/50 text-white px-8 py-3 rounded-2xl font-bold hover:from-slate-700 hover:to-slate-800 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100 shadow-[0px_10px_30px_rgba(15,23,42,0.3)] flex items-center gap-3"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
                  Analyzing...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>search</span>
                  Analyze Profile
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {loading && (
        <div className="max-w-2xl mx-auto text-center py-12">
          <div className="inline-flex flex-col items-center gap-4">
            <span className="material-symbols-outlined animate-spin text-slate-700 text-5xl" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
            <p className="text-on-surface-variant font-medium">Fetching real GitHub data and generating custom README...</p>
          </div>
        </div>
      )}

      {report && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-8">
            {/* Profile Health Score */}
            <div className="glass-card p-8 rounded-3xl text-center">
              <div className="relative mb-6">
                <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90 mx-auto">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5eeff" strokeWidth="3.2" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none"
                    stroke={getScoreColor(report.score)}
                    strokeWidth="3.2"
                    strokeDasharray={`${(report.score / 100) * 100} 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-black text-on-surface">{report.score}</span>
                  <span className="text-xs text-on-surface-variant font-bold">/ 100</span>
                </div>
              </div>
              <div
                className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-3"
                style={{ backgroundColor: `${getScoreColor(report.score)}20`, color: getScoreColor(report.score) }}
              >
                {report.scoreLabel || 'Profile Score'}
              </div>
              <h3 className="text-xl font-bold text-on-surface mb-2 font-headline">Profile Health</h3>
              {report.scoreDescription && (
                <p className="text-on-surface-variant text-sm font-medium">{report.scoreDescription}</p>
              )}
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="glass-card bg-surface-container/30 p-4 rounded-2xl text-center">
                  <span className="material-symbols-outlined text-outline text-xl mb-2 block" style={{ fontVariationSettings: "'FILL' 0" }}>account_tree</span>
                  <div className="font-black text-2xl text-on-surface">{report.repoCount}</div>
                  <div className="text-xs font-bold text-outline uppercase tracking-wider">Repos</div>
                </div>
                <div className="glass-card bg-surface-container/30 p-4 rounded-2xl text-center">
                  <span className="material-symbols-outlined text-amber-500 text-xl mb-2 block" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <div className="font-black text-2xl text-on-surface">{report.stars}</div>
                  <div className="text-xs font-bold text-outline uppercase tracking-wider">Stars</div>
                </div>
              </div>
              {report.languages && report.languages.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                  {report.languages.slice(0, 6).map((lang, i) => (
                    <span key={i} className="px-2 py-1 glass-card bg-surface-container/30 rounded-lg text-xs font-bold text-on-surface-variant">
                      {lang}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Strengths */}
            {report.strengths && report.strengths.length > 0 && (
              <div className="glass-card p-8 rounded-3xl">
                <h3 className="text-xl font-bold text-emerald-600 mb-6 flex items-center gap-3 font-headline">
                  <span className="material-symbols-outlined text-emerald-500 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  Strengths
                </h3>
                <ul className="space-y-4">
                  {report.strengths.map((s, i) => (
                    <li key={i} className="text-on-surface-variant font-medium flex gap-3 items-start">
                      <span className="w-2 h-2 mt-2 rounded-full bg-emerald-500 flex-shrink-0"></span>
                      <span className="text-sm leading-relaxed">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Critical Issues */}
            {report.issues && report.issues.length > 0 && (
              <div className="glass-card p-8 rounded-3xl">
                <h3 className="text-xl font-bold text-rose-600 mb-6 flex items-center gap-3 font-headline">
                  <span className="material-symbols-outlined text-rose-500 text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>warning</span>
                  Improvements
                </h3>
                <ul className="space-y-4">
                  {report.issues.map((iss, i) => (
                    <li key={i} className="text-on-surface-variant font-medium flex gap-3 items-start">
                      <span className="w-2 h-2 mt-2 rounded-full bg-rose-500 flex-shrink-0"></span>
                      <span className="text-sm leading-relaxed">{iss}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Generated README */}
          <div className="lg:col-span-2">
            <div className="glass-card border-slate-700/50 rounded-3xl shadow-[0px_25px_50px_rgba(15,23,42,0.25)] overflow-hidden flex flex-col" style={{ minHeight: '500px' }}>
              <div className="glass-panel border-b border-white/20 bg-slate-800/50 px-8 py-6 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-slate-400 text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>description</span>
                  <div>
                    <h3 className="text-white font-bold text-lg">Generated Profile README.md</h3>
                    <p className="text-slate-400 text-sm">AI-generated from your real GitHub data</p>
                  </div>
                </div>
                <button
                  onClick={handleCopy}
                  className="glass-card hover:bg-white/10 text-white px-4 py-2 rounded-xl font-medium transition-colors flex items-center gap-2 border border-slate-600/50"
                >
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>
                    {copied ? 'check' : 'content_copy'}
                  </span>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="p-8 overflow-y-auto flex-grow">
                <pre className="text-slate-300 font-mono text-sm whitespace-pre-wrap leading-relaxed">
                  {report.generatedReadme || 'No README generated.'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
      )}

      {/* Generator Tab */}
      {activeTab === 'generator' && (
        <GitHubReadmeGenerator />
      )}
    </div>
  );
}
