import React, { useState } from 'react';
import { api } from '../store/useAuthStore';
import { AlertCircle, Eye, FileText, Linkedin, Github, Tags, Lightbulb } from 'lucide-react';

const SUB_META = {
  resume: { label: 'Resume', icon: FileText, color: 'emerald' },
  linkedin: { label: 'LinkedIn', icon: Linkedin, color: 'blue' },
  github: { label: 'GitHub', icon: Github, color: 'purple' },
  keywords: { label: 'Keywords', icon: Tags, color: 'amber' },
};

function scoreColor(score) {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 60) return 'text-blue-600 dark:text-blue-400';
  if (score >= 40) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function barColor(score) {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-blue-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-rose-500';
}

export default function RecruiterVisibility() {
  const [resumeText, setResumeText] = useState('');
  const [linkedinHeadline, setLinkedinHeadline] = useState('');
  const [linkedinAbout, setLinkedinAbout] = useState('');
  const [linkedinSkills, setLinkedinSkills] = useState('');
  const [githubUsername, setGithubUsername] = useState('');
  const [targetKeywords, setTargetKeywords] = useState('');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleAnalyze = async (e) => {
    e.preventDefault();

    const hasResume = resumeText.trim().length > 0;
    const hasLinkedin = linkedinHeadline.trim() || linkedinAbout.trim() || linkedinSkills.trim();
    const hasGithub = githubUsername.trim().length > 0;

    if (!hasResume && !hasLinkedin && !hasGithub) {
      setError('Provide at least one of: resume text, LinkedIn details, or GitHub username.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      // Optionally enrich GitHub via the existing analyzer so its real score
      // feeds the visibility pipeline. Falls back gracefully if it fails.
      let github;
      if (hasGithub) {
        try {
          const { data: gh } = await api.post('/profiles/github/analyze', { username: githubUsername.trim() });
          github = gh;
        } catch {
          github = undefined;
        }
      }

      const linkedin = hasLinkedin
        ? { headline: linkedinHeadline, about: linkedinAbout, skills: linkedinSkills }
        : undefined;

      const { data } = await api.post('/recruiter-visibility/analyze', {
        resumeText: hasResume ? resumeText : undefined,
        linkedin,
        github,
        targetKeywords: targetKeywords.trim() || undefined,
      });
      setResult(data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to analyze recruiter visibility');
    } finally {
      setLoading(false);
    }
  };

  const loadTestData = () => {
    setResumeText(
      'Senior Software Engineer. Led development of React and Node.js microservices serving 2M users. ' +
      'Improved API performance by 40% and reduced infrastructure costs by 25%. Built CI/CD pipelines with ' +
      'Docker, Kubernetes and AWS. Mentored 4 junior engineers. Stack: TypeScript, PostgreSQL, GraphQL, Redis. ' +
      'linkedin.com/in/janedoe · github.com/janedoe · jane.doe@email.com'
    );
    setLinkedinHeadline('Senior Software Engineer | React, Node.js, AWS | Building scalable platforms');
    setLinkedinAbout(
      'I build reliable, high-scale web platforms. Over the past 6 years I have led teams, shipped ' +
      'production features used by millions, and improved performance and developer experience across the stack.'
    );
    setLinkedinSkills('React, Node.js, TypeScript, AWS, Docker, Kubernetes, PostgreSQL, GraphQL, Redis, CI/CD, System Design, Leadership');
    setGithubUsername('');
    setTargetKeywords('react, node, aws, graphql, kubernetes, typescript');
    setResult(null);
    setError('');
  };

  return (
    <div className="w-full max-w-5xl mx-auto py-16 px-4 sm:px-6">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-slate-900/5 mb-6">
          <span className="material-symbols-outlined text-slate-900 text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>visibility</span>
        </div>
        <h1 className="text-4xl font-black text-on-surface font-headline mb-4">
          Recruiter Visibility Checker
        </h1>
        <p className="text-lg text-on-surface-variant font-medium max-w-2xl mx-auto">
          Measure how attractive your profile looks to recruiters across your resume, LinkedIn, and GitHub.
        </p>
      </div>

      {/* How It Works Guide */}
      <div className="max-w-5xl mx-auto mb-12 glass-card border-blue-200/50 rounded-3xl p-8">
        <h3 className="text-xl font-bold text-on-surface mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-blue-600">info</span>
          How It Works
        </h3>
        <div className="space-y-3 text-slate-700 dark:text-slate-300">
          <p><strong>1. Add Your Profile Sources:</strong> Paste your resume, LinkedIn details, and/or GitHub username. You can fill in just one — we score what you provide and flag what's missing.</p>
          <p><strong>2. Visibility Scoring:</strong> We combine resume, LinkedIn, GitHub, and keyword-coverage signals into a single Recruiter Visibility Score (0-100) with per-source sub-scores.</p>
          <p><strong>3. Improve:</strong> Follow the ranked suggestions to raise the signals recruiters search and screen for.</p>
        </div>
      </div>

      {error && (
        <div className="max-w-3xl mx-auto mb-6 glass-card border-rose-200/50 p-4 rounded-2xl text-rose-600 text-sm font-medium flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleAnalyze} className="max-w-3xl mx-auto mb-12 space-y-6">
        {/* Resume */}
        <div className="glass-card rounded-3xl p-8">
          <label className="flex items-center gap-2 text-sm font-bold text-on-surface mb-3">
            <FileText className="w-4 h-4 text-emerald-600" /> Resume Text
          </label>
          <textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your resume text here..."
            rows={8}
            className="w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* LinkedIn */}
        <div className="glass-card rounded-3xl p-8 space-y-4">
          <label className="flex items-center gap-2 text-sm font-bold text-on-surface">
            <Linkedin className="w-4 h-4 text-blue-600" /> LinkedIn (optional)
          </label>
          <input
            type="text"
            value={linkedinHeadline}
            onChange={(e) => setLinkedinHeadline(e.target.value)}
            placeholder="Headline (e.g. Senior Software Engineer | React, Node.js, AWS)"
            className="w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none"
          />
          <textarea
            value={linkedinAbout}
            onChange={(e) => setLinkedinAbout(e.target.value)}
            placeholder="About section..."
            rows={3}
            className="w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
          />
          <input
            type="text"
            value={linkedinSkills}
            onChange={(e) => setLinkedinSkills(e.target.value)}
            placeholder="Skills, comma-separated (e.g. React, Node.js, AWS)"
            className="w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* GitHub + target keywords */}
        <div className="glass-card rounded-3xl p-8 space-y-4">
          <label className="flex items-center gap-2 text-sm font-bold text-on-surface">
            <Github className="w-4 h-4 text-purple-600" /> GitHub Username (optional)
          </label>
          <input
            type="text"
            value={githubUsername}
            onChange={(e) => setGithubUsername(e.target.value)}
            placeholder="e.g. janedoe"
            className="w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none"
          />
          <label className="flex items-center gap-2 text-sm font-bold text-on-surface pt-2">
            <Tags className="w-4 h-4 text-amber-600" /> Target Role Keywords (optional)
          </label>
          <input
            type="text"
            value={targetKeywords}
            onChange={(e) => setTargetKeywords(e.target.value)}
            placeholder="Keywords from your target job, comma-separated"
            className="w-full px-4 py-2 bg-surface-container/50 border border-outline/20 rounded-xl text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="submit"
            disabled={loading}
            className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center gap-3"
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined animate-spin text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
                Analyzing...
              </>
            ) : (
              <>
                <Eye className="w-5 h-5" />
                Check Visibility
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
      {result && !loading && (
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Overall score */}
          <div className="glass-card rounded-3xl p-8 text-center">
            <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase mb-2">Recruiter Visibility Score</p>
            <p className={`text-6xl font-black ${scoreColor(result.visibilityScore)}`}>{result.visibilityScore}</p>
            <p className="text-lg font-bold text-on-surface mt-2">{result.scoreLabel}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{result.scoreDescription}</p>
          </div>

          {/* Sub-scores */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(result.subScores).map(([key, sub]) => {
              const meta = SUB_META[key] || { label: key, icon: Eye };
              const Icon = meta.icon;
              return (
                <div key={key} className="glass-card rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Icon className="w-5 h-5 text-slate-500" />
                      <span className="font-bold text-on-surface">{meta.label}</span>
                    </div>
                    {sub.available ? (
                      <span className={`text-2xl font-black ${scoreColor(sub.score)}`}>{sub.score}</span>
                    ) : (
                      <span className="text-xs font-semibold text-slate-400 uppercase">Not provided</span>
                    )}
                  </div>
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${sub.available ? barColor(sub.score) : 'bg-slate-300'} transition-all`}
                      style={{ width: `${sub.available ? sub.score : 0}%` }}
                    />
                  </div>
                  {key === 'keywords' && sub.available && Array.isArray(sub.matched) && sub.matched.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {sub.matched.slice(0, 10).map((kw) => (
                        <span key={kw} className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded text-xs font-medium">
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Missing keywords */}
          {result.subScores.keywords?.missing?.length > 0 && (
            <div className="glass-card rounded-3xl p-8">
              <h3 className="text-lg font-bold text-on-surface mb-3">Keywords Recruiters Search For That You're Missing</h3>
              <div className="flex flex-wrap gap-2">
                {result.subScores.keywords.missing.map((kw) => (
                  <span key={kw} className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-medium">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Suggestions */}
          {result.suggestions.length > 0 && (
            <div className="glass-card rounded-3xl p-8">
              <div className="flex items-center gap-3 mb-4">
                <Lightbulb className="w-6 h-6 text-amber-500" />
                <h3 className="text-xl font-bold text-on-surface">Ranked Improvement Suggestions</h3>
              </div>
              <ol className="space-y-3">
                {result.suggestions.map((s, i) => (
                  <li key={i} className="flex gap-3 text-slate-700 dark:text-slate-300">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-bold text-sm flex items-center justify-center">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
