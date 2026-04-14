import React, { useState, useEffect } from 'react';
import { api } from '../store/useAuthStore';

// ─── Helper: score → colour family ───────────────────────────────────────────
function scoreColor(score) {
  if (score >= 80) return 'green';
  if (score >= 60) return 'amber';
  return 'red';
}

function scoreBadge(score) {
  if (score >= 85) return { label: 'Excellent', cls: 'bg-green-50 text-green-700' };
  if (score >= 70) return { label: 'Good',      cls: 'bg-amber-50 text-amber-700' };
  if (score >= 55) return { label: 'Fair',       cls: 'bg-orange-50 text-orange-700' };
  return              { label: 'Needs Work',  cls: 'bg-red-50 text-red-700' };
}

const colorMap = {
  green: { bar: 'from-green-400 to-green-600',     bg: 'bg-green-50',  text: 'text-green-700'  },
  amber: { bar: 'from-amber-400 to-amber-600',     bg: 'bg-amber-50',  text: 'text-amber-700'  },
  red:   { bar: 'from-red-400   to-red-500',       bg: 'bg-red-50',    text: 'text-red-700'    },
};

// ─── Score Bar Card ───────────────────────────────────────────────────────────
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
        <div
          className={`h-full bg-gradient-to-r ${c.bar} rounded-full transition-all duration-1000`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

// ─── Suggestion Card ─────────────────────────────────────────────────────────
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

// ─── Overall Score Ring ───────────────────────────────────────────────────────
function ScoreRing({ score }) {
  const badge = scoreBadge(score);
  const c = colorMap[scoreColor(score)];
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="#e2e8f0" strokeWidth="10" />
          <circle
            cx="60" cy="60" r="54" fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={`transition-all duration-1000 ${score >= 80 ? 'stroke-green-500' : score >= 60 ? 'stroke-amber-500' : 'stroke-red-400'}`}
          />
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

// ─── Recent Uploads sidebar widget ───────────────────────────────────────────
function RecentUploads({ resumes, onResumeClick }) {
  const formatDate = (ts) =>
    new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <section className="space-y-6">
      <h2 className="text-xl font-bold flex items-center gap-3">
        <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 0" }}>history</span>
        Recent Uploads
      </h2>

      {resumes.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl p-8 text-center text-on-surface-variant text-sm">
          <span className="material-symbols-outlined text-3xl mb-3 block opacity-40">description</span>
          No resumes analyzed yet. Upload your first one!
        </div>
      ) : (
        <div className="space-y-4">
          {resumes.map((r) => {
            const color = scoreColor(r.overall_score);
            const c = colorMap[color];
            const isPdf = r.file_name?.toLowerCase().endsWith('.pdf');
            return (
              <button
                key={r.id}
                onClick={() => onResumeClick(r.id)}
                className="w-full group bg-surface-container-lowest p-5 rounded-2xl shadow-[0px_10px_30px_rgba(0,78,159,0.04)] hover:shadow-lg hover:-translate-y-1 transition-all duration-300 text-left"
              >
                <div className="flex items-start justify-between mb-3">
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
                  <div
                    className={`h-full bg-gradient-to-r ${c.bar} rounded-full`}
                    style={{ width: `${r.overall_score}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Decorative illustration */}
      <div className="mt-4 rounded-3xl overflow-hidden aspect-video relative group bg-surface-container">
        <img
          alt="Professional workspace"
          className="w-full h-full object-cover grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700 mix-blend-multiply"
          src="https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent flex items-end p-6">
          <p className="text-xs font-bold italic text-white/90">"Your resume is your professional signature."</p>
        </div>
      </div>
    </section>
  );
}

// ─── Upload View ──────────────────────────────────────────────────────────────
function UploadView({ file, setFile, isDragOver, setIsDragOver, onUpload, error, recentResumes, onResumeClick }) {
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && /\.(pdf|doc|docx)$/i.test(dropped.name)) setFile(dropped);
  };

  return (
    <>
      <header className="mb-12">
        <h1 className="text-5xl font-extrabold tracking-tight text-on-surface font-headline mb-4">Resume Optimizer</h1>
        <p className="text-xl text-on-surface-variant max-w-2xl leading-relaxed">
          Elevate your professional narrative. Our AI-driven analysis scans for keyword density, structural clarity, and impact metrics to help you land the interview.
        </p>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-3">
          <span className="material-symbols-outlined text-red-500 shrink-0">error</span>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <section className="lg:col-span-2 space-y-8">
          {/* Drop Zone */}
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/10 to-primary-container/10 rounded-3xl blur opacity-75 group-hover:opacity-100 transition duration-1000" />
            <div
              className={`relative bg-surface-container-lowest rounded-3xl p-12 border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center text-center cursor-pointer min-h-[400px]
                ${isDragOver ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-outline-variant/40 hover:border-primary/50'}`}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
              onClick={() => document.getElementById('resume-upload').click()}
            >
              <input
                type="file"
                id="resume-upload"
                className="hidden"
                accept=".pdf,.doc,.docx"
                onChange={(e) => setFile(e.target.files[0])}
              />

              <div className="w-20 h-20 bg-surface-container-low rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
                <span className="material-symbols-outlined text-primary text-4xl" style={{ fontVariationSettings: "'FILL' 0" }}>upload_file</span>
              </div>

              <h3 className="text-2xl font-bold mb-2">Drop your resume here</h3>
              <p className="text-on-surface-variant mb-8 font-medium">Or click anywhere to browse from your computer</p>

              <div className="flex gap-4 items-center mb-8">
                {[['picture_as_pdf', 'PDF'], ['description', 'DOCX']].map(([icon, fmt]) => (
                  <div key={fmt} className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg">
                    <span className="material-symbols-outlined text-sm text-slate-500" style={{ fontVariationSettings: "'FILL' 0" }}>{icon}</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600">{fmt}</span>
                  </div>
                ))}
              </div>

              {file ? (
                <div className="flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-3 px-5 py-3 bg-primary/5 border border-primary/20 rounded-xl">
                    <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 0" }}>
                      {file.name.endsWith('.pdf') ? 'picture_as_pdf' : 'description'}
                    </span>
                    <div className="text-left">
                      <p className="text-sm font-bold text-slate-800">{file.name}</p>
                      <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setFile(null); }}
                      className="ml-2 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>
                  <button
                    onClick={onUpload}
                    className="bg-gradient-to-br from-primary to-primary-container text-white py-4 px-10 rounded-xl font-bold shadow-[0px_20px_40px_rgba(0,78,159,0.15)] hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>analytics</span>
                    Analyze Resume
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="resume-upload"
                  className="bg-white border-2 border-outline-variant/50 text-slate-700 py-3 px-8 rounded-xl font-bold hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                >
                  Choose File
                </label>
              )}

              <p className="mt-8 text-xs text-outline font-medium">Maximum file size: 10MB</p>
            </div>
          </div>

          {/* Pro Tip */}
          <div className="bg-primary/5 rounded-3xl p-8 flex gap-6 items-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 0" }}>lightbulb</span>
            </div>
            <div>
              <h4 className="font-bold text-primary mb-1">Pro Tip</h4>
              <p className="text-sm text-on-surface-variant leading-relaxed">PDF format is recommended to maintain layout integrity during our AI semantic structure scan.</p>
            </div>
          </div>
        </section>

        <RecentUploads resumes={recentResumes} onResumeClick={onResumeClick} />
      </div>
    </>
  );
}

// ─── Analyzing View ───────────────────────────────────────────────────────────
function AnalyzingView({ fileName }) {
  const steps = ['ATS Scan', 'Keyword Analysis', 'Impact Metrics', 'Structure Check', 'Industry Fit'];
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-10">
      <div className="relative w-36 h-36">
        <div className="absolute inset-0 rounded-full border-4 border-primary/15" />
        <div className="absolute inset-0 rounded-full border-4 border-t-primary border-r-primary border-b-transparent border-l-transparent animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-5xl" style={{ fontVariationSettings: "'FILL' 0" }}>auto_awesome</span>
        </div>
      </div>

      <div className="text-center">
        <h2 className="text-3xl font-bold mb-3">Analyzing Your Resume</h2>
        <p className="text-on-surface-variant max-w-md mb-2">
          Our AI is scanning <span className="font-semibold text-primary">{fileName}</span> for compatibility, keyword density, impact metrics, and structural clarity...
        </p>
      </div>

      <div className="flex gap-3 flex-wrap justify-center max-w-lg">
        {steps.map((step, i) => (
          <span
            key={step}
            className="px-4 py-2 bg-primary/5 rounded-full text-sm font-medium text-primary animate-pulse"
            style={{ animationDelay: `${i * 0.25}s` }}
          >
            {step}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Results View ─────────────────────────────────────────────────────────────
function ResultsView({ analysis, onNewAnalysis, recentResumes, onResumeClick }) {
  const { file_name, overall_score, scores, sections, suggestions, created_at } = analysis;

  const scoreMetrics = [
    { key: 'ats',          label: 'ATS Compatibility', icon: 'verified'         },
    { key: 'impact',       label: 'Impact Statements', icon: 'trending_up'      },
    { key: 'skills',       label: 'Skills Match',      icon: 'psychology'       },
    { key: 'clarity',      label: 'Clarity',           icon: 'visibility'       },
    { key: 'completeness', label: 'Completeness',      icon: 'checklist'        },
    { key: 'industry_fit', label: 'Industry Fit',      icon: 'work'             },
  ];

  const sectionLabels = {
    summary:        'Summary',
    experience:     'Experience',
    education:      'Education',
    skills:         'Skills',
    projects:       'Projects',
    certifications: 'Certifications',
  };

  const formatDate = (ts) =>
    new Date(ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <>
      <header className="mb-10 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-on-surface font-headline mb-1">Analysis Results</h1>
          <p className="text-on-surface-variant flex items-center gap-2">
            <span className="material-symbols-outlined text-sm opacity-60" style={{ fontVariationSettings: "'FILL' 0" }}>
              {file_name?.endsWith('.pdf') ? 'picture_as_pdf' : 'description'}
            </span>
            {file_name} &bull; {formatDate(created_at)}
          </p>
        </div>
        <button
          onClick={onNewAnalysis}
          className="self-start sm:self-auto flex items-center gap-2 px-6 py-3 bg-white border-2 border-outline-variant/40 rounded-xl font-bold hover:bg-slate-50 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>upload_file</span>
          Analyze Another
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: scores + suggestions */}
        <section className="lg:col-span-2 space-y-8">
          {/* Overall + metric bars */}
          <div className="bg-surface-container-lowest rounded-3xl p-8 shadow-[0px_10px_30px_rgba(0,78,159,0.06)]">
            <div className="flex flex-col sm:flex-row items-center gap-8 mb-8">
              <ScoreRing score={overall_score} />
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-2">Overall Resume Score</h2>
                <p className="text-on-surface-variant text-sm leading-relaxed">
                  Your resume has been evaluated across 6 key dimensions. Focus on the areas marked in amber or red for the highest improvement impact.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {scoreMetrics.map(({ key, label, icon }) => (
                <ScoreBar key={key} label={label} score={scores?.[key] ?? 0} icon={icon} />
              ))}
            </div>
          </div>

          {/* Improvement suggestions */}
          <div className="bg-surface-container-lowest rounded-3xl p-8 shadow-[0px_10px_30px_rgba(0,78,159,0.06)]">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 0" }}>tips_and_updates</span>
              Improvement Suggestions
            </h3>
            <div className="space-y-3">
              {(suggestions || []).map((s, i) => (
                <SuggestionCard key={i} {...s} />
              ))}
            </div>
          </div>
        </section>

        {/* Right: sections detected + recent uploads */}
        <div className="space-y-6">
          {/* Sections detected */}
          <div className="bg-surface-container-lowest rounded-3xl p-6 shadow-[0px_10px_30px_rgba(0,78,159,0.06)]">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>checklist</span>
              Sections Detected
            </h3>
            <div className="space-y-2">
              {Object.entries(sectionLabels).map(([key, label]) => {
                const present = sections?.[key];
                return (
                  <div key={key} className="flex items-center justify-between py-2 border-b border-outline-variant/10 last:border-0">
                    <span className="text-sm font-medium text-slate-700">{label}</span>
                    <span className={`flex items-center gap-1 text-xs font-bold ${present ? 'text-green-600' : 'text-slate-400'}`}>
                      <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                        {present ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                      {present ? 'Found' : 'Missing'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick tips card */}
          <div className="bg-gradient-to-br from-primary to-primary-container rounded-3xl p-6 text-white">
            <h3 className="font-bold mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>lightbulb</span>
              Quick Win
            </h3>
            <p className="text-sm leading-relaxed text-white/90">
              Tailor your resume to each job description. Mirroring the job's exact keywords can increase your ATS score by up to 40%.
            </p>
          </div>

          <RecentUploads resumes={recentResumes} onResumeClick={onResumeClick} />
        </div>
      </div>
    </>
  );
}

// ─── My Resumes View ──────────────────────────────────────────────────────────
function MyResumesView({ resumes, onResumeClick, onNewAnalysis }) {
  const formatDate = (ts) =>
    new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <>
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-on-surface font-headline mb-1">My Resumes</h1>
          <p className="text-on-surface-variant">{resumes.length} resume{resumes.length !== 1 ? 's' : ''} analyzed</p>
        </div>
        <button
          onClick={onNewAnalysis}
          className="flex items-center gap-2 bg-gradient-to-br from-primary to-primary-container text-white py-3 px-6 rounded-xl font-semibold shadow-[0px_20px_40px_rgba(0,78,159,0.15)] hover:scale-105 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>add</span>
          New Analysis
        </button>
      </header>

      {resumes.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-6 text-center">
          <div className="w-20 h-20 bg-surface-container-low rounded-2xl flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-outline" style={{ fontVariationSettings: "'FILL' 0" }}>description</span>
          </div>
          <div>
            <h3 className="text-xl font-bold mb-2">No Resumes Yet</h3>
            <p className="text-on-surface-variant">Upload your first resume to see your analysis history here.</p>
          </div>
          <button
            onClick={onNewAnalysis}
            className="bg-gradient-to-br from-primary to-primary-container text-white py-3 px-8 rounded-xl font-bold hover:scale-105 active:scale-95 transition-all"
          >
            Upload Resume
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {resumes.map((r) => {
            const c = colorMap[scoreColor(r.overall_score)];
            const badge = scoreBadge(r.overall_score);
            const isPdf = r.file_name?.toLowerCase().endsWith('.pdf');
            return (
              <button
                key={r.id}
                onClick={() => onResumeClick(r.id)}
                className="group bg-surface-container-lowest p-6 rounded-3xl shadow-[0px_10px_30px_rgba(0,78,159,0.04)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-left"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-12 h-14 ${isPdf ? 'bg-red-50' : 'bg-blue-50'} rounded-xl flex items-center justify-center shrink-0`}>
                    <span className={`material-symbols-outlined text-2xl ${isPdf ? 'text-red-500' : 'text-blue-500'}`} style={{ fontVariationSettings: "'FILL' 0" }}>
                      {isPdf ? 'picture_as_pdf' : 'description'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className="font-bold text-sm truncate">{r.file_name}</h5>
                    <p className="text-xs text-outline mt-0.5">{formatDate(r.created_at)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-slate-500 font-medium">Overall Score</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                    <span className={`text-xl font-black ${c.text}`}>{r.overall_score}</span>
                  </div>
                </div>

                <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${c.bar} rounded-full`}
                    style={{ width: `${r.overall_score}%` }}
                  />
                </div>

                <div className="mt-4 pt-4 border-t border-outline-variant/10 flex items-center justify-between text-xs text-outline font-medium group-hover:text-primary transition-colors">
                  <span>View Full Analysis</span>
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ResumeOptimizer() {
  const [view, setView]           = useState('upload');   // upload | analyzing | results | myResumes
  const [file, setFile]           = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [analysis, setAnalysis]   = useState(null);
  const [recentResumes, setRecentResumes] = useState([]);
  const [activeNav, setActiveNav] = useState('analysis');
  const [error, setError]         = useState(null);
  const [analyzingFileName, setAnalyzingFileName] = useState('');

  useEffect(() => {
    fetchRecentResumes();
  }, []);

  const fetchRecentResumes = async () => {
    try {
      const { data } = await api.get('/resume/list');
      if (data.success) setRecentResumes(data.data);
    } catch {
      // not logged in or network error — silently degrade
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setAnalyzingFileName(file.name);
    setView('analyzing');
    setError(null);

    try {
      const formData = new FormData();
      formData.append('resume', file);

      const { data } = await api.post('/resume/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (data.success) {
        setAnalysis(data.data);
        setView('results');
        setActiveNav('analysis');
        fetchRecentResumes();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Analysis failed. Please check you are logged in and try again.');
      setView('upload');
    }
  };

  const handleResumeClick = async (id) => {
    try {
      const { data } = await api.get(`/resume/${id}`);
      if (data.success) {
        setAnalysis(data.data);
        setView('results');
        setActiveNav('analysis');
      }
    } catch {
      setError('Could not load resume details.');
    }
  };

  const handleNavClick = (key) => {
    setActiveNav(key);
    setError(null);
    if (key === 'myResumes' || key === 'history') {
      setView('myResumes');
    } else if (key === 'analysis') {
      setView(analysis ? 'results' : 'upload');
    } else {
      // AI Editor / Premium — fall back to upload for now
      setView('upload');
    }
  };

  const navItems = [
    { key: 'myResumes', icon: 'description',       label: 'My Resumes' },
    { key: 'analysis',  icon: 'analytics',         label: 'Analysis'   },
    { key: 'aiEditor',  icon: 'auto_awesome',      label: 'AI Editor'  },
    { key: 'history',   icon: 'history',           label: 'History'    },
    { key: 'premium',   icon: 'workspace_premium', label: 'Premium'    },
  ];

  return (
    <div className="flex pt-[0px] min-h-[calc(100vh-5rem)] w-full">
      {/* ─── Sidebar ─────────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col gap-2 p-4 w-64 bg-slate-50 border-r border-slate-200 fixed left-0 top-20 h-[calc(100vh-5rem)] font-headline font-medium z-[40]">
        <div className="px-4 py-6 mb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
            </div>
            <span className="text-lg font-black text-blue-900">Resume Pro</span>
          </div>
          <p className="text-xs text-slate-500 uppercase tracking-widest pl-11">Optimization Engine</p>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => handleNavClick(item.key)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:translate-x-1 transition-all duration-200 text-left
                ${activeNav === item.key
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100'
                }`}
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <button
          onClick={() => { setView('upload'); setFile(null); setAnalysis(null); setError(null); setActiveNav('analysis'); }}
          className="mt-auto mb-4 mx-2 bg-gradient-to-br from-primary to-primary-container text-white py-3 px-6 rounded-xl font-semibold shadow-[0px_20px_40px_rgba(0,78,159,0.15)] active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>add</span>
          New Analysis
        </button>
      </aside>

      {/* ─── Main Content ─────────────────────────────────────────── */}
      <main className="flex-1 ml-0 md:ml-64 p-8 md:p-12 bg-surface min-h-[calc(100vh-5rem)]">
        <div className="max-w-6xl mx-auto">
          {view === 'upload' && (
            <UploadView
              file={file}
              setFile={setFile}
              isDragOver={isDragOver}
              setIsDragOver={setIsDragOver}
              onUpload={handleUpload}
              error={error}
              recentResumes={recentResumes}
              onResumeClick={handleResumeClick}
            />
          )}

          {view === 'analyzing' && <AnalyzingView fileName={analyzingFileName} />}

          {view === 'results' && analysis && (
            <ResultsView
              analysis={analysis}
              onNewAnalysis={() => { setView('upload'); setFile(null); setAnalysis(null); setError(null); setActiveNav('analysis'); }}
              recentResumes={recentResumes}
              onResumeClick={handleResumeClick}
            />
          )}

          {view === 'myResumes' && (
            <MyResumesView
              resumes={recentResumes}
              onResumeClick={handleResumeClick}
              onNewAnalysis={() => { setView('upload'); setFile(null); setActiveNav('analysis'); }}
            />
          )}
        </div>
      </main>
    </div>
  );
}
