import React, { useState, useEffect, useRef } from 'react';
import { api } from '../store/useAuthStore';
import { useActivityTracker } from '../hooks/useActivityTracker';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getScoreColor(score) {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#0ea5e9';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

function getGradeLabel(score) {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Average';
  return 'Needs Work';
}

function parseUsername(raw) {
  const trimmed = raw.trim();
  // Handle full URLs: https://github.com/username or github.com/username
  const match = trimmed.match(/(?:https?:\/\/)?github\.com\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  return trimmed;
}

function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline stages definition
// ─────────────────────────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { id: 1, name: 'Data Collection', description: 'Fetching GitHub profile & repositories' },
  { id: 2, name: 'Portfolio Scoring', description: 'Scoring profile completeness & quality' },
  { id: 3, name: 'Project Analysis', description: 'Identifying showcase projects' },
  { id: 4, name: 'AI Enhancement', description: 'Generating recommendations & README' },
  { id: 5, name: 'Final Report', description: 'Assembling your recruiter report' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Atomic UI pieces
// ─────────────────────────────────────────────────────────────────────────────

function StageIcon({ status }) {
  if (status === 'running') {
    return (
      <span className="material-symbols-outlined text-sky-500 text-2xl animate-spin" style={{ fontVariationSettings: "'FILL' 0" }}>
        sync
      </span>
    );
  }
  if (status === 'done') {
    return (
      <span className="material-symbols-outlined text-emerald-500 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
        check_circle
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="material-symbols-outlined text-rose-500 text-2xl" style={{ fontVariationSettings: "'FILL' 0" }}>
        error
      </span>
    );
  }
  return (
    <span className="material-symbols-outlined text-outline text-2xl" style={{ fontVariationSettings: "'FILL' 0" }}>
      radio_button_unchecked
    </span>
  );
}

function ScoreGauge({ score, size = 120 }) {
  const color = getScoreColor(score);
  const r = 15.9;
  const dashArray = `${(score / 100) * 100} 100`;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="-rotate-90" style={{ width: size, height: size }}>
        <circle cx="18" cy="18" r={r} fill="none" className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="3.2" />
        <circle
          cx="18" cy="18" r={r} fill="none"
          stroke={color}
          strokeWidth="3.2"
          strokeDasharray={dashArray}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-extrabold text-on-surface" style={{ fontSize: size * 0.25 }}>{score}</span>
        <span className="font-bold text-on-surface-variant" style={{ fontSize: size * 0.1 }}>/ 100</span>
      </div>
    </div>
  );
}

function ReadmePanel({ content, filename = 'README.md', badge = null }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!content) return;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/50 overflow-hidden flex flex-col">
      <div className="border-b border-slate-200 dark:border-white/10 bg-slate-200/80 dark:bg-slate-950/80 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-slate-600 dark:text-slate-200 text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>
            description
          </span>
          <span className="text-slate-900 dark:text-white font-bold text-base">{filename}</span>
          {badge && (
            <span
              className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
                badge === 'AI-generated' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-600/60 text-slate-600 dark:text-slate-300'
              }`}
            >
              {badge}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-300/50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-white rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-500/70 transition-colors"
          >
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>
              {copied ? 'check' : 'content_copy'}
            </span>
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-300/50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-white rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-500/70 transition-colors"
          >
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>download</span>
            .md
          </button>
        </div>
      </div>
      <div className="p-6 overflow-y-auto max-h-96 bg-slate-100 dark:bg-slate-950/80">
        <pre className="text-slate-800 dark:text-white font-mono text-sm whitespace-pre-wrap leading-relaxed font-semibold">
          {content || '— No content —'}
        </pre>
      </div>
    </div>
  );
}

function Collapsible({ title, icon, iconColor = 'text-on-surface-variant', defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-8 py-6 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
      >
        <h3 className="text-xl font-bold text-on-surface font-headline flex items-center gap-3">
          <span className={`material-symbols-outlined text-xl ${iconColor}`} style={{ fontVariationSettings: "'FILL' 0" }}>
            {icon}
          </span>
          {title}
        </h3>
        <span
          className="material-symbols-outlined text-outline text-xl transition-transform duration-200"
          style={{ fontVariationSettings: "'FILL' 0", transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          expand_more
        </span>
      </button>
      {open && (
        <div className="px-8 pb-8 border-t border-slate-200 dark:border-white/10">
          <div className="pt-6">{children}</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Repo README Modal
// ─────────────────────────────────────────────────────────────────────────────

function RepoReadmeModal({ modal, onClose }) {
  if (!modal.open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-200 dark:border-white/10">
          <div>
            <h3 className="text-xl font-bold text-on-surface font-headline">Repository README</h3>
            {modal.repo && (
              <p className="text-sm text-on-surface-variant font-medium mt-0.5">{modal.repo}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center glass-card rounded-2xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined text-on-surface-variant text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {modal.loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <span className="material-symbols-outlined animate-spin text-slate-500 text-5xl" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
              <p className="text-on-surface-variant font-medium">Generating README for {modal.repo}...</p>
            </div>
          ) : modal.readme ? (
            <ReadmePanel
              content={modal.readme}
              filename={`${modal.repo}-README.md`}
              badge="AI-generated"
            />
          ) : (
            <p className="text-on-surface-variant font-medium text-center py-8">No README generated.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Tracker
// ─────────────────────────────────────────────────────────────────────────────

function PipelineTracker({ statuses }) {
  return (
    <div className="card p-8 rounded-2xl max-w-2xl mx-auto">
      <h3 className="text-base font-bold text-on-surface font-headline text-center mb-8">Analysis in Progress</h3>
      <div className="space-y-4">
        {PIPELINE_STAGES.map((stage) => {
          const status = statuses[stage.id] ?? 'idle';
          const isRunning = status === 'running';
          const isDone = status === 'done';
          return (
            <div key={stage.id} className="flex items-center gap-4">
              <div className="w-10 flex items-center justify-center flex-shrink-0">
                <StageIcon status={status} />
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className={`font-bold text-sm ${
                    isDone
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : isRunning
                      ? 'text-on-surface'
                      : 'text-on-surface-variant'
                  }`}
                >
                  {stage.name}
                </div>
                <div className="text-xs text-on-surface-variant font-medium mt-0.5">{stage.description}</div>
              </div>
              <div className="flex-shrink-0">
                {isDone && (
                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-bold">
                    Done
                  </span>
                )}
                {isRunning && (
                  <span className="px-2 py-0.5 bg-sky-500/10 text-sky-600 dark:text-sky-400 rounded-lg text-xs font-bold">
                    Running
                  </span>
                )}
                {status === 'idle' && (
                  <span className="px-2 py-0.5 bg-surface-container text-outline rounded-lg text-xs font-bold">
                    Waiting
                  </span>
                )}
                {status === 'error' && (
                  <span className="px-2 py-0.5 bg-rose-500/10 text-rose-600 rounded-lg text-xs font-bold">
                    Failed
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 1 — Profile Health Score
// ─────────────────────────────────────────────────────────────────────────────

function Stage1ProfileHealth({ data }) {
  if (!data) return null;
  const score = data.score ?? 0;
  const color = getScoreColor(score);
  const grade = getGradeLabel(score);

  return (
    <div className="card p-8 rounded-2xl">
      <h2 className="text-xl font-bold text-on-surface font-headline flex items-center gap-3 mb-8">
        <span className="material-symbols-outlined text-sky-500 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>analytics</span>
        Profile Health Score
      </h2>

      <div className="flex flex-col sm:flex-row items-center gap-8">
        <div className="flex-shrink-0">
          <ScoreGauge score={score} size={140} />
        </div>
        <div className="flex-1 space-y-4 w-full">
          <div>
            <span
              className="inline-block px-4 py-1.5 rounded-2xl text-sm font-bold"
              style={{ backgroundColor: `${color}20`, color }}
            >
              {grade}
            </span>
          </div>
          {data.scoreDescription && (
            <p className="text-on-surface-variant font-medium text-sm leading-relaxed">{data.scoreDescription}</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: 'account_tree', label: 'Repos', value: data.repoCount ?? data.totalRepos ?? '—', fill: 0, cls: 'text-outline' },
              { icon: 'star', label: 'Stars', value: data.stars ?? data.totalStars ?? '—', fill: 1, cls: 'text-amber-500' },
              { icon: 'group', label: 'Followers', value: data.followers ?? '—', fill: 0, cls: 'text-outline' },
              { icon: 'code', label: 'Languages', value: data.languages?.length ?? '—', fill: 0, cls: 'text-outline' },
            ].map((stat, i) => (
              <div key={i} className="glass-card bg-surface-container/30 p-3 rounded-2xl text-center">
                <span
                  className={`material-symbols-outlined text-lg mb-1 block ${stat.cls}`}
                  style={{ fontVariationSettings: `"FILL" ${stat.fill}` }}
                >
                  {stat.icon}
                </span>
                <div className="font-extrabold text-lg text-on-surface">{stat.value}</div>
                <div className="text-xs font-bold text-outline uppercase tracking-wider">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {data.languages && data.languages.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {data.languages.slice(0, 10).map((lang, i) => (
            <span key={i} className="px-3 py-1 glass-card bg-surface-container/30 rounded-xl text-xs font-bold text-on-surface-variant">
              {lang}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 2 — Repository Audit
// ─────────────────────────────────────────────────────────────────────────────

function Stage2RepoAudit({ data, onGenerateReadme }) {
  if (!data) return null;

  const repos = data.repos ?? data.repositories ?? [];
  const auditScore = data.auditScore ?? data.score ?? null;
  const scoreBreakdown = data.scoreBreakdown ?? data.breakdown ?? [];

  const statusIcon = (status) => {
    if (status === 'good') return { icon: 'check_circle', cls: 'text-emerald-500', fill: 1 };
    if (status === 'warning' || status === 'warn') return { icon: 'warning', cls: 'text-amber-500', fill: 0 };
    return { icon: 'cancel', cls: 'text-rose-500', fill: 1 };
  };

  return (
    <div className="card p-8 rounded-2xl">
      <h2 className="text-xl font-bold text-on-surface font-headline flex items-center gap-3 mb-6">
        <span className="material-symbols-outlined text-amber-500 text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>folder_open</span>
        Repository Audit
      </h2>

      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div className="px-4 py-2 glass-card bg-surface-container/30 rounded-2xl text-sm font-bold text-on-surface">
          {repos.length} repos found
        </div>
        {auditScore !== null && (
          <div
            className="px-4 py-2 rounded-2xl text-sm font-bold"
            style={{ backgroundColor: `${getScoreColor(auditScore)}20`, color: getScoreColor(auditScore) }}
          >
            Audit Score: {auditScore}/100
          </div>
        )}
      </div>

      {scoreBreakdown.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-bold text-outline uppercase tracking-wider mb-4">Score Breakdown</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {scoreBreakdown.map((cat, i) => {
              const pct = cat.max > 0 ? Math.round((cat.score / cat.max) * 100) : 0;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-on-surface-variant w-32 flex-shrink-0 truncate">
                    {cat.label ?? cat.name}
                  </span>
                  <div className="flex-1 h-2 bg-surface-container rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, backgroundColor: getScoreColor(pct) }}
                    />
                  </div>
                  <span className="text-xs font-bold text-on-surface-variant w-12 text-right flex-shrink-0">
                    {cat.score}/{cat.max}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {repos.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10">
                <th className="text-left text-xs font-bold text-outline uppercase tracking-wider pb-3 pr-4">Repo</th>
                <th className="text-left text-xs font-bold text-outline uppercase tracking-wider pb-3 pr-4">Lang</th>
                <th className="text-left text-xs font-bold text-outline uppercase tracking-wider pb-3 pr-4">Stars</th>
                <th className="text-left text-xs font-bold text-outline uppercase tracking-wider pb-3 pr-4">Status</th>
                <th className="text-left text-xs font-bold text-outline uppercase tracking-wider pb-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {repos.map((repo, i) => {
                const st = statusIcon(repo.status);
                return (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                    <td className="py-3 pr-4">
                      <div className="font-bold text-on-surface text-sm">{repo.name}</div>
                      {repo.description && (
                        <div className="text-xs text-on-surface-variant mt-0.5 max-w-xs truncate">{repo.description}</div>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {repo.language && (
                        <span className="px-2 py-0.5 glass-card bg-surface-container/40 rounded-lg text-xs font-bold text-on-surface-variant">
                          {repo.language}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1 text-xs font-bold text-on-surface-variant">
                        <span className="material-symbols-outlined text-amber-400 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                        {repo.stars ?? repo.stargazersCount ?? 0}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`material-symbols-outlined text-base ${st.cls}`}
                          style={{ fontVariationSettings: `"FILL" ${st.fill}` }}
                        >
                          {st.icon}
                        </span>
                        {repo.homepage && (
                          <span className="px-2 py-0.5 bg-sky-500/10 text-sky-600 rounded-lg text-xs font-bold">Hosted</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => onGenerateReadme(repo)}
                        className="px-3 py-1.5 glass-card hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl text-xs font-bold text-on-surface-variant border border-slate-200 dark:border-white/10 transition-colors flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 0" }}>auto_awesome</span>
                        README
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 3 — Showcase Projects
// ─────────────────────────────────────────────────────────────────────────────

function Stage3ShowcaseProjects({ data }) {
  if (!data) return null;
  const projects = data.topProjects ?? data.showcaseProjects ?? data.projects ?? [];
  const hasPortfolio = data.hasPortfolio ?? false;

  return (
    <div className="card p-8 rounded-2xl">
      <h2 className="text-xl font-bold text-on-surface font-headline flex items-center gap-3 mb-6">
        <span className="material-symbols-outlined text-emerald-500 text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>workspace_premium</span>
        Showcase Projects
      </h2>

      {hasPortfolio ? (
        <div className="flex items-center gap-3 mb-6 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
          <span className="material-symbols-outlined text-emerald-500 text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          <span className="text-emerald-700 dark:text-emerald-400 font-bold text-sm">Portfolio website detected</span>
        </div>
      ) : (
        <div className="flex items-center gap-3 mb-6 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
          <span className="material-symbols-outlined text-amber-500 text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>warning</span>
          <span className="text-amber-700 dark:text-amber-400 font-bold text-sm">
            No portfolio website found — hosting a project would significantly boost your profile
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.slice(0, 5).map((proj, i) => (
          <div key={i} className="glass-card bg-surface-container/20 rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="font-bold text-on-surface text-sm leading-tight">{proj.name}</div>
              <div className="flex items-center gap-1 text-xs font-bold text-amber-500 flex-shrink-0">
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                {proj.stars ?? proj.stargazersCount ?? 0}
              </div>
            </div>
            {proj.description && (
              <p className="text-xs text-on-surface-variant font-medium leading-relaxed line-clamp-2">{proj.description}</p>
            )}
            <div className="flex items-center gap-2 mt-auto flex-wrap">
              {proj.language && (
                <span className="px-2 py-0.5 glass-card bg-surface-container/40 rounded-lg text-xs font-bold text-on-surface-variant">
                  {proj.language}
                </span>
              )}
              {proj.homepage && (
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-bold">
                  Hosted
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 4 — AI Recommendations sub-pieces
// ─────────────────────────────────────────────────────────────────────────────

function BioSuggestion({ current, suggested }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!suggested) return;
    navigator.clipboard.writeText(suggested);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-bold text-outline uppercase tracking-wider mb-2">Current</div>
        <div className="px-4 py-3 bg-surface-container/40 rounded-2xl text-on-surface-variant font-medium text-sm">
          {current || <span className="italic text-outline">No bio set</span>}
        </div>
      </div>
      {suggested && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-outline uppercase tracking-wider">Suggested</div>
            <span className="text-xs text-outline">{suggested.length} chars</span>
          </div>
          <div className="px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-on-surface font-medium text-sm">
            {suggested}
          </div>
          <button
            onClick={handleCopy}
            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 glass-card hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl text-xs font-bold text-on-surface-variant border border-slate-200 dark:border-white/10 transition-colors"
          >
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>
              {copied ? 'check' : 'content_copy'}
            </span>
            {copied ? 'Copied!' : 'Copy suggestion'}
          </button>
        </div>
      )}
    </div>
  );
}

function RepoSuggestionRow({ suggestion }) {
  const [copiedName, setCopiedName] = useState(false);
  const [copiedDesc, setCopiedDesc] = useState(false);

  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
      <td className="py-3 pr-4 font-mono text-xs text-on-surface-variant">
        {suggestion.current ?? suggestion.currentName}
      </td>
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
            {suggestion.suggested ?? suggestion.suggestedName}
          </span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(suggestion.suggested ?? suggestion.suggestedName ?? '');
              setCopiedName(true);
              setTimeout(() => setCopiedName(false), 1500);
            }}
            className="w-6 h-6 flex items-center justify-center glass-card hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg text-outline border border-slate-200 dark:border-white/10 transition-colors"
          >
            <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 0" }}>
              {copiedName ? 'check' : 'content_copy'}
            </span>
          </button>
        </div>
      </td>
      <td className="py-3 pr-4 text-xs text-on-surface-variant max-w-xs">
        <div className="flex items-center gap-2">
          <span className="truncate">{suggestion.description ?? suggestion.suggestedDescription ?? '—'}</span>
          {(suggestion.description || suggestion.suggestedDescription) && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(suggestion.description ?? suggestion.suggestedDescription ?? '');
                setCopiedDesc(true);
                setTimeout(() => setCopiedDesc(false), 1500);
              }}
              className="w-6 h-6 flex-shrink-0 flex items-center justify-center glass-card hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg text-outline border border-slate-200 dark:border-white/10 transition-colors"
            >
              <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 0" }}>
                {copiedDesc ? 'check' : 'content_copy'}
              </span>
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function Stage4AIRecommendations({ data }) {
  if (!data) return null;

  const readme = data.profileReadme ?? data.generatedReadme ?? data.readme ?? '';
  const aiPowered = data.aiPowered ?? true;
  const bioSuggestion = data.bioSuggestion ?? data.suggestedBio ?? null;
  const currentBio = data.currentBio ?? '';
  const repoSuggestions = data.repoSuggestions ?? data.repoNameSuggestions ?? [];
  const hostingRecs = data.hostingRecommendations ?? data.hostingRecs ?? [];

  const platformStyles = {
    vercel: 'bg-black text-white',
    railway: 'bg-purple-600 text-white',
    'github pages': 'bg-sky-600 text-white',
    render: 'bg-green-600 text-white',
  };
  const getPlatformStyle = (platform) => {
    const key = (platform || '').toLowerCase();
    for (const k of Object.keys(platformStyles)) {
      if (key.includes(k)) return platformStyles[k];
    }
    return 'bg-slate-700 text-white';
  };

  const priorityBadge = {
    high: 'bg-rose-500/10 text-rose-600',
    medium: 'bg-amber-500/10 text-amber-600',
    low: 'bg-sky-500/10 text-sky-600',
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-on-surface font-headline flex items-center gap-3 mb-2">
        <span className="material-symbols-outlined text-purple-500 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
        AI Recommendations
      </h2>

      {readme && (
        <Collapsible title="Profile README" icon="description" iconColor="text-slate-400" defaultOpen={true}>
          <ReadmePanel content={readme} filename="README.md" badge={aiPowered ? 'AI-generated' : 'Template'} />
        </Collapsible>
      )}

      {(bioSuggestion || currentBio) && (
        <Collapsible title="Bio Suggestion" icon="edit" iconColor="text-sky-500" defaultOpen={false}>
          <BioSuggestion current={currentBio} suggested={bioSuggestion} />
        </Collapsible>
      )}

      {repoSuggestions.length > 0 && (
        <Collapsible
          title={`Repo Improvements (${repoSuggestions.length})`}
          icon="drive_file_rename_outline"
          iconColor="text-amber-500"
          defaultOpen={false}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/10">
                  <th className="text-left text-xs font-bold text-outline uppercase tracking-wider pb-3 pr-4">Current Name</th>
                  <th className="text-left text-xs font-bold text-outline uppercase tracking-wider pb-3 pr-4">Suggested Name</th>
                  <th className="text-left text-xs font-bold text-outline uppercase tracking-wider pb-3 pr-4">Suggested Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {repoSuggestions.map((s, i) => (
                  <RepoSuggestionRow key={i} suggestion={s} />
                ))}
              </tbody>
            </table>
          </div>
        </Collapsible>
      )}

      {hostingRecs.length > 0 && (
        <Collapsible
          title={`Hosting Recommendations (${hostingRecs.length})`}
          icon="cloud_upload"
          iconColor="text-emerald-500"
          defaultOpen={false}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {hostingRecs.map((rec, i) => (
              <div key={i} className="glass-card bg-surface-container/20 rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <span className="font-bold text-on-surface text-sm">{rec.repo ?? rec.repoName}</span>
                  {rec.platform && (
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${getPlatformStyle(rec.platform)}`}>
                      {rec.platform}
                    </span>
                  )}
                  {rec.priority && (
                    <span
                      className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
                        priorityBadge[rec.priority?.toLowerCase()] || 'bg-slate-500/10 text-slate-600'
                      }`}
                    >
                      {rec.priority}
                    </span>
                  )}
                </div>
                {rec.reason && (
                  <p className="text-xs text-on-surface-variant font-medium leading-relaxed">{rec.reason}</p>
                )}
              </div>
            ))}
          </div>
        </Collapsible>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 5 — Final Recruiter Report
// ─────────────────────────────────────────────────────────────────────────────

function Stage5RecruiterReport({ data, onSave, savingAnalysis, analysisSaved, onStartOver }) {
  if (!data) return null;

  const summary = data.recruiterSummary ?? data.summary ?? '';
  const priorities = data.topPriorities ?? data.priorities ?? [];
  const quickWins = data.quickWins ?? [];
  const strengths = data.strengths ?? [];

  const impactBadge = {
    high: 'bg-rose-500/10 text-rose-600',
    medium: 'bg-amber-500/10 text-amber-600',
    low: 'bg-sky-500/10 text-sky-600',
  };

  return (
    <div className="card p-8 rounded-2xl">
      <h2 className="text-xl font-bold text-on-surface font-headline flex items-center gap-3 mb-6">
        <span className="material-symbols-outlined text-rose-500 text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>contact_page</span>
        Final Recruiter Report
      </h2>

      {summary && (
        <div className="mb-8 px-6 py-5 bg-primary/5 rounded-2xl border border-primary/10">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-primary text-base" style={{ fontVariationSettings: "'FILL' 0" }}>summarize</span>
            <span className="text-xs font-bold text-primary uppercase tracking-wider">Recruiter Summary</span>
          </div>
          <p className="text-on-surface font-medium leading-relaxed">{summary}</p>
        </div>
      )}

      {priorities.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold text-on-surface mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-rose-500 text-base" style={{ fontVariationSettings: "'FILL' 0" }}>priority_high</span>
            Top Priorities
          </h3>
          <div className="space-y-3">
            {priorities.map((p, i) => (
              <div key={i} className="glass-card bg-surface-container/20 rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <span className="font-extrabold text-on-surface-variant text-xs w-5 h-5 flex items-center justify-center bg-surface-container rounded-full flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="font-bold text-on-surface text-sm flex-1">
                    {p.action ?? p.title ?? p.item}
                  </span>
                  {p.impact && (
                    <span
                      className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
                        impactBadge[p.impact?.toLowerCase()] || 'bg-slate-500/10 text-slate-600'
                      }`}
                    >
                      {p.impact}
                    </span>
                  )}
                  {p.effort && (
                    <span className="px-2 py-0.5 glass-card bg-surface-container/40 rounded-lg text-xs font-bold text-on-surface-variant">
                      {p.effort}
                    </span>
                  )}
                </div>
                {p.why && (
                  <p className="text-xs text-on-surface-variant font-medium leading-relaxed ml-8">{p.why}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {quickWins.length > 0 && (
          <div>
            <h3 className="text-lg font-bold text-on-surface mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-500 text-base" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
              Quick Wins
            </h3>
            <ul className="space-y-2">
              {quickWins.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-on-surface-variant font-medium text-sm">
                  <span className="w-1.5 h-1.5 mt-2 rounded-full bg-amber-500 flex-shrink-0" />
                  {typeof w === 'string' ? w : (w.action ?? w.item ?? JSON.stringify(w))}
                </li>
              ))}
            </ul>
          </div>
        )}

        {strengths.length > 0 && (
          <div>
            <h3 className="text-lg font-bold text-on-surface mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-500 text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              Strengths
            </h3>
            <ul className="space-y-2">
              {strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-on-surface-variant font-medium text-sm">
                  <span className="material-symbols-outlined text-emerald-500 text-base flex-shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                  {typeof s === 'string' ? s : (s.item ?? JSON.stringify(s))}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 flex-wrap pt-4 border-t border-slate-200 dark:border-white/10">
        <button
          onClick={onSave}
          disabled={savingAnalysis || analysisSaved}
          className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700/50 text-white px-6 py-3 rounded-2xl font-bold hover:from-slate-700 hover:to-slate-800 active:scale-95 transition-all duration-200 disabled:opacity-60 shadow-[0px_10px_30px_rgba(15,23,42,0.3)] flex items-center gap-2"
        >
          {savingAnalysis ? (
            <>
              <span className="material-symbols-outlined animate-spin text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
              Saving...
            </>
          ) : analysisSaved ? (
            <>
              <span className="material-symbols-outlined text-lg text-emerald-400" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              Saved!
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>save</span>
              Save Analysis
            </>
          )}
        </button>
        <button
          onClick={onStartOver}
          className="px-6 py-3 glass-card hover:bg-slate-100 dark:hover:bg-white/10 text-on-surface-variant font-bold rounded-2xl transition-all border border-slate-200 dark:border-white/10 flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>restart_alt</span>
          Start Over
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// History Panel
// ─────────────────────────────────────────────────────────────────────────────

function HistoryPanel({ history }) {
  if (!history || history.length === 0) return null;
  return (
    <div className="card p-6 rounded-2xl mt-8">
      <h3 className="text-base font-bold text-on-surface font-headline flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-outline text-base" style={{ fontVariationSettings: "'FILL' 0" }}>history</span>
        Past Analyses
      </h3>
      <div className="divide-y divide-white/10">
        {history.slice(0, 5).map((item, i) => {
          const color = getScoreColor(item.score ?? 0);
          const grade = getGradeLabel(item.score ?? 0);
          return (
            <div key={i} className="py-3 flex items-center gap-4">
              <div className="font-bold text-on-surface text-sm flex-1">@{item.username}</div>
              <span
                className="px-2 py-0.5 rounded-lg text-xs font-bold"
                style={{ backgroundColor: `${color}20`, color }}
              >
                {item.score}/100 · {grade}
              </span>
              <span className="text-xs text-outline">
                {formatDate(item.analyzedAt ?? item.createdAt ?? item.date)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function GitHubOptimizer() {
  useActivityTracker('GitHub Optimizer');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [history, setHistory] = useState([]);
  const [stageStatuses, setStageStatuses] = useState({ 1: 'idle', 2: 'idle', 3: 'idle', 4: 'idle', 5: 'idle' });
  const [repoReadmeModal, setRepoReadmeModal] = useState({ open: false, repo: null, readme: null, loading: false });
  const [savingAnalysis, setSavingAnalysis] = useState(false);
  const [analysisSaved, setAnalysisSaved] = useState(false);

  const resultsRef = useRef(null);

  // Load history on mount (silent)
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/profiles/github/history');
        setHistory(Array.isArray(data) ? data : (data.history ?? []));
      } catch {
        // silent — history is optional
      }
    })();
  }, []);

  const setStageStatus = (stageId, status) => {
    setStageStatuses(prev => ({ ...prev, [stageId]: status }));
  };

  const resetPipeline = () => {
    setStageStatuses({ 1: 'idle', 2: 'idle', 3: 'idle', 4: 'idle', 5: 'idle' });
  };

  const validateUrl = (raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return 'Please enter a GitHub URL or username.';
    const username = parseUsername(trimmed);
    if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(username)) {
      return 'Invalid GitHub username format.';
    }
    return '';
  };

  const handleAnalyze = async (e) => {
    e.preventDefault();
    const validationMsg = validateUrl(url);
    if (validationMsg) {
      setError(validationMsg);
      return;
    }

    const username = parseUsername(url);
    setError('');
    setResults(null);
    setAnalysisSaved(false);
    setLoading(true);
    resetPipeline();

    try {
      // Animate stages 1-3 while the real API call is running
      setStageStatus(1, 'running');
      await delay(300);
      setStageStatus(2, 'running');
      await delay(300);
      setStageStatus(3, 'running');
      await delay(300);
      setStageStatus(4, 'running');

      // API call — stages 1-3 data is instantly available, stage 4-5 may be processing
      const { data } = await api.post('/profiles/github/analyze', { username });

      console.log('🔍 GitHub Optimizer Response:', {
        repos_count: data.repos?.length,
        profile_publicRepos: data.profile?.publicRepos,
        total_stars: data.profile?.totalStars,
        score: data.scores?.overall,
      });

      // Mark stages 1-3 as done immediately — data is here
      setStageStatuses({ 1: 'done', 2: 'done', 3: 'done', 4: 'running', 5: 'waiting' });

      // Display results immediately so user sees fetched data
      setResults(data);
      setLoading(false);

      // Scroll to results
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);

      // Background: wait for stage 4 (AI) to complete, then mark stage 5 done
      await delay(1000);
      setStageStatus(4, 'done');
      setStageStatus(5, 'running');
      await delay(500);
      setStageStatus(5, 'done');
    } catch (err) {
      setError(err.response?.data?.error || 'Analysis failed. Please try again.');
      setStageStatuses(prev => {
        const updated = { ...prev };
        for (const key of Object.keys(updated)) {
          if (updated[key] === 'running') updated[key] = 'error';
        }
        return updated;
      });
      setLoading(false);
    }
  };

  const handleSaveAnalysis = async () => {
    if (savingAnalysis || analysisSaved) return;
    setSavingAnalysis(true);
    try {
      await api.post('/profiles/github/save', results);
      setAnalysisSaved(true);
      try {
        const { data } = await api.get('/profiles/github/history');
        setHistory(Array.isArray(data) ? data : (data.history ?? []));
      } catch {
        // silent
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save analysis.');
    } finally {
      setSavingAnalysis(false);
    }
  };

  const handleStartOver = () => {
    setUrl('');
    setResults(null);
    setError('');
    setAnalysisSaved(false);
    resetPipeline();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGenerateReadme = async (repo) => {
    const repoName = typeof repo === 'string' ? repo : repo.name;
    setRepoReadmeModal({ open: true, repo: repoName, readme: null, loading: true });
    try {
      const username = results?.username ?? parseUsername(url);
      const { data } = await api.post('/profiles/github/generate-repo-readme', {
        username,
        repoName,
        repoDescription: typeof repo === 'object' ? repo.description : undefined,
        language: typeof repo === 'object' ? repo.language : undefined,
        topics: typeof repo === 'object' ? repo.topics : undefined,
        stars: typeof repo === 'object' ? repo.stars : undefined,
      });
      setRepoReadmeModal(prev => ({
        ...prev,
        readme: data.readme ?? data.content ?? (typeof data === 'string' ? data : JSON.stringify(data)),
        loading: false,
      }));
    } catch {
      setRepoReadmeModal(prev => ({
        ...prev,
        readme: '# README generation failed\n\nPlease try again.',
        loading: false,
      }));
    }
  };

  const closeRepoModal = () => {
    setRepoReadmeModal({ open: false, repo: null, readme: null, loading: false });
  };

  // Derive stage-specific data slices from the flat backend response shape.
  const stage1Data = (() => {
    if (!results) return null;
    const p = results.profile ?? {};
    const s = results.scores ?? {};
    // Use actual repo count from the array, fall back to publicRepos field, then repos.length
    const repoCount = (results.repos ?? []).length > 0 ? (results.repos ?? []).length : (p.publicRepos ?? '—');
    return {
      score: s.overall ?? results.score ?? 0,
      scoreDescription: results.report?.summary ?? results.stage4?.recruiterSummary ?? '',
      repoCount,
      stars: p.totalStars ?? results.repos?.reduce((sum, r) => sum + (r.stars || 0), 0) ?? 0,
      followers: p.followers ?? 0,
      languages: p.languages ?? [],
    };
  })();

  const stage2Data = (() => {
    if (!results) return null;
    const s = results.scores ?? {};
    const scoreBreakdown = [
      { label: 'Profile README', score: s.profileReadme ?? 0, max: 15 },
      { label: 'Bio', score: s.bio ?? 0, max: 10 },
      { label: 'Repo Naming', score: s.repoNaming ?? 0, max: 10 },
      { label: 'Descriptions', score: s.descriptions ?? 0, max: 10 },
      { label: 'Topics', score: s.topics ?? 0, max: 10 },
      { label: 'README Quality', score: s.readmeQuality ?? 0, max: 15 },
      { label: 'Hosting', score: s.hosting ?? 0, max: 10 },
      { label: 'Activity', score: s.activity ?? 0, max: 10 },
      { label: 'Diversity', score: s.diversity ?? 0, max: 10 },
    ];
    return {
      repos: results.repos ?? [],
      auditScore: s.overall ?? null,
      scoreBreakdown,
    };
  })();

  const stage3Data = (() => {
    if (!results) return null;
    const repoByName = new Map((results.repos ?? []).map(r => [r.name, r]));
    const topProjects = (results.showcaseProjects ?? []).map(name => {
      const r = repoByName.get(name) ?? {};
      return { name, stars: r.stars ?? 0, description: r.description, language: r.language, homepage: r.homepage };
    });
    return { topProjects, hasPortfolio: results.hasPortfolio ?? false };
  })();

  const stage4Data = (() => {
    if (!results?.stage4) return null;
    return {
      profileReadme: results.stage4.profileReadme,
      aiPowered: results.stage4.aiPowered,
      bioSuggestion: results.stage4.bioSuggestion,
      currentBio: results.profile?.bio ?? '',
      repoSuggestions: results.stage4.repoSuggestions ?? [],
      hostingRecs: results.stage4.hostingRecs ?? [],
    };
  })();

  const stage5Data = (() => {
    if (!results?.report) return null;
    return {
      summary: results.report.summary,
      topPriorities: results.report.topPriorities ?? [],
      quickWins: results.report.quickWins ?? [],
      strengths: results.report.strengths ?? [],
    };
  })();

  const pipelineActive = Object.values(stageStatuses).some(s => s !== 'idle');
  // Show tracker only while loading AND no results yet
  // Once results arrive, show them immediately (don't wait for tracker to finish)
  const showTracker = loading && !results;
  const showResults = !!results;

  return (
    <>
      <RepoReadmeModal modal={repoReadmeModal} onClose={closeRepoModal} />

      <div className="page-container">

        {/* Page Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-slate-900/5 dark:bg-white/5 mb-6">
            <span
              className="material-symbols-outlined text-slate-900 dark:text-white text-3xl"
              style={{ fontVariationSettings: "'FILL' 0" }}
            >
              code
            </span>
          </div>
          <h1 className="text-4xl font-extrabold text-on-surface font-headline mb-4">
            GitHub Profile Optimizer
          </h1>
          <p className="text-lg text-on-surface-variant font-medium max-w-2xl mx-auto">
            Paste your GitHub URL and get an AI-powered recruiter report — profile score, showcase projects, README, and actionable priorities.
          </p>
        </div>

        {/* URL Input */}
        <form onSubmit={handleAnalyze} className="max-w-3xl mx-auto mb-10">
          <div className="relative card rounded-2xl p-2 shadow-lg">
            <div className="flex items-center gap-4 p-4">
              <div className="w-12 h-12 rounded-2xl glass-card flex items-center justify-center flex-shrink-0">
                <span
                  className="material-symbols-outlined text-slate-900 dark:text-white text-xl"
                  style={{ fontVariationSettings: "'FILL' 0" }}
                >
                  link
                </span>
              </div>
              <input
                type="text"
                placeholder="Paste your GitHub URL or username (e.g. github.com/pujithsoma)"
                className="flex-1 bg-transparent outline-none font-medium text-on-surface placeholder:text-outline text-base min-w-0"
                value={url}
                onChange={(e) => { setUrl(e.target.value); if (error) setError(''); }}
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700/50 text-white px-6 py-3 rounded-2xl font-bold hover:from-slate-700 hover:to-slate-800 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100 shadow-[0px_10px_30px_rgba(15,23,42,0.3)] flex items-center gap-2 flex-shrink-0"
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
                    <span className="hidden sm:inline">Analyzing...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>search</span>
                    <span className="hidden sm:inline">Analyze Profile</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-3 px-4 py-3 glass-card border-rose-200/50 rounded-2xl text-rose-600 text-sm font-medium flex items-center gap-2">
              <span className="material-symbols-outlined text-rose-500 text-base flex-shrink-0" style={{ fontVariationSettings: "'FILL' 0" }}>
                error_outline
              </span>
              {error}
            </div>
          )}
        </form>

        {/* Pipeline Tracker */}
        {showTracker && (
          <div className="mb-12">
            <PipelineTracker statuses={stageStatuses} />
          </div>
        )}

        {/* Results */}
        {showResults && (
          <div ref={resultsRef} className="space-y-8">

            {/* Completed pipeline strip */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {PIPELINE_STAGES.map((stage) => (
                <div key={stage.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 rounded-xl">
                  <span className="material-symbols-outlined text-emerald-500 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                    check_circle
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-400 text-xs font-bold">{stage.name}</span>
                </div>
              ))}
            </div>

            {/* Stage 1 */}
            {stage1Data && <Stage1ProfileHealth data={stage1Data} />}

            {/* Stage 2 */}
            {stage2Data && (
              <Stage2RepoAudit data={stage2Data} onGenerateReadme={handleGenerateReadme} />
            )}

            {/* Stage 3 */}
            {stage3Data && <Stage3ShowcaseProjects data={stage3Data} />}

            {/* Stage 4 */}
            {stage4Data && <Stage4AIRecommendations data={stage4Data} />}

            {/* Fallback: flat API response with generatedReadme at root */}
            {!stage4Data && results?.generatedReadme && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-on-surface font-headline flex items-center gap-3">
                  <span className="material-symbols-outlined text-purple-500 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                  Generated README
                </h2>
                <ReadmePanel
                  content={results.generatedReadme}
                  filename="README.md"
                  badge={results.aiPowered ? 'AI-generated' : 'Template'}
                />
              </div>
            )}

            {/* Fallback: flat API response with strengths/issues at root */}
            {!stage4Data && !stage5Data && (results?.strengths?.length > 0 || results?.issues?.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {results.strengths?.length > 0 && (
                  <div className="card p-8 rounded-2xl">
                    <h3 className="text-xl font-bold text-emerald-600 mb-6 flex items-center gap-3 font-headline">
                      <span className="material-symbols-outlined text-emerald-500 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                      Strengths
                    </h3>
                    <ul className="space-y-3">
                      {results.strengths.map((s, i) => (
                        <li key={i} className="text-on-surface-variant font-medium flex gap-3 items-start text-sm">
                          <span className="w-2 h-2 mt-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {results.issues?.length > 0 && (
                  <div className="card p-8 rounded-2xl">
                    <h3 className="text-xl font-bold text-rose-600 mb-6 flex items-center gap-3 font-headline">
                      <span className="material-symbols-outlined text-rose-500 text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>warning</span>
                      Improvements
                    </h3>
                    <ul className="space-y-3">
                      {results.issues.map((iss, i) => (
                        <li key={i} className="text-on-surface-variant font-medium flex gap-3 items-start text-sm">
                          <span className="w-2 h-2 mt-1.5 rounded-full bg-rose-500 flex-shrink-0" />
                          {iss}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Stage 5 */}
            {stage5Data && (
              <Stage5RecruiterReport
                data={stage5Data}
                onSave={handleSaveAnalysis}
                savingAnalysis={savingAnalysis}
                analysisSaved={analysisSaved}
                onStartOver={handleStartOver}
              />
            )}

            {/* Fallback: save/start-over when stage5 data is absent */}
            {!stage5Data && (
              <div className="flex items-center gap-4 flex-wrap">
                <button
                  onClick={handleSaveAnalysis}
                  disabled={savingAnalysis || analysisSaved}
                  className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700/50 text-white px-6 py-3 rounded-2xl font-bold hover:from-slate-700 hover:to-slate-800 active:scale-95 transition-all duration-200 disabled:opacity-60 shadow-[0px_10px_30px_rgba(15,23,42,0.3)] flex items-center gap-2"
                >
                  {savingAnalysis ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
                      Saving...
                    </>
                  ) : analysisSaved ? (
                    <>
                      <span className="material-symbols-outlined text-lg text-emerald-400" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                      Saved!
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>save</span>
                      Save Analysis
                    </>
                  )}
                </button>
                <button
                  onClick={handleStartOver}
                  className="px-6 py-3 glass-card hover:bg-slate-100 dark:hover:bg-white/10 text-on-surface-variant font-bold rounded-2xl transition-all border border-slate-200 dark:border-white/10 flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>restart_alt</span>
                  Start Over
                </button>
              </div>
            )}
          </div>
        )}

        {/* History Panel */}
        <HistoryPanel history={history} />

      </div>
    </>
  );
}
