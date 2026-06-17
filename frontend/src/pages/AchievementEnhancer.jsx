import React, { useState } from 'react';
import { api } from '../store/useAuthStore';
import { Copy, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';

export default function AchievementEnhancer() {
  const [achievements, setAchievements] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const handleEnhance = async (e) => {
    e.preventDefault();
    if (!achievements.trim()) {
      setError('Please enter at least one achievement.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/jobs/achievement-enhancer/enhance', {
        achievements,
        role,
      });
      setResult(data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to enhance achievements');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleCopyAll = () => {
    if (!result?.bullets?.length) return;
    navigator.clipboard.writeText(result.bullets.map((b) => `• ${b}`).join('\n'));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const loadTestData = () => {
    setAchievements('Created Attendance System\nHelped onboard new team members\nMade a dashboard for sales');
    setRole('Software Engineer');
    setResult(null);
    setError('');
  };

  return (
    <div className="w-full max-w-5xl mx-auto py-16 px-4 sm:px-6">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-slate-900/5 mb-6">
          <span className="material-symbols-outlined text-slate-900 text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>auto_awesome</span>
        </div>
        <h1 className="text-4xl font-black text-on-surface font-headline mb-4">
          Achievement Enhancer
        </h1>
        <p className="text-lg text-on-surface-variant font-medium max-w-2xl mx-auto">
          Turn plain achievements into polished, impact-driven resume bullets.
        </p>
      </div>

      {/* How It Works Guide */}
      <div className="max-w-5xl mx-auto mb-12 glass-card border-emerald-200/50 rounded-3xl p-8">
        <h3 className="text-xl font-bold text-on-surface mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-emerald-600">info</span>
          How It Works
        </h3>
        <div className="space-y-3 text-slate-700 dark:text-slate-300">
          <p><strong>1. List your achievements</strong> — one per line. They can be rough, e.g. "Created Attendance System".</p>
          <p><strong>2. (Optional) Add your target role</strong> to tailor the phrasing.</p>
          <p><strong>3. Enhance</strong> — each line becomes a professional resume bullet starting with a strong action verb and conveying impact.</p>
        </div>
      </div>

      {error && (
        <div className="max-w-3xl mx-auto mb-6 glass-card border-rose-200/50 p-4 rounded-2xl text-rose-600 text-sm font-medium flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Form Section */}
        <form onSubmit={handleEnhance} className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-on-surface mb-2">Target Role / Context</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g., Software Engineer (optional)"
              className="w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-on-surface mb-2">Your Achievements * (one per line)</label>
            <textarea
              value={achievements}
              onChange={(e) => setAchievements(e.target.value)}
              placeholder={'Created Attendance System\nHelped onboard new team members'}
              rows={8}
              className="w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-3"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
                  Enhancing...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Enhance Achievements
                </>
              )}
            </button>
            <button
              type="button"
              onClick={loadTestData}
              className="px-8 py-3 glass-card hover:bg-white/40 text-on-surface rounded-xl font-bold transition-all flex items-center justify-center gap-3"
            >
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>dataset</span>
              Load Test Data
            </button>
          </div>
        </form>

        {/* Results Display */}
        <div className="h-full">
          {result ? (
            <div className="glass-card rounded-3xl p-8 h-full flex flex-col">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-bold text-on-surface">
                  Enhanced Bullets <span className="text-sm font-normal text-slate-400">({result.count})</span>
                </h3>
                <button
                  onClick={handleCopyAll}
                  className="px-3 py-1.5 text-sm font-medium hover:bg-surface-container/50 rounded-lg transition-colors flex items-center gap-1.5"
                  title="Copy all"
                >
                  {copiedAll ? (
                    <><CheckCircle className="w-4 h-4 text-emerald-600" /> Copied</>
                  ) : (
                    <><Copy className="w-4 h-4 text-slate-600" /> Copy all</>
                  )}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3">
                {result.results.map((item, idx) => (
                  <div key={idx} className="group bg-surface-container/40 rounded-2xl p-4 border border-outline/10">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                        {item.enhanced}
                      </p>
                      <button
                        onClick={() => handleCopy(item.enhanced, idx)}
                        className="p-1.5 hover:bg-surface-container/70 rounded-lg transition-colors flex-shrink-0"
                        title="Copy"
                      >
                        {copiedIdx === idx ? (
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4 text-slate-500" />
                        )}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-slate-400 italic">From: {item.original}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-400">
                  {result.source === 'ai' ? 'AI-enhanced' : 'Rule-based'} · Generated at {new Date(result.generatedAt).toLocaleString()}
                </p>
              </div>
            </div>
          ) : (
            <div className="glass-card bg-surface-container/30 rounded-3xl p-8 h-full flex items-center justify-center border-2 border-dashed border-outline/20">
              <p className="text-center text-slate-500 dark:text-slate-400">
                Enter your achievements and click "Enhance Achievements" to see polished resume bullets here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
