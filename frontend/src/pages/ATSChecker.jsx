import React, { useState, useRef } from 'react';
import { api } from '../store/useAuthStore';
import { CheckCircle2, AlertCircle, TrendingUp, Upload, X, Lightbulb, Loader } from 'lucide-react';

export default function ATSChecker() {
  const [stage, setStage] = useState('upload'); // upload | missing-fields | report
  const [resumeFile, setResumeFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [missingFields, setMissingFields] = useState([]);
  const [additionalInfo, setAdditionalInfo] = useState({});
  const [optimizedResume, setOptimizedResume] = useState(null);
  const [improvedScore, setImprovedScore] = useState(0);
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

  const handleAnalyze = async () => {
    if (!resumeFile) {
      setError('Please upload your resume');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('resume', resumeFile);

      const { data } = await api.post('/jobs/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setAnalysis(data.data.analysis);
      setMissingFields(data.data.missingFields || []);

      if (data.data.missingFields && data.data.missingFields.length > 0) {
        setStage('missing-fields');
      } else {
        handleOptimize(data.data);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to analyze resume');
    } finally {
      setLoading(false);
    }
  };

  const handleMissingFieldsSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('resume', resumeFile);
      formData.append('additionalInfo', JSON.stringify(additionalInfo));

      const { data } = await api.post('/jobs/optimize', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setOptimizedResume(data.data.optimizedResume);
      setImprovedScore(data.data.improvedScore);
      setAnalysis(data.data.analysis);
      setStage('report');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to optimize resume');
    } finally {
      setLoading(false);
    }
  };

  const handleOptimize = async (data) => {
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('resume', resumeFile);
      formData.append('additionalInfo', JSON.stringify({}));

      const response = await api.post('/jobs/optimize', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setOptimizedResume(response.data.data.optimizedResume);
      setImprovedScore(response.data.data.improvedScore);
      setAnalysis(response.data.data.analysis);
      setStage('report');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to optimize resume');
    } finally {
      setLoading(false);
    }
  };

  const downloadOptimizedResume = () => {
    const element = document.createElement('a');
    const file = new Blob([optimizedResume], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = 'optimized-resume.txt';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const getScoreColor = (score) => {
    if (score >= 80) return { text: 'text-emerald-600', bg: 'bg-emerald-50', ring: 'ring-emerald-200' };
    if (score >= 60) return { text: 'text-blue-600', bg: 'bg-blue-50', ring: 'ring-blue-200' };
    if (score >= 40) return { text: 'text-amber-600', bg: 'bg-amber-50', ring: 'ring-amber-200' };
    return { text: 'text-rose-600', bg: 'bg-rose-50', ring: 'ring-rose-200' };
  };

  // UPLOAD STAGE
  if (stage === 'upload') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-blue-100 dark:bg-blue-900/30 mb-6">
              <span className="text-2xl">✓</span>
              <span className="font-bold text-blue-700 dark:text-blue-300">ATS RESUME CHECKER</span>
            </div>
            <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-4">Optimize Your Resume for ATS</h1>
            <p className="text-lg text-slate-600 dark:text-slate-400">AI-powered analysis + automatic rewriting for 90+ ATS score</p>
          </div>

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

          {error && (
            <div className="mb-8 flex items-center gap-3 p-4 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-800">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
              <p className="text-rose-700 dark:text-rose-300">{error}</p>
            </div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={!resumeFile || loading}
            className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-bold hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition text-lg flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Analyzing Resume...
              </>
            ) : (
              'Analyze & Optimize Resume'
            )}
          </button>
        </div>
      </div>
    );
  }

  // MISSING FIELDS STAGE
  if (stage === 'missing-fields') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-4">Complete Your Profile</h1>
            <p className="text-lg text-slate-600 dark:text-slate-400">Add missing information for better resume optimization</p>
          </div>

          <div className="glass-card rounded-3xl p-8 space-y-6">
            {missingFields.map((field, idx) => (
              <div key={idx}>
                <label className="block text-sm font-bold text-slate-900 dark:text-white mb-3">
                  {field.field}
                  <span className="text-slate-500 text-xs font-normal ml-2">{field.description}</span>
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    value={additionalInfo[field.field] || ''}
                    onChange={(e) =>
                      setAdditionalInfo({ ...additionalInfo, [field.field]: e.target.value })
                    }
                    placeholder="Enter your information..."
                    className="w-full px-6 py-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                    rows={4}
                  />
                ) : (
                  <input
                    type={field.type || 'text'}
                    value={additionalInfo[field.field] || ''}
                    onChange={(e) =>
                      setAdditionalInfo({ ...additionalInfo, [field.field]: e.target.value })
                    }
                    placeholder="Enter your information..."
                    className="w-full px-6 py-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  />
                )}
              </div>
            ))}
          </div>

          {error && (
            <div className="mt-8 flex items-center gap-3 p-4 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-800">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
              <p className="text-rose-700 dark:text-rose-300">{error}</p>
            </div>
          )}

          <div className="mt-8 flex gap-4">
            <button
              onClick={() => setStage('upload')}
              className="flex-1 py-4 px-6 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition"
            >
              Back
            </button>
            <button
              onClick={handleMissingFieldsSubmit}
              disabled={loading}
              className="flex-1 py-4 px-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-bold hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Optimizing...
                </>
              ) : (
                'Optimize Resume'
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // REPORT STAGE
  if (stage === 'report' && optimizedResume) {
    const beforeScore = analysis?.currentScore || 42;
    const improvement = improvedScore - beforeScore;
    const colors = getScoreColor(improvedScore);

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
            <p className="text-slate-600 dark:text-slate-400">Powered by DeepSeek R1 · Optimized for Applicant Tracking Systems</p>
          </div>

          {/* Score Comparison Cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
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

            <div className={`glass-card rounded-3xl p-8 border-2 ${colors.ring} bg-gradient-to-br ${colors.bg}`}>
              <p className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-4">After Optimization</p>
              <div className="mb-4">
                <div className={`text-5xl font-black ${colors.text}`}>{improvedScore}</div>
                <p className="text-xs text-slate-500 mt-2">ATS-ready score</p>
              </div>
              <div className="w-full h-2 bg-white/40 rounded-full overflow-hidden">
                <div className={`h-full ${colors.text} bg-current opacity-100`} style={{ width: `${improvedScore}%` }} />
              </div>
            </div>

            <div className="glass-card rounded-3xl p-8 border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-4">Total Improvement</p>
              <div className="flex items-baseline gap-2 mb-4">
                <div className="text-5xl font-black text-emerald-600">+{improvement}</div>
                <span className="text-sm text-emerald-600 font-bold">Points</span>
              </div>
              <p className="text-sm text-emerald-700">{Math.round((improvement/beforeScore)*100)}% increase in ATS compatibility</p>
            </div>
          </div>

          {/* Key Changes */}
          <div className="glass-card rounded-3xl p-8 mb-12 border border-slate-200 dark:border-slate-700">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-8">What Changed</h2>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6">
              <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono text-sm max-h-96 overflow-y-auto">
                {optimizedResume}
              </p>
            </div>
          </div>

          {/* Info Banner */}
          <div className="glass-card rounded-3xl p-8 border border-blue-200 dark:border-blue-800 bg-gradient-to-r from-blue-600 to-blue-700 text-white mb-12">
            <div className="flex gap-4">
              <Lightbulb className="w-6 h-6 flex-shrink-0 mt-1" />
              <div>
                <p className="font-black text-lg mb-2">"Your resume's first recruiter is often a machine."</p>
                <p className="text-blue-100">This AI-optimized resume is ready to pass ATS filters and reach human recruiters. Download it, customize as needed, and start applying!</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => setStage('upload')}
              className="px-8 py-4 rounded-xl font-bold bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-slate-600 transition"
            >
              Check Another Resume
            </button>
            <button
              onClick={downloadOptimizedResume}
              className="px-8 py-4 rounded-xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-700 text-white hover:from-emerald-700 hover:to-emerald-800 transition"
            >
              Download Optimized Resume
            </button>
          </div>

          <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-8">
            Resume optimization powered by DeepSeek R1 via LM Studio
          </p>
        </div>
      </div>
    );
  }

  return null;
}
