import React, { useState } from 'react';
import { api } from '../store/useAuthStore';

function getScoreColor(score) {
  if (score >= 80) return '#10b981'; // emerald
  if (score >= 60) return '#0ea5e9'; // sky
  if (score >= 40) return '#f59e0b'; // amber
  return '#ef4444'; // red
}

function getScoreRingColor(score) {
  if (score >= 80) return 'stroke-emerald-500';
  if (score >= 60) return 'stroke-sky-500';
  if (score >= 40) return 'stroke-amber-500';
  return 'stroke-red-500';
}

export default function LinkedInOptimizer() {
  const [formData, setFormData] = useState({
    headline: '',
    about: '',
    skills: '',
    experienceCount: 0,
    yearsOfExperience: 0,
    connections: 'lt100',
    hasPhoto: false,
    hasFeatured: false
  });
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  const handleAnalyze = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setReport(null);
    try {
      const { data } = await api.post('/profiles/linkedin/analyze', formData);
      setReport(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto py-16 px-4 sm:px-6">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-sky-500/5 mb-6">
          <span className="material-symbols-outlined text-sky-600 text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>group</span>
        </div>
        <h1 className="text-4xl font-black text-on-surface font-headline mb-4">
          LinkedIn Profile Optimizer
        </h1>
        <p className="text-lg text-on-surface-variant font-medium max-w-2xl mx-auto">
          Fill in your profile details for an instant score and actionable suggestions — no AI, no scraping required.
        </p>
      </div>

      {error && (
        <div className="max-w-3xl mx-auto mb-6 glass-card border-rose-200/50 p-4 rounded-2xl text-rose-600 text-sm font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleAnalyze} className="max-w-3xl mx-auto mb-16 space-y-4">
        <div className="glass-card rounded-3xl p-6 space-y-4">
          
          <div>
            <label className="block text-sm font-bold text-on-surface mb-1">Headline</label>
            <input
              type="text"
              maxLength={220}
              placeholder="e.g. Software Engineer | React & Node.js"
              className="w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-2 font-medium text-on-surface placeholder:text-outline/50 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              value={formData.headline}
              onChange={e => setFormData({...formData, headline: e.target.value})}
            />
            <div className="text-right text-xs text-outline mt-1">{formData.headline.length}/220</div>
          </div>

          <div>
            <label className="block text-sm font-bold text-on-surface mb-1">About / Summary</label>
            <textarea
              rows={5}
              placeholder="Write your LinkedIn summary here..."
              className="w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-2 font-medium text-on-surface placeholder:text-outline/50 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 resize-y"
              value={formData.about}
              onChange={e => setFormData({...formData, about: e.target.value})}
            />
            <div className="text-right text-xs text-outline mt-1">{formData.about.split(/\s+/).filter(Boolean).length} words</div>
          </div>

          <div>
            <label className="block text-sm font-bold text-on-surface mb-1">Skills</label>
            <input
              type="text"
              placeholder="React, Node.js, Python..."
              className="w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-2 font-medium text-on-surface placeholder:text-outline/50 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              value={formData.skills}
              onChange={e => setFormData({...formData, skills: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-on-surface mb-1">Work/Project Experiences</label>
              <input
                type="number"
                min={0}
                max={20}
                className="w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-2 font-medium text-on-surface focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                value={formData.experienceCount}
                onChange={e => setFormData({...formData, experienceCount: Number(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-on-surface mb-1">Years of Experience</label>
              <input
                type="number"
                min={0}
                max={50}
                step={0.5}
                className="w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-2 font-medium text-on-surface focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                value={formData.yearsOfExperience}
                onChange={e => setFormData({...formData, yearsOfExperience: Number(e.target.value)})}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-on-surface mb-1">Connections</label>
            <select
              className="w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-2 font-medium text-on-surface focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              value={formData.connections}
              onChange={e => setFormData({...formData, connections: e.target.value})}
            >
              <option value="lt100">Less than 100</option>
              <option value="100to500">100 - 500</option>
              <option value="500plus">500+</option>
            </select>
          </div>

          <div className="flex flex-col sm:flex-row gap-6 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-5 h-5 rounded text-sky-600 focus:ring-sky-500 bg-surface-container border-outline/20"
                checked={formData.hasPhoto}
                onChange={e => setFormData({...formData, hasPhoto: e.target.checked})}
              />
              <span className="text-sm font-bold text-on-surface">Has Profile Photo</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-5 h-5 rounded text-sky-600 focus:ring-sky-500 bg-surface-container border-outline/20"
                checked={formData.hasFeatured}
                onChange={e => setFormData({...formData, hasFeatured: e.target.checked})}
              />
              <span className="text-sm font-bold text-on-surface">Has Featured Section</span>
            </label>
          </div>
          
          <div className="pt-6 border-t border-outline/10">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-sky-500 to-sky-600 text-white px-8 py-3 rounded-xl font-bold hover:from-sky-600 hover:to-sky-700 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100 shadow-lg flex items-center justify-center gap-3"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
                  Analyzing...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>analytics</span>
                  Analyze Profile
                </>
              )}
            </button>
          </div>

        </div>
      </form>

      {loading && (
        <div className="max-w-3xl mx-auto text-center py-12">
          <div className="inline-flex flex-col items-center gap-4">
            <span className="material-symbols-outlined animate-spin text-sky-500 text-5xl" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
            <p className="text-on-surface-variant font-medium">AI is analyzing your LinkedIn profile...</p>
          </div>
        </div>
      )}

      {report && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Profile Score Card */}
          <div className="glass-card p-8 rounded-3xl flex flex-col items-center justify-center text-center">
            <div className="relative mb-8">
              <svg viewBox="0 0 36 36" className="w-32 h-32 -rotate-90 mx-auto">
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
                <span className="text-4xl font-black text-on-surface">{report.score}</span>
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">/ 100</span>
              </div>
            </div>
            <div
              className="inline-block px-4 py-1 rounded-full text-sm font-bold mb-3"
              style={{ backgroundColor: `${getScoreColor(report.score)}20`, color: getScoreColor(report.score) }}
            >
              {report.scoreLabel || 'Profile Score'}
            </div>
            <h3 className="text-2xl font-bold text-on-surface mb-3 font-headline">Profile Score</h3>
            <p className="text-on-surface-variant font-medium">
              {report.scoreDescription || 'See the breakdown below for actionable improvements.'}
            </p>
          </div>

          {/* Metrics Breakdown */}
          <div className="glass-card p-8 rounded-3xl">
            <h3 className="text-xl font-bold text-on-surface mb-8 flex items-center gap-3 font-headline">
              <span className="material-symbols-outlined text-sky-600 text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>bar_chart</span>
              Metrics Breakdown
            </h3>
            <div className="space-y-6">
              {report.metrics.map((m, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm font-bold mb-3">
                    <span className="text-on-surface">{m.label}</span>
                    <span className="font-black" style={{ color: getScoreColor(m.val) }}>{m.val}/100</span>
                  </div>
                  <div className="w-full bg-surface-container/50 h-3 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${m.val}%`,
                        backgroundColor: getScoreColor(m.val)
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Suggestions */}
          <div className="lg:col-span-2 glass-card border-sky-500/20 p-8 rounded-3xl">
            <h3 className="text-xl font-bold text-sky-700 mb-8 flex items-center gap-3 font-headline">
              <span className="material-symbols-outlined text-sky-600 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>lightbulb</span>
              AI-Powered Suggestions
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {report.suggestions.map((s, i) => (
                <div key={i} className="glass-card p-6 rounded-2xl flex gap-4 items-start">
                  <span className="material-symbols-outlined text-sky-600 text-lg mt-1 flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <p className="text-on-surface font-medium leading-relaxed">{s}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
