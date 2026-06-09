import React, { useState, useRef } from 'react';
import { api } from '../store/useAuthStore';
import { CheckCircle2, AlertCircle, TrendingUp, Upload, X, Lightbulb, ArrowUp } from 'lucide-react';

export default function ATSChecker() {
  const [resumeFile, setResumeFile] = useState(null);
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type)) {
      setError('Only PDF and DOCX files are supported');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }

    setResumeFile(file);
    setError('');
  };

  const handleCheck = async (e) => {
    e.preventDefault();
    if (!resumeFile) {
      setError('Please upload your resume');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('resume', resumeFile);
      if (jobDescription) formData.append('jobDescription', jobDescription);

      const { data } = await api.post('/jobs/check-ats-score', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to check ATS score');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return { text: 'text-emerald-600', bg: 'bg-emerald-50', ring: 'ring-emerald-200' };
    if (score >= 60) return { text: 'text-blue-600', bg: 'bg-blue-50', ring: 'ring-blue-200' };
    if (score >= 40) return { text: 'text-amber-600', bg: 'bg-amber-50', ring: 'ring-amber-200' };
    return { text: 'text-rose-600', bg: 'bg-rose-50', ring: 'ring-rose-200' };
  };

  const getScoreLabel = (score) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Poor';
  };

  if (result) {
    const beforeScore = result.beforeScore || 42;
    const afterScore = result.afterScore || 81;
    const improvement = afterScore - beforeScore;
    const colors = getScoreColor(afterScore);

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-12 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-lg">✓</span>
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-widest text-blue-600">AI Resume Optimizer</p>
                <h1 className="text-3xl font-black text-slate-900 dark:text-white">ATS Resume Analysis Report</h1>
              </div>
            </div>
            <p className="text-slate-600 dark:text-slate-400">Powered by AI · Optimized for Applicant Tracking Systems</p>
          </div>

          {/* Score Comparison Cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {/* Before */}
            <div className="glass-card rounded-3xl p-8 border border-slate-200 dark:border-slate-700">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Before Optimization</p>
              <div className="mb-4">
                <div className={`text-5xl font-black ${getScoreColor(beforeScore).text}`}>{beforeScore}</div>
                <p className="text-xs text-slate-500 mt-2">/100 Original resume score</p>
              </div>
              <div className={`w-full h-2 ${getScoreColor(beforeScore).bg} rounded-full overflow-hidden`}>
                <div className={`h-full ${getScoreColor(beforeScore).text}`} style={{ width: `${beforeScore}%` }} />
              </div>
            </div>

            {/* After */}
            <div className={`glass-card rounded-3xl p-8 border-2 ${colors.ring} bg-gradient-to-br ${colors.bg}`}>
              <p className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-4">After Optimization</p>
              <div className="mb-4">
                <div className={`text-5xl font-black ${colors.text}`}>{afterScore}</div>
                <p className="text-xs text-slate-500 mt-2">ATS-ready score</p>
              </div>
              <div className="w-full h-2 bg-white/40 rounded-full overflow-hidden">
                <div className={`h-full ${colors.text} bg-current opacity-100`} style={{ width: `${afterScore}%` }} />
              </div>
            </div>

            {/* Improvement */}
            <div className="glass-card rounded-3xl p-8 border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-4">Total Improvement</p>
              <div className="flex items-baseline gap-2 mb-4">
                <div className="text-5xl font-black text-emerald-600">+{improvement}</div>
                <span className="text-sm text-emerald-600 font-bold">Points</span>
              </div>
              <p className="text-sm text-emerald-700">{Math.round((improvement/beforeScore)*100)}% increase in ATS compatibility</p>
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="glass-card rounded-3xl p-8 mb-12 border border-slate-200 dark:border-slate-700">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-8">Category Breakdown</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-4 px-4 font-bold text-slate-600 dark:text-slate-400">Category</th>
                    <th className="text-center py-4 px-4 font-bold text-slate-600 dark:text-slate-400">Before</th>
                    <th className="text-center py-4 px-4 font-bold text-slate-600 dark:text-slate-400">After</th>
                    <th className="text-center py-4 px-4 font-bold text-slate-600 dark:text-slate-400">Gain</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.categoryBreakdown || [
                    { category: 'Formatting & ATS Parsing', before: 5, after: 14 },
                    { category: 'Keywords & Relevance', before: 6, after: 17 },
                    { category: 'Resume Structure', before: 8, after: 13 },
                    { category: 'Action Verbs & Impact', before: 5, after: 12 },
                    { category: 'Contact & Summary', before: 3, after: 13 },
                  ]).map((item, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-4 px-4 font-semibold text-slate-900 dark:text-white">{item.category}</td>
                      <td className="text-center py-4 px-4 text-slate-600 dark:text-slate-400">{item.before}/15</td>
                      <td className="text-center py-4 px-4 font-bold text-blue-600">{item.after}/15</td>
                      <td className="text-center py-4 px-4"><span className="inline-block bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-3 py-1 rounded-full text-xs font-bold">+{item.after - item.before}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Key Changes */}
          <div className="glass-card rounded-3xl p-8 mb-12 border border-slate-200 dark:border-slate-700">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-8">Key Changes & Impact</h2>
            <div className="space-y-4">
              {(result.keyChanges || [
                { title: 'Professional Summary', description: 'ATS keyword anchor — most parsers start here', impact: 'High' },
                { title: 'ATS-Friendly Headings', description: 'Standard labels are reliably parsed by all ATS', impact: 'High' },
                { title: 'Stronger Action Verbs', description: 'Signals ownership; preferred in scoring algorithms', impact: 'High' },
                { title: 'Keyword Alignment', description: 'Full-phrase keywords match job description filters', impact: 'High' },
              ]).map((change, i) => (
                <div key={i} className="flex gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                  <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 mt-0.5">●</div>
                  <div className="flex-1">
                    <p className="font-bold text-slate-900 dark:text-white">{change.title}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{change.description}</p>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-bold flex-shrink-0 whitespace-nowrap ${
                    change.impact === 'High' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' :
                    change.impact === 'Med' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' :
                    'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}>
                    {change.impact}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Info Banner */}
          <div className="glass-card rounded-3xl p-8 border border-blue-200 dark:border-blue-800 bg-gradient-to-r from-blue-600 to-blue-700 text-white mb-12">
            <div className="flex gap-4">
              <Lightbulb className="w-6 h-6 flex-shrink-0 mt-1" />
              <div>
                <p className="font-black text-lg mb-2">"Your resume's first recruiter is often a machine."</p>
                <p className="text-blue-100">An optimized resume increases your visibility before a human recruiter even opens it. Structure, keywords, and formatting are not just style — they are strategy.</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => setResult(null)}
              className="px-8 py-4 rounded-xl font-bold bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-slate-600 transition"
            >
              Check Another Resume
            </button>
            <button className="px-8 py-4 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 transition">
              Download Report
            </button>
          </div>

          <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-8">
            All scores are illustrative estimates based on ATS best practices
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-blue-100 dark:bg-blue-900/30 mb-6">
            <span className="text-2xl">✓</span>
            <span className="font-bold text-blue-700 dark:text-blue-300">ATS RESUME CHECKER</span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-4">Optimize Your Resume for ATS</h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">Get an AI-powered analysis of how well your resume matches Applicant Tracking Systems</p>
        </div>

        {/* Upload Card */}
        <div className="glass-card rounded-3xl p-12 border-2 border-dashed border-slate-300 dark:border-slate-700 mb-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Upload className="w-8 h-8 text-blue-600" />
            </div>

            {resumeFile ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <div className="text-left">
                    <p className="font-bold text-emerald-900 dark:text-emerald-100">{resumeFile.name}</p>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">{(resumeFile.size / 1024 / 1024).toFixed(2)}MB</p>
                  </div>
                  <button onClick={() => setResumeFile(null)} className="ml-auto text-emerald-600 hover:text-emerald-700">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-xl font-bold text-slate-900 dark:text-white mb-2">Upload Your Resume</p>
                <p className="text-slate-600 dark:text-slate-400 mb-6">PDF or DOCX (up to 5MB)</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-8 py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition"
                >
                  Choose File
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </>
            )}
          </div>
        </div>

        {/* Job Description */}
        <div className="mb-8">
          <label className="block text-sm font-bold text-slate-900 dark:text-white mb-3">Job Description (Optional)</label>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the job description for better matching..."
            className="w-full px-6 py-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            rows={6}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-8 flex items-center gap-3 p-4 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-800">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <p className="text-rose-700 dark:text-rose-300">{error}</p>
          </div>
        )}

        {/* Analyze Button */}
        <button
          onClick={handleCheck}
          disabled={!resumeFile || loading}
          className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-bold hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition text-lg"
        >
          {loading ? 'Analyzing Your Resume...' : 'Get ATS Analysis'}
        </button>
      </div>
    </div>
  );
}
