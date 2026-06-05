import { useState, useEffect, useRef } from 'react';
import { api } from '../store/useAuthStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function scoreColor(s) {
  return s >= 80 ? 'green' : s >= 60 ? 'amber' : 'red';
}
function scoreBadge(s) {
  if (s >= 85) return { label: 'Excellent',  cls: 'bg-green-50 text-green-700'  };
  if (s >= 70) return { label: 'Good',       cls: 'bg-amber-50 text-amber-700'  };
  if (s >= 55) return { label: 'Fair',       cls: 'bg-orange-50 text-orange-700' };
  return              { label: 'Needs Work', cls: 'bg-red-50 text-red-700'      };
}
const colorMap = {
  green: { bar: 'from-green-400 to-green-600', bg: 'bg-green-50',  text: 'text-green-700'  },
  amber: { bar: 'from-amber-400 to-amber-600', bg: 'bg-amber-50',  text: 'text-amber-700'  },
  red:   { bar: 'from-red-400   to-red-500',   bg: 'bg-red-50',    text: 'text-red-700'    },
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function ScoreBar({ label, score, icon }) {
  const c = colorMap[scoreColor(score)];
  return (
    <div className={`${c.bg} rounded-2xl p-5 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sm opacity-60" style={{ fontVariationSettings: "'FILL' 0" }}>{icon}</span>
          <span className="text-sm font-semibold text-slate-600">{label}</span>
        </div>
        <span className={`text-lg font-black ${c.text}`}>{score}<span className="text-xs font-medium opacity-60">/100</span></span>
      </div>
      <div className="w-full h-2 bg-white/70 rounded-full overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${c.bar} rounded-full transition-all duration-1000`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function SuggestionCard({ type, category, message }) {
  const cfg = {
    success: { icon: 'check_circle', cls: 'text-green-600 bg-green-50 border-green-100' },
    warning: { icon: 'warning',      cls: 'text-amber-600 bg-amber-50 border-amber-100' },
    info:    { icon: 'info',         cls: 'text-blue-600  bg-blue-50  border-blue-100'  },
  }[type] || { icon: 'info', cls: 'text-blue-600 bg-blue-50 border-blue-100' };
  return (
    <div className={`flex gap-4 p-4 rounded-xl border ${cfg.cls}`}>
      <span className="material-symbols-outlined text-xl shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>{cfg.icon}</span>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider mb-1 opacity-70">{category}</p>
        <p className="text-sm leading-relaxed">{message}</p>
      </div>
    </div>
  );
}

function ScoreRing({ score }) {
  const badge = scoreBadge(score);
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="#e2e8f0" strokeWidth="10" />
          <circle cx="60" cy="60" r="54" fill="none" strokeWidth="10" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            className={`transition-all duration-1000 ${score >= 80 ? 'stroke-green-500' : score >= 60 ? 'stroke-amber-500' : 'stroke-red-400'}`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black text-slate-800">{score}</span>
          <span className="text-xs text-slate-500 font-medium">/ 100</span>
        </div>
      </div>
      <span className={`text-sm font-bold px-4 py-1.5 rounded-full ${badge.cls}`}>{badge.label}</span>
    </div>
  );
}

function ATSRing({ score, label }) {
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#0ea5e9' : score >= 40 ? '#f59e0b' : '#ef4444';
  const labelColor = score >= 80 ? 'bg-emerald-50 text-emerald-700' : score >= 60 ? 'bg-sky-50 text-sky-700' : score >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700';
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-40 h-40">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="#e2e8f0" strokeWidth="10" />
          <circle cx="60" cy="60" r="54" fill="none" strokeWidth="10" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            style={{ stroke: color, transition: 'stroke-dashoffset 1.2s ease' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-black text-slate-800">{score}%</span>
          <span className="text-xs text-slate-500 font-semibold mt-0.5">ATS Match</span>
        </div>
      </div>
      <span className={`text-sm font-bold px-4 py-1.5 rounded-full ${labelColor}`}>{label}</span>
    </div>
  );
}

function KeywordPill({ text, variant }) {
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
      variant === 'match'   ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
      variant === 'missing' ? 'bg-red-50 text-red-700 border border-red-200' :
                              'bg-slate-100 text-slate-600 border border-slate-200'
    }`}>
      <span>{variant === 'match' ? '✓' : variant === 'missing' ? '✗' : '○'}</span>
      {text}
    </span>
  );
}

function RecentUploads({ resumes, onResumeClick, onDeleteClick }) {
  const formatDate = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <section className="space-y-6">
      <h2 className="text-xl font-bold flex items-center gap-3">
        <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 0" }}>history</span>
        Recent Uploads
      </h2>
      {resumes.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center text-on-surface-variant text-sm">
          <span className="material-symbols-outlined text-3xl mb-3 block opacity-40">description</span>
          No resumes analyzed yet. Upload your first one!
        </div>
      ) : (
        <div className="space-y-4">
          {resumes.map((r) => {
            const c = colorMap[scoreColor(r.overall_score)];
            const isPdf = r.file_name?.toLowerCase().endsWith('.pdf');
            return (
              <div key={r.id} className="relative group w-full">
                <button onClick={() => onResumeClick(r.id)}
                  className="w-full glass-card p-5 rounded-2xl transition-all duration-300 text-left">
                  <div className="flex items-start justify-between mb-3 pr-8">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-12 ${isPdf ? 'bg-red-50' : 'bg-blue-50'} rounded-md flex items-center justify-center shrink-0`}>
                        <span className={`material-symbols-outlined ${isPdf ? 'text-red-500' : 'text-blue-500'}`} style={{ fontVariationSettings: "'FILL' 0" }}>
                          {isPdf ? 'picture_as_pdf' : 'description'}
                        </span>
                      </div>
                      <div>
                        <h5 className="font-bold text-sm truncate w-32">{r.file_name}</h5>
                        <p className="text-[10px] uppercase font-bold text-outline tracking-wider">{formatDate(r.created_at)}</p>
                      </div>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded ${c.bg} ${c.text}`}>{r.overall_score}/100</span>
                  </div>
                  <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${c.bar} rounded-full`} style={{ width: `${r.overall_score}%` }} />
                  </div>
                </button>
                <button onClick={(e) => { e.stopPropagation(); onDeleteClick(r.id); }}
                  title="Delete" className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200">
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>delete</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-4 rounded-3xl overflow-hidden aspect-video relative group bg-surface-container">
        <img alt="Professional workspace" className="w-full h-full object-cover grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700 mix-blend-multiply"
          src="https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent flex items-end p-6">
          <p className="text-xs font-bold italic text-white/90">"Your resume is your professional signature."</p>
        </div>
      </div>
    </section>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function ResumeOptimizer() {
  const [activeTab, setActiveTab] = useState('analyze'); // 'analyze' | 'forge'

  // Analyze tab state
  const [file, setFile]           = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [error, setError]           = useState('');
  const [analysis, setAnalysis]     = useState(null);
  const [recentResumes, setRecentResumes] = useState([]);

  // Forge tab state
  const [forgeFile, setForgeFile]   = useState(null);
  const [jobDescription, setJobDescription] = useState('');
  const [forging, setForging]       = useState(false);
  const [forgeError, setForgeError] = useState('');
  const [forgeResult, setForgeResult] = useState(null);
  const [copiedReadme, setCopiedReadme] = useState(false);

  const [forgeMode, setForgeMode] = useState('optimize'); // 'optimize' | 'create'
  const [createFormData, setCreateFormData] = useState({
    fullName: '', email: '', phone: '', linkedin: '', github: '',
    targetJobTitle: '', targetJobDescription: '', summary: '',
    skills: '', experience: '', education: '', projects: '',
    outputFormat: 'docx',
  });
  const [optimizeOutputFormat, setOptimizeOutputFormat] = useState('docx');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createResult, setCreateResult] = useState(null);
  const forgeDrop = useRef(false);

  useEffect(() => {
    fetchRecent();
  }, []);

  const fetchRecent = async () => {
    try {
      const { data } = await api.get('/resume/list');
      if (data.success) setRecentResumes(data.data);
    } catch {}
  };

  // ── Analyze Tab ──────────────────────────────────────────────────────────────
  const handleDrop = (e) => {
    e.preventDefault(); setIsDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && /\.(pdf|doc|docx)$/i.test(dropped.name)) setFile(dropped);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true); setError('');
    try {
      const fd = new FormData(); fd.append('resume', file);
      const { data } = await api.post('/resume/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (data.success) { setAnalysis(data.data); fetchRecent(); }
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed. Please try again.');
    } finally { setUploading(false); }
  };

  const handleResumeClick = async (id) => {
    try {
      const { data } = await api.get(`/resume/${id}`);
      if (data.success) setAnalysis(data.data);
    } catch {}
  };

  const handleDeleteClick = async (id) => {
    if (!window.confirm('Delete this resume?')) return;
    try {
      await api.delete(`/resume/${id}`);
      setRecentResumes(prev => prev.filter(r => r.id !== id));
      if (analysis?.id === id) setAnalysis(null);
    } catch {}
  };

  // ── Forge Tab ────────────────────────────────────────────────────────────────
  const handleForgeDrop = (e) => {
    e.preventDefault(); forgeDrop.current = false;
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && /\.(pdf|doc|docx)$/i.test(dropped.name)) setForgeFile(dropped);
  };

  const handleForge = async (e) => {
    e.preventDefault();
    if (!forgeFile || !jobDescription.trim()) return;
    setForging(true); setForgeError(''); setForgeResult(null);
    try {
      const fd = new FormData();
      fd.append('resume', forgeFile);
      fd.append('jobDescription', jobDescription);
      fd.append('outputFormat', optimizeOutputFormat);
      const { data } = await api.post('/resume/tune', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (data.success) setForgeResult(data);
    } catch (err) {
      setForgeError(err.response?.data?.error || 'Tuning failed. Please try again.');
    } finally { setForging(false); }
  };

  const handleCreateResume = async (e) => {
    e.preventDefault();
    if (!createFormData.fullName || !createFormData.targetJobDescription) return;
    setCreating(true); setCreateError(''); setCreateResult(null);
    try {
      const { data } = await api.post('/resume/build', createFormData);
      if (data.success) {
        setCreateResult(data);
      }
    } catch (err) {
       console.error('Create error:', err);
      setCreateError(err.response?.data?.error || 'Resume creation failed. Please try again.');
    } finally { setCreating(false); }
  };

  const handleDownloadGenerated = (result) => {
    if (!result?.fileBase64 || !result?.fileName || !result?.mimeType) return;
    const link = document.createElement('a');
    link.href = `data:${result.mimeType};base64,${result.fileBase64}`;
    link.download = result.fileName;
    link.click();
  };

  const handleCopyTuned = () => {
    if (!forgeResult?.tunedResume) return;
    navigator.clipboard.writeText(forgeResult.tunedResume);
    setCopiedReadme(true); setTimeout(() => setCopiedReadme(false), 2000);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <header className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-emerald-600 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>auto_fix_high</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-on-surface font-headline">Resume Forge</h1>
        </div>
        <p className="text-lg text-on-surface-variant max-w-2xl leading-relaxed">
          Analyze your resume structure and ATS score, then forge a tailored version for any job description — using deterministic ATS-first logic.
        </p>
      </header>

      {/* Tab Switcher */}
      <div className="flex gap-1 p-1 glass-card rounded-2xl w-fit mb-10">
        <button onClick={() => setActiveTab('analyze')}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${activeTab === 'analyze' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 0" }}>analytics</span>
            Analyze Resume
          </span>
        </button>
        <button onClick={() => setActiveTab('forge')}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${activeTab === 'forge' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>auto_fix_high</span>
            Forge for Job
          </span>
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ANALYZE TAB                                                            */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'analyze' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column — upload + results */}
          <div className="lg:col-span-2 space-y-8">
            {/* Upload Card */}
            <div className="glass-card rounded-3xl overflow-hidden">
              <div className="p-8">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 0" }}>upload_file</span>
                  Upload Resume
                </h2>
                {error && (
                  <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-3 text-sm">
                    <span className="material-symbols-outlined text-red-500 shrink-0">error</span>{error}
                  </div>
                )}
                <form onSubmit={handleUpload} className="space-y-5">
                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onClick={() => document.getElementById('analyze-file-input').click()}
                    className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 ${isDragOver ? 'border-primary bg-primary/5' : 'border-outline/30 hover:border-primary/50 hover:bg-surface-container'}`}
                  >
                    <input id="analyze-file-input" type="file" accept=".pdf,.doc,.docx" className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    <span className="material-symbols-outlined text-5xl text-outline/40 mb-3 block" style={{ fontVariationSettings: "'FILL' 0" }}>
                      {file ? 'description' : 'cloud_upload'}
                    </span>
                    {file ? (
                      <div>
                        <p className="font-bold text-on-surface">{file.name}</p>
                        <p className="text-sm text-on-surface-variant mt-1">{(file.size / 1024).toFixed(0)} KB · Click to change</p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-semibold text-on-surface">Drop your resume here or click to browse</p>
                        <p className="text-sm text-on-surface-variant mt-1">PDF, DOC, DOCX — up to 10 MB</p>
                      </div>
                    )}
                  </div>
                  <button type="submit" disabled={!file || uploading}
                    className="w-full py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold rounded-2xl hover:from-emerald-600 hover:to-emerald-700 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0px_10px_30px_rgba(16,185,129,0.3)] flex items-center justify-center gap-3">
                    {uploading ? (
                      <><span className="material-symbols-outlined animate-spin text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>Analyzing...</>
                    ) : (
                      <><span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>analytics</span>Analyze Resume</>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Analysis Results */}
            {analysis && (
              <>
                {/* Scores grid */}
                <div className="glass-card rounded-3xl p-8">
                  <div className="flex flex-col sm:flex-row gap-8 items-center sm:items-start mb-8">
                    <ScoreRing score={analysis.overall_score} />
                    <div>
                      <h2 className="text-2xl font-extrabold text-on-surface font-headline">{analysis.file_name}</h2>
                      <p className="text-on-surface-variant mt-1">Overall resume quality score</p>
                      <div className="flex flex-wrap gap-2 mt-4">
                        {analysis.sections && Object.entries(analysis.sections).map(([key, val]) => (
                          <span key={key} className={`text-xs font-bold px-3 py-1 rounded-full ${val ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400 line-through'}`}>
                            {key.charAt(0).toUpperCase() + key.slice(1)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {analysis.scores && [
                      { key: 'ats',          label: 'ATS Compatibility', icon: 'filter_alt'      },
                      { key: 'impact',       label: 'Impact & Metrics',  icon: 'trending_up'     },
                      { key: 'skills',       label: 'Skills Coverage',   icon: 'code'            },
                      { key: 'clarity',      label: 'Clarity & Format',  icon: 'format_align_left'},
                      { key: 'completeness', label: 'Completeness',      icon: 'checklist'       },
                      { key: 'industry_fit', label: 'Industry Fit',      icon: 'work'            },
                    ].map(({ key, label, icon }) => (
                      <ScoreBar key={key} label={label} score={analysis.scores[key]} icon={icon} />
                    ))}
                  </div>
                </div>

                {/* Suggestions */}
                {analysis.suggestions?.length > 0 && (
                  <div className="glass-card rounded-3xl p-8">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                      <span className="material-symbols-outlined text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>lightbulb</span>
                      Improvement Suggestions
                    </h3>
                    <div className="space-y-3">
                      {analysis.suggestions.map((s, i) => (
                        <SuggestionCard key={i} type={s.type} category={s.category} message={s.message} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Forge CTA */}
                <div className="bg-gradient-to-r from-emerald-500 to-sky-500 rounded-3xl p-8 text-white">
                  <div className="flex items-start gap-4">
                    <span className="material-symbols-outlined text-3xl opacity-80" style={{ fontVariationSettings: "'FILL' 1" }}>auto_fix_high</span>
                    <div>
                      <h3 className="text-xl font-bold mb-1">Take it further with Resume Forge</h3>
                      <p className="text-white/80 text-sm mb-4">Paste a job description and let AI rewrite your resume to maximise your match score for that specific role.</p>
                      <button onClick={() => setActiveTab('forge')}
                        className="bg-white text-emerald-700 font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-emerald-50 transition-colors flex items-center gap-2">
                        <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>auto_fix_high</span>
                        Open Forge Tab
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right column — recent uploads */}
          <div className="lg:col-span-1">
            <div className="glass-card rounded-3xl p-8 sticky top-8">
              <RecentUploads resumes={recentResumes} onResumeClick={handleResumeClick} onDeleteClick={handleDeleteClick} />
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* FORGE TAB                                                              */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'forge' && (() => {
        const resultToRender = forgeMode === 'optimize' ? forgeResult : createResult;
        const isLoading = forgeMode === 'optimize' ? forging : creating;

        return (
          <div className="space-y-8">
            {/* Mode Switcher */}
            <div className="glass-card rounded-3xl p-4 flex gap-2">
              <button
                onClick={() => setForgeMode('optimize')}
                className={`flex-1 py-3 px-6 rounded-2xl font-bold flex justify-center items-center gap-3 transition-all duration-200 ${
                  forgeMode === 'optimize' 
                    ? 'bg-emerald-50 text-emerald-700 shadow-sm border border-emerald-100' 
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>auto_fix_high</span>
                Optimize Existing Resume
              </button>
              <button
                onClick={() => setForgeMode('create')}
                className={`flex-1 py-3 px-6 rounded-2xl font-bold flex justify-center items-center gap-3 transition-all duration-200 ${
                  forgeMode === 'create' 
                    ? 'bg-sky-50 text-sky-700 shadow-sm border border-sky-100' 
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>note_add</span>
                Create New Resume
              </button>
            </div>

            {/* Input Panel */}
            <div className="glass-card rounded-3xl p-8">
              {forgeMode === 'optimize' ? (
                <>
                  <h2 className="text-xl font-bold mb-2 flex items-center gap-3">
                    <span className="material-symbols-outlined text-emerald-600" style={{ fontVariationSettings: "'FILL' 1" }}>auto_fix_high</span>
                    Forge Resume for a Job
                  </h2>
                  <p className="text-on-surface-variant text-sm mb-6">Upload your resume and paste the job description. The system will calculate ATS match and generate a deterministic optimized version.</p>

                  {forgeError && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-3 text-sm">
                      <span className="material-symbols-outlined text-red-500 shrink-0">error</span>{forgeError}
                    </div>
                  )}

                  <form onSubmit={handleForge} className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Resume Upload */}
                      <div>
                        <label className="block text-sm font-bold text-on-surface mb-2">
                          <span className="material-symbols-outlined text-sm align-middle mr-1" style={{ fontVariationSettings: "'FILL' 0" }}>upload_file</span>
                          Your Resume (PDF / DOCX)
                        </label>
                        <div
                          onDrop={handleForgeDrop}
                          onDragOver={(e) => { e.preventDefault(); forgeDrop.current = true; }}
                          onDragLeave={() => { forgeDrop.current = false; }}
                          onClick={() => document.getElementById('forge-file-input').click()}
                          className="border-2 border-dashed border-outline/30 hover:border-emerald-400/70 hover:bg-emerald-50/30 rounded-2xl p-8 text-center cursor-pointer transition-all duration-200"
                        >
                          <input id="forge-file-input" type="file" accept=".pdf,.doc,.docx" className="hidden"
                            onChange={(e) => setForgeFile(e.target.files?.[0] || null)} />
                          <span className="material-symbols-outlined text-4xl text-outline/40 mb-2 block" style={{ fontVariationSettings: "'FILL' 0" }}>
                            {forgeFile ? 'description' : 'cloud_upload'}
                          </span>
                          {forgeFile ? (
                            <div>
                              <p className="font-bold text-on-surface text-sm">{forgeFile.name}</p>
                              <p className="text-xs text-on-surface-variant mt-0.5">{(forgeFile.size / 1024).toFixed(0)} KB · Click to change</p>
                            </div>
                          ) : (
                            <div>
                              <p className="font-semibold text-on-surface text-sm">Drop file or click to browse</p>
                              <p className="text-xs text-on-surface-variant mt-0.5">PDF, DOC, DOCX</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Job Description */}
                      <div>
                        <label className="block text-sm font-bold text-on-surface mb-2">
                          <span className="material-symbols-outlined text-sm align-middle mr-1" style={{ fontVariationSettings: "'FILL' 0" }}>work</span>
                          Job Description
                          <span className="text-xs font-normal text-on-surface-variant ml-2">{jobDescription.split(/\s+/).filter(Boolean).length} words</span>
                        </label>
                        <textarea
                          rows={10}
                          placeholder="Paste the full job description here — include required skills, responsibilities, and qualifications for the best ATS match..."
                          className="w-full bg-surface-container border border-outline/20 rounded-2xl px-4 py-3 font-medium text-on-surface placeholder:text-outline/40 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-y text-sm leading-relaxed"
                          value={jobDescription}
                          onChange={(e) => setJobDescription(e.target.value)}
                        />
                        <div className="mt-3">
                          <label className="block text-xs font-bold text-on-surface mb-1">Download Format</label>
                          <select
                            className="w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                            value={optimizeOutputFormat}
                            onChange={(e) => setOptimizeOutputFormat(e.target.value)}
                          >
                            <option value="docx">DOCX</option>
                            <option value="pdf">PDF</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <button type="submit" disabled={!forgeFile || !jobDescription.trim() || forging}
                      className="w-full py-4 bg-gradient-to-r from-emerald-500 to-sky-500 text-white font-bold rounded-2xl hover:from-emerald-600 hover:to-sky-600 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0px_10px_30px_rgba(16,185,129,0.35)] flex items-center justify-center gap-3 text-base">
                      {forging ? (
                        <><span className="material-symbols-outlined animate-spin text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>Forging your resume — this takes ~15 seconds...</>
                      ) : (
                        <><span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>auto_fix_high</span>Forge Resume for This Job</>
                      )}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                    <div>
                      <h2 className="text-xl font-bold mb-2 flex items-center gap-3">
                        <span className="material-symbols-outlined text-sky-600" style={{ fontVariationSettings: "'FILL' 1" }}>note_add</span>
                        Create Resume from Scratch
                      </h2>
                      <p className="text-on-surface-variant text-sm">Fill in your details and generate a professional resume (no AI rewriting) with ATS-friendly structure for your target role.</p>
                    </div>
                  </div>

                  {createError && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-3 text-sm">
                      <span className="material-symbols-outlined text-red-500 shrink-0">error</span>{createError}
                    </div>
                  )}

                  <form onSubmit={handleCreateResume} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Personal Info */}
                      <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-on-surface mb-1">Full Name *</label>
                          <input required type="text" className="w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500"
                            value={createFormData.fullName} onChange={e => setCreateFormData({...createFormData, fullName: e.target.value})} />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-on-surface mb-1">Email</label>
                          <input type="email" className="w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500"
                            value={createFormData.email} onChange={e => setCreateFormData({...createFormData, email: e.target.value})} />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-on-surface mb-1">Phone</label>
                          <input type="tel" className="w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500"
                            value={createFormData.phone} onChange={e => setCreateFormData({...createFormData, phone: e.target.value})} />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-on-surface mb-1">Target Job Title</label>
                          <input type="text" className="w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500"
                            value={createFormData.targetJobTitle} onChange={e => setCreateFormData({...createFormData, targetJobTitle: e.target.value})} />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-on-surface mb-1">Output Format</label>
                          <select
                            className="w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500"
                            value={createFormData.outputFormat}
                            onChange={e => setCreateFormData({ ...createFormData, outputFormat: e.target.value })}
                          >
                            <option value="docx">DOCX</option>
                            <option value="pdf">PDF</option>
                          </select>
                        </div>
                      </div>

                      {/* Content Fields */}
                      <div>
                         <label className="block text-xs font-bold text-on-surface mb-1 text-emerald-600">Target Job Description *</label>
                         <textarea required rows={5} placeholder="Paste the JD here..." className="w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500 resize-y"
                            value={createFormData.targetJobDescription} onChange={e => setCreateFormData({...createFormData, targetJobDescription: e.target.value})} />
                      </div>
                      <div>
                         <label className="block text-xs font-bold text-on-surface mb-1">Experience</label>
                         <textarea rows={5} placeholder="Job titles, companies, dates, achievements..." className="w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500 resize-y"
                            value={createFormData.experience} onChange={e => setCreateFormData({...createFormData, experience: e.target.value})} />
                      </div>
                      <div>
                         <label className="block text-xs font-bold text-on-surface mb-1">Professional Summary & Skills</label>
                         <textarea rows={4} placeholder="Brief summary and list of key skills..." className="w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500 resize-y"
                            value={createFormData.summary} onChange={e => setCreateFormData({...createFormData, summary: e.target.value})} />
                      </div>
                      <div>
                         <label className="block text-xs font-bold text-on-surface mb-1">Skills</label>
                         <textarea rows={4} placeholder="Comma or newline separated skills..." className="w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500 resize-y"
                           value={createFormData.skills} onChange={e => setCreateFormData({...createFormData, skills: e.target.value})} />
                       </div>
                       <div>
                         <label className="block text-xs font-bold text-on-surface mb-1">Education</label>
                         <textarea rows={4} placeholder="Degrees, schools, notable coursework..." className="w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500 resize-y"
                           value={createFormData.education} onChange={e => setCreateFormData({...createFormData, education: e.target.value})} />
                       </div>
                       <div>
                         <label className="block text-xs font-bold text-on-surface mb-1">Projects</label>
                         <textarea rows={4} placeholder="Project name, stack, outcomes..." className="w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-sky-500 resize-y"
                           value={createFormData.projects} onChange={e => setCreateFormData({...createFormData, projects: e.target.value})} />
                      </div>
                    </div>

                    <button type="submit" disabled={!createFormData.fullName || !createFormData.targetJobDescription || creating}
                      className="w-full py-4 bg-gradient-to-r from-sky-500 to-indigo-500 text-white font-bold rounded-2xl hover:from-sky-600 hover:to-indigo-600 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0px_10px_30px_rgba(14,165,233,0.35)] flex items-center justify-center gap-3 text-base">
                      {creating ? (
                        <><span className="material-symbols-outlined animate-spin text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>Crafting your resume...</>
                      ) : (
                        <><span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>draw</span>Create Tailored Resume</>
                      )}
                    </button>
                  </form>
                </>
              )}
            </div>

            {/* Shared Results Panel */}
            {resultToRender && !isLoading && (
              <>
                {/* ATS Score + Keyword Stats Row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* ATS Ring */}
                  <div className="glass-card rounded-3xl p-8 flex flex-col items-center justify-center text-center">
                    <ATSRing score={resultToRender.atsScore} label={resultToRender.atsLabel} />
                    <p className="text-sm text-on-surface-variant mt-4 max-w-[180px]">
                      {resultToRender.totalJdKeywords} tech keywords found in the job description
                    </p>
                  </div>

                  {/* Matched Keywords */}
                  <div className="glass-card rounded-3xl p-6">
                    <h3 className="text-sm font-bold text-emerald-700 mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                      Optimized Keywords ({resultToRender.matchedKeywords?.length || 0})
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {resultToRender.matchedKeywords?.length > 0 ? (
                        resultToRender.matchedKeywords.map(kw => <KeywordPill key={kw} text={kw} variant="match" />)
                      ) : (
                        <p className="text-xs text-on-surface-variant">No matching keywords found.</p>
                      )}
                    </div>
                  </div>

                  {/* Missing Keywords */}
                  <div className="glass-card rounded-3xl p-6">
                    <h3 className="text-sm font-bold text-red-700 mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 0" }}>cancel</span>
                      Still Missing ({resultToRender.missingKeywords?.length || 0})
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {resultToRender.missingKeywords?.length > 0 ? (
                        resultToRender.missingKeywords.map(kw => <KeywordPill key={kw} text={kw} variant="missing" />)
                      ) : (
                        <p className="text-xs text-emerald-700 font-semibold">Your resume is a perfect keyword match!</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* AI-Tuned Resume */}
                <div className="glass-card bg-slate-900/80 rounded-3xl overflow-hidden">
                  <div className="bg-slate-800 px-8 py-5 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <span className="material-symbols-outlined text-emerald-400 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>auto_fix_high</span>
                      <div>
                        <h3 className="text-white font-bold text-base">Final Resume</h3>
                        <p className="text-slate-400 text-xs">Generated from your questionnaire details with ATS-first template logic</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full">
                        {resultToRender.atsScore}% ATS Match
                      </span>
                      <button onClick={() => {
                        const txt = resultToRender.tunedResume || resultToRender.generatedResume;
                        if (txt) {
                          navigator.clipboard.writeText(txt);
                          setCopiedReadme(true); setTimeout(() => setCopiedReadme(false), 2000);
                        }
                      }}
                        className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl font-medium text-sm transition-colors flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>
                          {copiedReadme ? 'check' : 'content_copy'}
                        </span>
                        {copiedReadme ? 'Copied!' : 'Copy'}
                      </button>
                      {resultToRender.fileBase64 && (
                        <button
                          onClick={() => handleDownloadGenerated(resultToRender)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-medium text-sm transition-colors flex items-center gap-2"
                        >
                          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>download</span>
                          Download {resultToRender.outputFormat?.toUpperCase() || 'FILE'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="p-8 max-h-[600px] overflow-y-auto">
                    <pre className="text-slate-200 font-mono text-sm whitespace-pre-wrap leading-relaxed">
                      {resultToRender.tunedResume || resultToRender.generatedResume || "No resume text generated."}
                    </pre>
                  </div>
                </div>

                {/* How it was tuned note */}
                <div className="glass-card border-emerald-200/50 rounded-2xl p-6 flex gap-4">
                  <span className="material-symbols-outlined text-emerald-600 text-xl shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
                  <div>
                    <p className="text-sm font-bold text-emerald-800 mb-1">How Resume Forge works</p>
                    <p className="text-xs text-emerald-700 leading-relaxed">
                      Your factual details are assembled into a deterministic ATS-first resume structure. Job-description keywords are merged into the skill profile, then scored for alignment so you can export the result as DOCX or PDF.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}