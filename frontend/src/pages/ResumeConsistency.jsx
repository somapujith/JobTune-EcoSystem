import React, { useState } from 'react';
import { api } from '../store/useAuthStore';
import { AlertCircle, CheckCircle, GitCompare, Linkedin, Github, FileText } from 'lucide-react';

const SEVERITY_STYLES = {
  high: 'border-rose-300/60 bg-rose-50/60 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300',
  medium: 'border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300',
  low: 'border-blue-300/60 bg-blue-50/60 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300',
};

function scoreColor(score) {
  if (score == null) return 'text-slate-500';
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 55) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

export default function ResumeConsistency() {
  const [resumeText, setResumeText] = useState('');
  const [linkedinText, setLinkedinText] = useState('');
  const [githubText, setGithubText] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  const parseField = (label, text) => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      throw new Error(`${label} is not valid JSON. ${e.message}`);
    }
  };

  const handleCheck = async (e) => {
    e.preventDefault();
    setError('');

    let resume, linkedin, github;
    try {
      resume = parseField('Resume', resumeText);
      linkedin = parseField('LinkedIn', linkedinText);
      github = parseField('GitHub', githubText);
    } catch (parseErr) {
      setError(parseErr.message);
      return;
    }

    if (!resume && !linkedin && !github) {
      setError('Provide at least two profiles (resume, LinkedIn, GitHub) to compare.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/resume-consistency/check', { resume, linkedin, github });
      setReport(data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to run consistency check');
    } finally {
      setLoading(false);
    }
  };

  const loadTestData = () => {
    setResumeText(
      JSON.stringify(
        {
          name: 'Jane Doe',
          headline: 'Senior Software Engineer',
          skills: ['JavaScript', 'React', 'Node.js', 'PostgreSQL', 'AWS'],
          projects: ['JobTune Platform', 'Analytics Dashboard'],
          experience: [
            { title: 'Senior Software Engineer', company: 'TechCorp', startDate: '2021', endDate: '2024' },
            { title: 'Software Engineer', company: 'StartupXYZ', startDate: '2018', endDate: '2021' },
          ],
        },
        null,
        2
      )
    );
    setLinkedinText(
      JSON.stringify(
        {
          name: 'Jane Doe',
          headline: 'Full Stack Engineer',
          skills: ['JavaScript', 'React', 'TypeScript', 'Docker'],
          experience: [
            { title: 'Lead Software Engineer', company: 'TechCorp', startDate: '2021', endDate: '2023' },
            { title: 'Software Engineer', company: 'StartupXYZ', startDate: '2018', endDate: '2021' },
          ],
        },
        null,
        2
      )
    );
    setGithubText(
      JSON.stringify(
        {
          username: 'janedoe',
          repos: [
            { name: 'JobTune Platform', language: 'JavaScript' },
            { name: 'ml-experiments', language: 'Python' },
            { name: 'go-cli-tool', language: 'Go' },
          ],
        },
        null,
        2
      )
    );
    setReport(null);
    setError('');
  };

  return (
    <div className="w-full max-w-5xl mx-auto py-16 px-4 sm:px-6">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-slate-900/5 mb-6">
          <span className="material-symbols-outlined text-slate-900 text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>fact_check</span>
        </div>
        <h1 className="text-4xl font-black text-on-surface font-headline mb-4">
          Resume Consistency Checker
        </h1>
        <p className="text-lg text-on-surface-variant font-medium max-w-2xl mx-auto">
          Cross-check your resume against your LinkedIn and GitHub to catch missing projects, skill gaps, and conflicting titles or dates.
        </p>
      </div>

      {/* How It Works Guide */}
      <div className="max-w-5xl mx-auto mb-12 glass-card border-emerald-200/50 rounded-3xl p-8">
        <h3 className="text-xl font-bold text-on-surface mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-emerald-600">info</span>
          How It Works
        </h3>
        <div className="space-y-3 text-slate-700 dark:text-slate-300">
          <p><strong>1. Provide your profile data</strong> as JSON for any two or more of: Resume, LinkedIn, GitHub.</p>
          <div>
            <p className="mb-2"><strong>2. We cross-compare them</strong> and flag:</p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li><strong>Projects Missing in Resume:</strong> GitHub repos not on your resume</li>
              <li><strong>Skill gaps:</strong> skills on one profile but absent from another</li>
              <li><strong>Title &amp; Date Mismatches:</strong> conflicting roles or dates for the same employer</li>
            </ul>
          </div>
          <p><strong>3. Get a consistency score (0-100)</strong> and a categorized list of mismatches to fix.</p>
        </div>
      </div>

      {error && (
        <div className="max-w-3xl mx-auto mb-6 glass-card border-rose-200/50 p-4 rounded-2xl text-rose-600 text-sm font-medium flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleCheck} className="max-w-5xl mx-auto mb-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <label className="flex items-center gap-2 text-sm font-bold text-on-surface mb-2">
              <FileText className="w-4 h-4 text-emerald-600" /> Resume (JSON)
            </label>
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder='{ "skills": [...], "projects": [...], "experience": [...] }'
              rows={12}
              className="w-full font-mono text-xs bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-bold text-on-surface mb-2">
              <Linkedin className="w-4 h-4 text-blue-600" /> LinkedIn (JSON)
            </label>
            <textarea
              value={linkedinText}
              onChange={(e) => setLinkedinText(e.target.value)}
              placeholder='{ "headline": "...", "skills": [...], "experience": [...] }'
              rows={12}
              className="w-full font-mono text-xs bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-bold text-on-surface mb-2">
              <Github className="w-4 h-4 text-slate-700 dark:text-slate-300" /> GitHub (JSON)
            </label>
            <textarea
              value={githubText}
              onChange={(e) => setGithubText(e.target.value)}
              placeholder='{ "username": "...", "repos": [{ "name": "...", "language": "..." }] }'
              rows={12}
              className="w-full font-mono text-xs bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="submit"
            disabled={loading}
            className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center gap-3"
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined animate-spin text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
                Checking...
              </>
            ) : (
              <>
                <GitCompare className="w-5 h-5" />
                Check Consistency
              </>
            )}
          </button>
          <button
            type="button"
            onClick={loadTestData}
            className="px-8 py-3 glass-card hover:bg-white/40 text-on-surface rounded-2xl font-bold transition-all flex items-center justify-center gap-3"
          >
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>dataset</span>
            Load Test Data
          </button>
        </div>
      </form>

      {/* Results */}
      {report && !loading && (
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Score */}
          <div className="glass-card rounded-3xl p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">Consistency Score</p>
              <p className={`text-6xl font-black ${scoreColor(report.consistencyScore)}`}>
                {report.consistencyScore == null ? 'N/A' : report.consistencyScore}
                {report.consistencyScore != null && <span className="text-2xl text-slate-400">/100</span>}
              </p>
              {!report.summary?.comparable && (
                <p className="text-xs text-amber-600 mt-2">Provide at least two profiles for a score.</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                <strong>{report.summary?.totalMismatches ?? 0}</strong> mismatches found
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Sources: {(report.summary?.sourcesProvided || []).join(', ') || 'none'}
              </p>
            </div>
          </div>

          {/* No mismatches */}
          {(!report.mismatches || report.mismatches.length === 0) && (
            <div className="glass-card border-emerald-200/50 rounded-3xl p-8 flex items-center gap-3 text-emerald-700 dark:text-emerald-300">
              <CheckCircle className="w-6 h-6 flex-shrink-0" />
              <p className="font-semibold">No mismatches detected across the provided profiles.</p>
            </div>
          )}

          {/* Categorized mismatches */}
          {report.mismatches?.map((m, i) => (
            <div key={i} className={`glass-card rounded-3xl p-6 border ${SEVERITY_STYLES[m.severity] || ''}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-on-surface">{m.category}</h3>
                <span className="text-xs font-bold uppercase px-3 py-1 rounded-full bg-white/50 dark:bg-black/20">
                  {m.severity}
                </span>
              </div>
              {m.details && (
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{m.details}</p>
              )}
              <ul className="space-y-2">
                {m.items.map((item, j) => (
                  <li key={j} className="flex gap-3 text-sm text-slate-700 dark:text-slate-300">
                    <span className="font-bold flex-shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-400 mt-3">{m.source} → {m.target}</p>
            </div>
          ))}

          <p className="text-center text-xs text-slate-400">
            Generated at {new Date(report.generatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
