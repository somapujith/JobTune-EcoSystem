import React, { useState } from 'react';
import { api } from '../store/useAuthStore';
import { CheckCircle2, AlertCircle, TrendingUp } from 'lucide-react';

export default function ATSChecker() {
  const [resume, setResume] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleCheck = async (e) => {
    e.preventDefault();
    if (!resume.trim() || !jobDescription.trim()) {
      setError('Both resume and job description are required');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/jobs/check-ats-score', {
        resume,
        jobDescription
      });
      setResult(data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to check ATS score');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 60) return 'text-blue-600';
    if (score >= 40) return 'text-amber-600';
    return 'text-rose-600';
  };

  const getScoreBg = (score) => {
    if (score >= 80) return 'bg-emerald-50';
    if (score >= 60) return 'bg-blue-50';
    if (score >= 40) return 'bg-amber-50';
    return 'bg-rose-50';
  };

  return (
    <div className="w-full max-w-5xl mx-auto py-16 px-4 sm:px-6">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-slate-900/5 mb-6">
          <span className="material-symbols-outlined text-slate-900 text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>check_circle</span>
        </div>
        <h1 className="text-4xl font-black text-on-surface font-headline mb-4">
          ATS Score Checker
        </h1>
        <p className="text-lg text-on-surface-variant font-medium max-w-2xl mx-auto">
          Check how well your resume matches a job description. Get a score and recommendations for improvement.
        </p>
      </div>

      {error && (
        <div className="max-w-3xl mx-auto mb-6 bg-rose-50 border border-rose-100 p-4 rounded-2xl text-rose-600 text-sm font-medium flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleCheck} className="max-w-3xl mx-auto mb-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 bg-white dark:bg-slate-800 rounded-3xl p-8 border border-slate-100 dark:border-slate-700 shadow-sm">
          {/* Resume Section */}
          <div>
            <label className="block text-sm font-bold text-on-surface mb-3">Your Resume</label>
            <textarea
              value={resume}
              onChange={(e) => setResume(e.target.value)}
              placeholder="Paste your resume text here..."
              rows={12}
              className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-on-surface dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
            <p className="text-xs text-slate-400 mt-2">{resume.length} characters</p>
          </div>

          {/* Job Description Section */}
          <div>
            <label className="block text-sm font-bold text-on-surface mb-3">Job Description</label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the job description here..."
              rows={12}
              className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-on-surface dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
            <p className="text-xs text-slate-400 mt-2">{jobDescription.length} characters</p>
          </div>
        </div>

        <div className="max-w-3xl mx-auto mt-6 text-center">
          <button
            type="submit"
            disabled={loading}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold transition-colors flex items-center gap-3 mx-auto"
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined animate-spin text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
                Checking...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>check_circle</span>
                Check ATS Score
              </>
            )}
          </button>
        </div>
      </form>

      {/* Results */}
      {result && !loading && (
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Score Card */}
          <div className={`${getScoreBg(result.atsScore)} border border-slate-200 dark:border-slate-700 rounded-3xl p-8 text-center`}>
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="text-6xl font-black" style={{ color: result.atsScore >= 80 ? '#10b981' : result.atsScore >= 60 ? '#0ea5e9' : result.atsScore >= 40 ? '#f59e0b' : '#ef4444' }}>
                {result.atsScore}
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-slate-500 uppercase">ATS Score</p>
                <p className={`text-2xl font-black ${getScoreColor(result.atsScore)}`}>
                  {result.scoreLabel}
                </p>
              </div>
            </div>

            {/* Component Scores */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Hard Skills', score: result.hardSkillMatch, icon: '💻' },
                { label: 'Soft Skills', score: result.softSkillMatch, icon: '🤝' },
                { label: 'Experience', score: result.experienceMatch, icon: '📈' }
              ].map(item => (
                <div key={item.label} className="bg-white dark:bg-slate-700 rounded-xl p-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{item.label}</p>
                  <p className="text-2xl font-black text-on-surface">{item.score}%</p>
                </div>
              ))}
            </div>
          </div>

          {/* Matched Keywords */}
          {result.matchedKeywords.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 border border-emerald-200 dark:border-emerald-900">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                <h3 className="text-xl font-bold text-emerald-600">Matched Keywords ({result.matchedKeywords.length})</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {result.matchedKeywords.map(keyword => (
                  <span key={keyword} className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-full text-sm font-semibold">
                    ✓ {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Missing Keywords */}
          {result.missingKeywords.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 border border-rose-200 dark:border-rose-900">
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="w-6 h-6 text-rose-600" />
                <h3 className="text-xl font-bold text-rose-600">Missing Keywords ({result.missingKeywords.length})</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {result.missingKeywords.map(keyword => (
                  <span key={keyword} className="px-3 py-1 bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-300 rounded-full text-sm font-semibold">
                    ✗ {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 border border-amber-200 dark:border-amber-900">
              <div className="flex items-center gap-3 mb-4">
                <TrendingUp className="w-6 h-6 text-amber-600" />
                <h3 className="text-xl font-bold text-amber-600">Recommendations</h3>
              </div>
              <ul className="space-y-3">
                {result.recommendations.map((rec, i) => (
                  <li key={i} className="flex gap-3 text-slate-700 dark:text-slate-300">
                    <span className="text-amber-600 font-bold flex-shrink-0">{i + 1}.</span>
                    <span>{rec}</span>
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
