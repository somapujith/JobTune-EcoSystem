import React, { useState, useEffect } from 'react';
import { api } from '../store/useAuthStore';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { CheckCircle2, AlertCircle, Sparkles, HelpCircle, Briefcase, Award, Code } from 'lucide-react';

function getScoreColor(score) {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 60) return 'text-blue-600 dark:text-blue-400';
  if (score >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function getScoreBg(score) {
  if (score >= 80) return 'border-emerald-200/50 dark:border-emerald-900/50';
  if (score >= 60) return 'border-blue-200/50 dark:border-blue-900/50';
  if (score >= 40) return 'border-amber-200/50 dark:border-amber-900/50';
  return 'border-rose-200/50 dark:border-rose-900/50';
}

export default function JobFitAnalysis() {
  const [resumes, setResumes] = useState([]);
  const [selectedResumeId, setSelectedResumeId] = useState('');
  const [useManualResume, setUseManualResume] = useState(false);
  const [resumeText, setResumeText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  // Fetch saved resumes on mount
  useEffect(() => {
    const fetchResumes = async () => {
      try {
        const { data } = await api.get('/resume/list');
        if (data && data.success) {
          setResumes(data.data || []);
          if (data.data && data.data.length > 0) {
            setSelectedResumeId(data.data[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch resumes:', err);
      }
    };
    fetchResumes();
  }, []);

  // Fetch full text when a saved resume is selected
  useEffect(() => {
    if (!selectedResumeId || useManualResume) return;
    const fetchResumeContent = async () => {
      try {
        const { data } = await api.get(`/resume/${selectedResumeId}`);
        if (data && data.success) {
          setResumeText(data.data.content || '');
        }
      } catch (err) {
        console.error('Failed to load resume text:', err);
        setError('Failed to load selected resume content. Try pasting manually.');
      }
    };
    fetchResumeContent();
  }, [selectedResumeId, useManualResume]);

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!resumeText.trim() || !jobDescription.trim()) {
      setError('Both resume text and job description are required');
      return;
    }

    setLoading(true);
    setError('');
    setReport(null);

    try {
      const { data } = await api.post('/jobs/fit', {
        resumeText: resumeText,
        jobDescription: jobDescription
      });

      if (data && data.success) {
        setReport(data);
      } else {
        throw new Error(data.error || 'Failed to compute fit score');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Convert breakdown for Recharts Radar Chart
  const radarData = report ? [
    { subject: 'Domain Fit', value: report.breakdown?.domain || 0, fullMark: 100 },
    { subject: 'Seniority Fit', value: report.breakdown?.seniority || 0, fullMark: 100 },
    { subject: 'Skill Overlap', value: report.breakdown?.skills || 0, fullMark: 100 }
  ] : [];

  return (
    <div className="w-full max-w-5xl mx-auto py-16 px-4 sm:px-6">
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-blue-500/5 mb-6">
          <span className="material-symbols-outlined text-blue-600 text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>radar</span>
        </div>
        <h1 className="text-4xl font-black text-on-surface font-headline mb-4">
          Job Fit Analyzer
        </h1>
        <p className="text-lg text-on-surface-variant font-medium max-w-2xl mx-auto">
          Analyze how well your resume matches a target job description across domain, seniority level, and core skills.
        </p>
      </div>

      {error && (
        <div className="max-w-3xl mx-auto mb-6 glass-card border-rose-200/50 p-4 rounded-2xl text-rose-600 dark:text-rose-400 text-sm font-medium flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleAnalyze} className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-12">
        {/* Resume Input Area */}
        <div className="glass-card p-6 rounded-3xl flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <label className="block text-sm font-bold text-on-surface">Your Resume</label>
            <button
              type="button"
              onClick={() => {
                setUseManualResume(!useManualResume);
                setResumeText('');
              }}
              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 font-bold transition-colors"
            >
              {useManualResume ? 'Use Saved Resume' : 'Paste Text Manually'}
            </button>
          </div>

          {!useManualResume ? (
            <div className="mb-4">
              {resumes.length > 0 ? (
                <div>
                  <select
                    value={selectedResumeId}
                    onChange={(e) => setSelectedResumeId(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-on-surface focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                  >
                    {resumes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.file_name} ({new Date(r.created_at).toLocaleDateString()})
                      </option>
                    ))}
                  </select>
                  <div className="mt-3">
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Extracted Resume Content (Read-Only)</label>
                    <textarea
                      readOnly
                      rows={8}
                      className="w-full bg-slate-50 dark:bg-slate-900/55 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-mono text-xs text-slate-500 resize-none outline-none"
                      value={resumeText}
                      placeholder="Loading resume content..."
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/10">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">No saved resumes found.</p>
                  <button
                    type="button"
                    onClick={() => setUseManualResume(true)}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 rounded-lg transition-colors"
                  >
                    Paste Text Manually
                  </button>
                </div>
              )}
            </div>
          ) : (
            <textarea
              required
              rows={12}
              placeholder="Paste your plain-text resume here..."
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-medium text-on-surface focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y flex-1"
              value={resumeText}
              onChange={e => setResumeText(e.target.value)}
            />
          )}
        </div>

        {/* Job Description Input Area */}
        <div className="glass-card p-6 rounded-3xl flex flex-col justify-between">
          <div className="flex-1 flex flex-col mb-4">
            <label className="block text-sm font-bold text-on-surface mb-2">Job Description</label>
            <textarea
              required
              rows={12}
              placeholder="Paste the target job description here..."
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-medium text-on-surface focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y flex-1"
              value={jobDescription}
              onChange={e => setJobDescription(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-3.5 rounded-xl font-bold hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100 shadow-[0px_10px_20px_rgba(37,99,235,0.2)] flex items-center justify-center gap-3"
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined animate-spin text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
                Calculating Fit...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>radar</span>
                Calculate Job Fit
              </>
            )}
          </button>
        </div>
      </form>

      {/* Results Section */}
      {report && !loading && (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Main Score Board */}
          <div className={`glass-card rounded-3xl p-8 flex flex-col md:flex-row items-center gap-8 ${getScoreBg(report.score)}`}>
            
            {/* Score Ring Display */}
            <div className="relative shrink-0">
              <svg viewBox="0 0 36 36" className="w-36 h-36 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(226, 232, 240, 0.5)" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke={report.score >= 80 ? '#10b981' : report.score >= 60 ? '#2563eb' : report.score >= 40 ? '#f59e0b' : '#ef4444'}
                  strokeWidth="3"
                  strokeDasharray={`${report.score} 100`}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-black text-slate-800 dark:text-slate-100">{report.score}</span>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">/ 100</span>
              </div>
            </div>

            {/* Score Meta details */}
            <div className="text-center md:text-left flex-1 space-y-3">
              <div className="flex flex-wrap justify-center md:justify-start gap-2 items-center">
                <span className={`px-4 py-1.5 rounded-full text-sm font-bold shadow-sm bg-white dark:bg-slate-800 ${getScoreColor(report.score)}`}>
                  {report.score >= 80 ? 'Excellent Match' : report.score >= 60 ? 'Strong Match' : report.score >= 40 ? 'Fair Match' : 'Low Match'}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-bold">
                  {report.method === 'llm' ? (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                      AI Calculated
                    </>
                  ) : (
                    <>
                      <HelpCircle className="w-3.5 h-3.5 text-purple-500" />
                      Rule Fallback
                    </>
                  )}
                </span>
              </div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 font-headline">Overall Job Fit Index</h2>
              <p className="text-slate-600 dark:text-slate-400 font-medium">
                The score is computed based on domain alignment (35%), seniority equivalence (35%), and tech skills overlap (30%).
              </p>
            </div>
          </div>

          {/* Chart & Breakdowns */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            
            {/* Recharts Radar Chart */}
            <div className="glass-card p-6 rounded-3xl md:col-span-5 flex flex-col items-center justify-center min-h-[300px]">
              <h3 className="text-base font-bold text-on-surface mb-4 self-start font-headline">Match Profile</h3>
              <ResponsiveContainer width="100%" height={240}>
                <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#94a3b8' }} />
                  <Radar name="Job Fit" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* In-Depth Breakdowns */}
            <div className="space-y-4 md:col-span-7">
              
              {/* Domain Fit details */}
              <div className="glass-card p-5 rounded-2xl flex items-start gap-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-on-surface">Domain Fit</h4>
                    <span className="text-sm font-black text-blue-600 dark:text-blue-400">{report.breakdown?.domain || 0}%</span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Measures industry compatibility using ONET occupational codes. If matching, you possess crucial industry-specific contextual knowledge.
                  </p>
                </div>
              </div>

              {/* Seniority Fit details */}
              <div className="glass-card p-5 rounded-2xl flex items-start gap-4">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
                  <Award className="w-5 h-5" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-on-surface">Seniority Equivalence</h4>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{report.breakdown?.seniority || 0}%</span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Assesses years-of-experience matches or explicit title seniority levels. Avoids under-qualification (skill gaps) or over-qualification.
                  </p>
                </div>
              </div>

              {/* Skill Overlap details */}
              <div className="glass-card p-5 rounded-2xl flex items-start gap-4">
                <div className="p-3 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
                  <Code className="w-5 h-5" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-on-surface">Skill Overlap</h4>
                    <span className="text-sm font-black text-amber-600 dark:text-amber-400">{report.breakdown?.skills || 0}%</span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Jaccard index calculation on technical skill keyword intersections. Indicates coverage of the technical tooling specified in the posting.
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
