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
    <div className="page-container">
      <div className="mb-12">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 mb-4">
          <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>work</span>
        </div>
        <h1 className="page-title">
          Job Description Matcher
        </h1>
        <p className="page-subtitle">
          Paste a job description and your skills to instantly see how well you match and identify your skill gaps.
        </p>
      </div>

      {error && (
        <div className="mb-6 error-banner">
          {error}
        </div>
      )}

      <form onSubmit={handleAnalyze} className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <div className="card rounded-2xl p-6">
          <label className="input-label">Job Description</label>
          <textarea
            required
            rows={10}
            placeholder="Paste the target job description here..."
            className="input-field resize-y"
            value={formData.jobDescription}
            onChange={e => setFormData({...formData, jobDescription: e.target.value})}
          />
        </div>
        <div className="card rounded-2xl p-6 flex flex-col">
          <label className="input-label">Your Skills</label>
          <textarea
            required
            rows={6}
            placeholder="E.g., React, Node.js, TypeScript, SQL..."
            className="input-field resize-y flex-1 mb-4"
            value={formData.userSkills}
            onChange={e => setFormData({...formData, userSkills: e.target.value})}
          />
          <button
            type="submit"
            disabled={loading}
            className="btn-gradient bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 w-full flex items-center justify-center gap-3"
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
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="card rounded-2xl p-8 text-center flex flex-col items-center">
            <div className="relative mb-6">
              <svg viewBox="0 0 36 36" className="w-32 h-32 -rotate-90 mx-auto">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5eeff" strokeWidth="3.2" className="dark:stroke-slate-700" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke={getScoreColor(report.matchScore)}
                  strokeWidth="3.2"
                  strokeDasharray={`${(report.matchScore / 100) * 100} 100`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-extrabold text-slate-900 dark:text-white">{report.matchScore}</span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">/ 100</span>
              </div>
            </div>
            <div
              className="inline-block px-4 py-1 rounded-full text-sm font-bold mb-3"
              style={{ backgroundColor: `${getScoreColor(report.matchScore)}20`, color: getScoreColor(report.matchScore) }}
            >
              {report.matchLabel}
            </div>
            <p className="text-slate-500 dark:text-slate-400 font-medium">
              You matched {report.totalMatched} out of {report.totalJdKeywords} key skills found in this job description.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card rounded-2xl p-6">
              <h3 className="text-lg font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                Matched Skills
              </h3>
              <div className="flex flex-wrap gap-2">
                {report.matchedKeywords.length > 0 ? report.matchedKeywords.map((kw, i) => (
                  <span key={i} className="px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-bold text-sm rounded-lg border border-emerald-200 dark:border-emerald-800">
                    {kw}
                  </span>
                )) : <span className="text-sm font-medium text-slate-500 dark:text-slate-400">No matching skills found.</span>}
              </div>
            </div>

            <div className="card rounded-2xl p-6">
              <h3 className="text-lg font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>cancel</span>
                Missing Skills (Gaps)
              </h3>
              <div className="flex flex-wrap gap-2">
                {report.missingKeywords.length > 0 ? report.missingKeywords.map((kw, i) => (
                  <span key={i} className="px-3 py-1 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 font-bold text-sm rounded-lg border border-rose-200 dark:border-rose-800">
                    {kw}
                  </span>
                )) : <span className="text-sm font-medium text-slate-500 dark:text-slate-400">No gaps identified!</span>}
              </div>
            </div>
          </div>

          {Object.keys(report.gapsByCategory).length > 0 && (
            <div className="card rounded-2xl p-8">
              <h3 className="section-title">Gaps by Category</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {Object.entries(report.gapsByCategory).map(([category, kws]) => (
                  <div key={category} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl">
                    <h4 className="font-bold text-slate-900 dark:text-white capitalize mb-3">{category}</h4>
                    <div className="flex flex-wrap gap-2">
                      {kws.map((kw, i) => (
                        <span key={i} className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium text-xs rounded-md">
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
            <div className="card rounded-2xl bg-indigo-50/50 dark:bg-indigo-900/20 border-indigo-200/50 dark:border-indigo-800/50 p-8">
              <h3 className="section-title text-indigo-700 dark:text-indigo-400 flex items-center gap-3">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>tips_and_updates</span>
                How to Improve
              </h3>
              <ul className="space-y-3">
                {report.suggestions.map((s, i) => (
                  <li key={i} className="flex gap-3 text-indigo-900 dark:text-indigo-200 font-medium">
                    <span className="material-symbols-outlined text-indigo-500 dark:text-indigo-400 shrink-0">arrow_right</span>
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
