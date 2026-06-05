import React, { useState } from 'react';
import { api } from '../store/useAuthStore';

function getScoreColor(score) {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#0ea5e9';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

export default function JobMatcher() {
  const [formData, setFormData] = useState({
    jobDescription: '',
    userSkills: ''
  });
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!formData.jobDescription || !formData.userSkills) return;
    setLoading(true);
    setError('');
    setReport(null);
    try {
      const { data } = await api.post('/profiles/jobmatch', formData);
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
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-indigo-500/5 mb-6">
          <span className="material-symbols-outlined text-indigo-600 text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>work</span>
        </div>
        <h1 className="text-4xl font-black text-on-surface font-headline mb-4">
          Job Description Matcher
        </h1>
        <p className="text-lg text-on-surface-variant font-medium max-w-2xl mx-auto">
          Paste a job description and your skills to instantly see how well you match and identify your skill gaps.
        </p>
      </div>

      {error && (
        <div className="max-w-3xl mx-auto mb-6 glass-card border-rose-200/50 p-4 rounded-2xl text-rose-600 text-sm font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleAnalyze} className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-12">
        <div className="glass-card p-6 rounded-3xl">
          <label className="block text-sm font-bold text-on-surface mb-2">Job Description</label>
          <textarea
            required
            rows={10}
            placeholder="Paste the target job description here..."
            className="w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-3 font-medium text-on-surface focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-y"
            value={formData.jobDescription}
            onChange={e => setFormData({...formData, jobDescription: e.target.value})}
          />
        </div>
        <div className="glass-card p-6 rounded-3xl flex flex-col">
          <label className="block text-sm font-bold text-on-surface mb-2">Your Skills</label>
          <textarea
            required
            rows={6}
            placeholder="E.g., React, Node.js, TypeScript, SQL..."
            className="w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-3 font-medium text-on-surface focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-y flex-1 mb-4"
            value={formData.userSkills}
            onChange={e => setFormData({...formData, userSkills: e.target.value})}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 text-on-primary px-8 py-3 rounded-xl font-bold hover:from-indigo-600 hover:to-indigo-700 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100 shadow-[0px_10px_20px_rgba(99,102,241,0.3)] flex items-center justify-center gap-3"
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined animate-spin text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
                Matching...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>join_inner</span>
                Calculate Match Score
              </>
            )}
          </button>
        </div>
      </form>

      {report && !loading && (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="glass-card p-8 rounded-3xl text-center flex flex-col items-center">
            <div className="relative mb-6">
              <svg viewBox="0 0 36 36" className="w-32 h-32 -rotate-90 mx-auto">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5eeff" strokeWidth="3.2" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke={getScoreColor(report.matchScore)}
                  strokeWidth="3.2"
                  strokeDasharray={`${(report.matchScore / 100) * 100} 100`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-black text-on-surface">{report.matchScore}</span>
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">/ 100</span>
              </div>
            </div>
            <div
              className="inline-block px-4 py-1 rounded-full text-sm font-bold mb-3"
              style={{ backgroundColor: `${getScoreColor(report.matchScore)}20`, color: getScoreColor(report.matchScore) }}
            >
              {report.matchLabel}
            </div>
            <p className="text-on-surface-variant font-medium">
              You matched {report.totalMatched} out of {report.totalJdKeywords} key skills found in this job description.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="glass-card p-6 rounded-3xl border-emerald-500/20">
              <h3 className="text-lg font-bold text-emerald-600 flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                Matched Skills
              </h3>
              <div className="flex flex-wrap gap-2">
                {report.matchedKeywords.length > 0 ? report.matchedKeywords.map((kw, i) => (
                  <span key={i} className="px-3 py-1 bg-emerald-50 text-emerald-700 font-bold text-sm rounded-lg border border-emerald-200">
                    {kw}
                  </span>
                )) : <span className="text-sm font-medium text-on-surface-variant">No matching skills found.</span>}
              </div>
            </div>

            <div className="glass-card p-6 rounded-3xl border-rose-500/20">
              <h3 className="text-lg font-bold text-rose-600 flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>cancel</span>
                Missing Skills (Gaps)
              </h3>
              <div className="flex flex-wrap gap-2">
                {report.missingKeywords.length > 0 ? report.missingKeywords.map((kw, i) => (
                  <span key={i} className="px-3 py-1 bg-rose-50 text-rose-700 font-bold text-sm rounded-lg border border-rose-200">
                    {kw}
                  </span>
                )) : <span className="text-sm font-medium text-on-surface-variant">No gaps identified!</span>}
              </div>
            </div>
          </div>

          {Object.keys(report.gapsByCategory).length > 0 && (
            <div className="glass-card p-8 rounded-3xl">
              <h3 className="text-xl font-bold text-on-surface mb-6 font-headline">Gaps by Category</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {Object.entries(report.gapsByCategory).map(([category, kws]) => (
                  <div key={category} className="bg-surface-container p-4 rounded-2xl">
                    <h4 className="font-bold text-on-surface capitalize mb-3">{category}</h4>
                    <div className="flex flex-wrap gap-2">
                      {kws.map((kw, i) => (
                        <span key={i} className="px-2 py-1 bg-surface-container-highest text-on-surface-variant font-medium text-xs rounded-md">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.suggestions && report.suggestions.length > 0 && (
            <div className="glass-card bg-indigo-50/50 border-indigo-200/50 p-8 rounded-3xl">
              <h3 className="text-xl font-bold text-indigo-700 mb-6 flex items-center gap-3 font-headline">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>tips_and_updates</span>
                How to Improve
              </h3>
              <ul className="space-y-3">
                {report.suggestions.map((s, i) => (
                  <li key={i} className="flex gap-3 text-indigo-900 font-medium">
                    <span className="material-symbols-outlined text-indigo-500 shrink-0">arrow_right</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}