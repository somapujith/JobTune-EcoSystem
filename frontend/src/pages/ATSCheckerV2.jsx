import React, { useState } from 'react';
import { api } from '../store/useAuthStore';
import {
  Zap,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  ListChecks,
  ShieldAlert
} from 'lucide-react';

const SCORE_BANDS = [
  { min: 90, label: 'Excellent — very likely to pass ATS', color: '#10b981' },
  { min: 80, label: 'Good — likely to pass ATS', color: '#3b82f6' },
  { min: 70, label: 'Fair — may pass ATS', color: '#f59e0b' },
  { min: 60, label: 'Poor — unlikely to pass ATS', color: '#ef4444' },
  { min: 0, label: 'Critical — will likely be filtered', color: '#991b1b' },
];

function getScoreBand(score) {
  return SCORE_BANDS.find((band) => score >= band.min) || SCORE_BANDS[SCORE_BANDS.length - 1];
}

const SCORE_BREAKDOWN_ITEMS = [
  { key: 'contact', label: 'Contact Information', max: 10 },
  { key: 'structure', label: 'Structure', max: 20 },
  { key: 'formatting', label: 'ATS Formatting', max: 20 },
  { key: 'skills', label: 'Skills', max: 15 },
  { key: 'experience', label: 'Experience', max: 15 },
  { key: 'projects', label: 'Projects', max: 10 },
  { key: 'education', label: 'Education', max: 5 },
  { key: 'readability', label: 'Readability', max: 5 },
];

const SEVERITY_STYLES = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
};

function scaleScore(value, fromMax, toMax) {
  if (!fromMax) return 0;
  return Math.round((value / fromMax) * toMax);
}

function estimateInterviewProbability(score) {
  if (score >= 90) return 85;
  if (score >= 80) return 70;
  if (score >= 70) return 55;
  if (score >= 60) return 40;
  return 25;
}

function mapAnalysisResponse(data) {
  const analysis = data.analysis;
  const scores = analysis.scores;

  return {
    resumeId: data.resumeId,
    atsScore: {
      score: analysis.overallScore,
      breakdown: {
        keywordMatch: scaleScore(scores.keywords, 25, 30),
        skillsCoverage: scaleScore(scores.section, 30, 30),
        experienceAlignment: scaleScore(scores.metrics, 15, 20),
        atsFormatting: scaleScore(scores.formatting, 15, 10),
        resumeQuality: scaleScore(scores.actionVerbs, 15, 10),
      },
    },
    analysis: {
      quality: {
        overallScore: analysis.overallScore / 10,
        overallQuality: analysis.quality.overallQuality,
      },
      keyStrengths: analysis.quality.keyStrengths,
      keyWeaknesses: analysis.quality.keyWeaknesses,
    },
  };
}

function mapOptimizeResponse(data) {
  const { optimization, optimizedResume } = data;
  const beforeProb = estimateInterviewProbability(optimization.originalScore);
  const afterProb = estimateInterviewProbability(optimization.optimizedScore);

  return {
    comparison: {
      before: {
        atsScore: optimization.originalScore,
        interviewProbability: beforeProb,
      },
      after: {
        atsScore: optimization.optimizedScore,
        interviewProbability: afterProb,
      },
      improvement: {
        atsScoreGain: optimization.improvement,
        probabilityGain: afterProb - beforeProb,
      },
    },
    enhancement: {
      notes: optimization.optimizationNotes || [],
      enhancedResume: optimizedResume,
    },
  };
}

export default function ATSCheckerV2() {
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeFileName, setResumeFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('input');
  const [dragActive, setDragActive] = useState(false);
  const [enhancedResume, setEnhancedResume] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  const validateAndSetFile = (file) => {
    if (!file) return;

    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (!allowed.includes(file.type)) {
      setError('Only PDF, DOCX, and TXT files allowed');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('File too large (max 5MB)');
      return;
    }

    setResumeFile(file);
    setResumeFileName(file.name);
    setError('');
  };

  const handleResumeUpload = (e) => {
    validateAndSetFile(e.target.files?.[0]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    validateAndSetFile(e.dataTransfer.files?.[0]);
  };

  const handleCheck = async () => {
    if (!resumeFile) {
      setError('Please upload a resume');
      return;
    }

    setError('');
    setLoading(true);
    setResults(null);
    setEnhancedResume(null);

    try {
      const formData = new FormData();
      formData.append('resume', resumeFile);

      const { data } = await api.post('/resume/v2/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (data.status !== 'success') {
        throw new Error(data.message || 'Analysis failed');
      }

      setResults(mapAnalysisResponse(data));
      setActiveTab('results');

      if (data.resumeText) {
        setAnalyzing(true);
        enhanceResumeBackground(data.resumeText, data.resumeId);
      }
    } catch (err) {
      const message =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Analysis failed';
      setError(message);
      console.error('Analysis error:', err);
    } finally {
      setLoading(false);
    }
  };

  const overallScore = results?.analysis?.overallScore ?? 0;
  const scoreBand = getScoreBand(overallScore);
  const circumference = 2 * Math.PI * 45;

  // Background enhancement (non-blocking)
  const enhanceResumeBackground = async (text, id) => {
    try {
      const { data } = await api.post('/resume/v2/optimize', {
        resumeId: id,
        resumeText: text,
      });

      if (data.status === 'success') {
        setEnhancedResume(mapOptimizeResponse(data));
      }
    } catch (err) {
      console.error('Enhancement error:', err);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-12 px-4 sm:px-6 lg:px-8 w-full">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-2 text-blue-600 font-bold text-sm uppercase tracking-widest mb-2">
          <Zap className="w-4 h-4 fill-current" /> Resume Tools
        </div>
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">ATS Score Checker</h1>
        <p className="text-slate-500 mt-2 font-medium">
          A fully rule-based, deterministic ATS compliance and resume quality report — no AI involved in scoring.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-8 glass-card rounded-2xl p-2 w-fit">
        {[
          { id: 'input', label: 'Input', disabled: false },
          { id: 'results', label: 'Report', disabled: !results },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            disabled={tab.disabled}
            className={`relative px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-md'
                : tab.disabled
                ? 'text-slate-300 cursor-not-allowed'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* INPUT TAB */}
      {activeTab === 'input' && (
        <div className="glass-card rounded-3xl p-8 sm:p-10">
          <label
            htmlFor="resume"
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl py-16 px-6 cursor-pointer transition-all duration-200 ${
              dragActive
                ? 'border-blue-500 bg-blue-50'
                : resumeFileName
                ? 'border-emerald-300 bg-emerald-50/50'
                : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50/40'
            }`}
          >
            <input
              id="resume"
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={handleResumeUpload}
              className="hidden"
            />
            {resumeFileName ? (
              <>
                <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <FileText className="w-7 h-7" />
                </div>
                <p className="font-bold text-slate-900 break-all text-center">{resumeFileName}</p>
                <p className="text-sm text-slate-400 font-medium">Click to choose a different file</p>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <UploadCloud className="w-7 h-7" />
                </div>
                <p className="font-bold text-slate-900">Click to upload or drag & drop</p>
                <p className="text-sm text-slate-400 font-medium">PDF, DOCX, or TXT — max 5MB</p>
              </>
            )}
          </label>

          {error && (
            <div className="mt-6 flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl font-medium text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleCheck}
            disabled={loading || !resumeFile}
            className="mt-6 w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98] shadow-lg shadow-blue-600/20 disabled:shadow-none"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Analyzing Resume...
              </>
            ) : (
              <>
                Check ATS Score
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      )}

      {/* REPORT TAB */}
      {activeTab === 'results' && results && (
        <div className="space-y-6">
          {/* Score Card */}
          <div className="glass-card rounded-3xl p-8 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-8 items-center">
            <div className="relative w-44 h-44 mx-auto">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="45" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke={scoreBand.color}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${(overallScore / 100) * circumference} ${circumference}`}
                  style={{ transition: 'stroke-dasharray 0.6s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-black text-slate-900">{overallScore}</span>
                <span className="text-sm font-bold text-slate-400">/100</span>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-black text-slate-900 mb-1">ATS Score</h3>
              <p className="font-bold mb-3" style={{ color: scoreBand.color }}>{scoreBand.label}</p>
              <p className="text-sm text-slate-500 font-medium mb-6">
                Detected Role: <span className="font-bold text-slate-900">{results.analysis.detectedRole?.displayName}</span>{' '}
                <span className="text-slate-400">({results.analysis.detectedRole?.confidence}% confidence)</span>
                {' • '}
                Completeness: <span className="font-bold text-slate-900">{results.analysis.summary?.completeness}%</span>
              </p>

              <div className="space-y-3">
                {SCORE_BREAKDOWN_ITEMS.map((item) => {
                  const value = results.analysis.scores?.[item.key] ?? 0;
                  const pct = Math.min(100, (value / item.max) * 100);
                  return (
                    <div key={item.key} className="grid grid-cols-[1fr_auto] sm:grid-cols-[140px_1fr_70px] items-center gap-3">
                      <span className="text-sm font-bold text-slate-600 col-span-2 sm:col-span-1">{item.label}</span>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold text-blue-600 text-right">{value}/{item.max}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Contact Info Card */}
          {results.analysis?.contactInfo && (
            <div className="glass-card rounded-3xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-blue-600" /> Contact Information
                </h3>
                <span className="text-sm font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                  {results.analysis.contactInfo.score}/{results.analysis.contactInfo.maxScore}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(results.analysis.contactInfo.found || {}).map(([field, present]) => (
                  <span
                    key={field}
                    className={`text-xs font-bold px-3 py-1.5 rounded-full capitalize ${
                      present ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {present ? '✓' : '✕'} {field}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Strengths/Weaknesses */}
          {results.analysis?.quality && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass-card rounded-3xl p-6">
                <h3 className="font-black text-slate-900 mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Strengths
                </h3>
                {results.analysis.quality.keyStrengths?.length > 0 ? (
                  <ul className="space-y-2.5">
                    {results.analysis.quality.keyStrengths.map((s, i) => (
                      <li key={i} className="text-sm text-slate-600 font-medium flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                        {s}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400 font-medium">No standout strengths detected yet.</p>
                )}
              </div>

              <div className="glass-card rounded-3xl p-6">
                <h3 className="font-black text-slate-900 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" /> Weaknesses
                </h3>
                {results.analysis.quality.keyWeaknesses?.length > 0 ? (
                  <ul className="space-y-2.5">
                    {results.analysis.quality.keyWeaknesses.map((w, i) => (
                      <li key={i} className="text-sm text-slate-600 font-medium flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                        {w}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400 font-medium">No major issues found.</p>
                )}
              </div>
            </div>
          )}

          {/* Issues */}
          {results.analysis?.issues?.length > 0 && (
            <div className="glass-card rounded-3xl p-6">
              <h3 className="font-black text-slate-900 mb-4 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-500" /> Issues Found ({results.analysis.issues.length})
              </h3>
              <ul className="space-y-2.5">
                {results.analysis.issues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span className={`shrink-0 text-xs font-bold px-2 py-1 rounded-full capitalize ${SEVERITY_STYLES[issue.severity] || SEVERITY_STYLES.low}`}>
                      {issue.severity}
                    </span>
                    <span className="text-slate-600 font-medium pt-0.5">{issue.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {results.analysis?.recommendations?.length > 0 && (
            <div className="glass-card rounded-3xl p-6">
              <h3 className="font-black text-slate-900 mb-4 flex items-center gap-2">
                <ListChecks className="w-5 h-5 text-blue-600" /> Recommended Improvements ({results.analysis.recommendations.length})
              </h3>
              <ul className="space-y-4">
                {results.analysis.recommendations.map((rec, i) => (
                  <li key={i} className="bg-white/60 rounded-2xl p-4">
                    <p className="font-bold text-slate-900 text-sm mb-1">{rec.message}</p>
                    {rec.reason && rec.reason !== rec.message && (
                      <p className="text-xs text-slate-500 font-medium">Reason: {rec.reason}</p>
                    )}
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
