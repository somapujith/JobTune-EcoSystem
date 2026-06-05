import React, { useState } from 'react';
import { api } from '../store/useAuthStore';
import { AlertCircle, Code2, Briefcase, Users } from 'lucide-react';

export default function JobAnalyzer() {
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!jobDescription.trim()) {
      setError('Job description is required');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/jobs/analyze-description', {
        jobDescription
      });
      setResult(data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to analyze job description');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto py-16 px-4 sm:px-6">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-slate-900/5 mb-6">
          <span className="material-symbols-outlined text-slate-900 text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>work</span>
        </div>
        <h1 className="text-4xl font-black text-on-surface font-headline mb-4">
          Job Description Analyzer
        </h1>
        <p className="text-lg text-on-surface-variant font-medium max-w-2xl mx-auto">
          Paste a job description to extract skills, experience requirements, and key responsibilities.
        </p>
      </div>

      {error && (
        <div className="max-w-3xl mx-auto mb-6 bg-rose-50 border border-rose-100 p-4 rounded-2xl text-rose-600 text-sm font-medium flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleAnalyze} className="max-w-3xl mx-auto mb-12">
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 border border-slate-100 dark:border-slate-700 shadow-sm">
          <label className="block text-sm font-bold text-on-surface mb-3">Job Description</label>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the complete job posting here..."
            rows={12}
            className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-on-surface dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
          />
          <p className="text-xs text-slate-400 mt-2">{jobDescription.length} characters</p>
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
                Analyzing...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>analytics</span>
                Analyze Job Description
              </>
            )}
          </button>
        </div>
      </form>

      {/* Results */}
      {result && !loading && (
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Seniority & Experience */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-6 border border-blue-200 dark:border-blue-700">
              <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase mb-2">Seniority Level</p>
              <p className="text-2xl font-black text-blue-700 dark:text-blue-300">{result.seniority}</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-2xl p-6 border border-purple-200 dark:border-purple-700">
              <p className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase mb-2">Experience</p>
              <p className="text-lg font-black text-purple-700 dark:text-purple-300">{result.experienceLevel}</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-6 border border-amber-200 dark:border-amber-700">
              <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase mb-2">Salary Range</p>
              <p className="text-lg font-black text-amber-700 dark:text-amber-300">{result.salaryRange}</p>
            </div>
          </div>

          {/* Required Skills */}
          {result.requiredSkills.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 border border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3 mb-4">
                <Code2 className="w-6 h-6 text-emerald-600" />
                <h3 className="text-xl font-bold text-on-surface">Required Skills</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {result.requiredSkills.map(skill => (
                  <span key={skill} className="px-4 py-2 bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-full font-semibold text-sm">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Nice-to-Have Skills */}
          {result.niceToHaveSkills.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 border border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3 mb-4">
                <Code2 className="w-6 h-6 text-blue-600" />
                <h3 className="text-xl font-bold text-on-surface">Nice-to-Have Skills</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {result.niceToHaveSkills.map(skill => (
                  <span key={skill} className="px-4 py-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full font-semibold text-sm">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Responsibilities */}
          {result.responsibilities.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 border border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3 mb-4">
                <Briefcase className="w-6 h-6 text-purple-600" />
                <h3 className="text-xl font-bold text-on-surface">Key Responsibilities</h3>
              </div>
              <ul className="space-y-2">
                {result.responsibilities.map((resp, i) => (
                  <li key={i} className="flex gap-3 text-slate-700 dark:text-slate-300">
                    <span className="text-purple-600 font-bold flex-shrink-0">•</span>
                    <span>{resp}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Keywords */}
          {result.keywords.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 border border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3 mb-4">
                <Users className="w-6 h-6 text-blue-600" />
                <h3 className="text-xl font-bold text-on-surface">Key Concepts & Tools</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {result.keywords.map(keyword => (
                  <span key={keyword} className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium">
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
