import { useState } from 'react';
import { api } from '../store/useAuthStore';
import { Copy, Check, ExternalLink, Zap } from 'lucide-react';

function getScoreColor(score) {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#0ea5e9';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

function getScoreLabel(score) {
  if (score >= 80) return { text: 'Excellent', bg: 'bg-emerald-50 text-emerald-700' };
  if (score >= 60) return { text: 'Good', bg: 'bg-sky-50 text-sky-700' };
  if (score >= 40) return { text: 'Fair', bg: 'bg-amber-50 text-amber-700' };
  return { text: 'Needs Work', bg: 'bg-red-50 text-red-700' };
}

function ScoreRing({ score }) {
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;
  const label = getScoreLabel(score);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="#e2e8f0" strokeWidth="10" />
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              stroke: getScoreColor(score),
              transition: 'stroke-dashoffset 1.2s ease',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black text-slate-800">{score}</span>
          <span className="text-xs text-slate-500 font-medium">/100</span>
        </div>
      </div>
      <span className={`text-sm font-bold px-4 py-1.5 rounded-full ${label.bg}`}>{label.text}</span>
    </div>
  );
}

function SuggestionWithCTA({ section, suggestion, impact }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(suggestion);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">{section}</p>
          <p className="text-sm font-semibold text-slate-900">{suggestion}</p>
        </div>
        {impact && <span className="text-xs font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap">+{impact}</span>}
      </div>
      <button
        onClick={handleCopy}
        className="flex items-center gap-2 text-xs font-semibold text-blue-600 hover:text-blue-700 mt-2"
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        {copied ? 'Copied!' : 'Copy to clipboard'}
      </button>
    </div>
  );
}

function NextStepsCard({ suggestions, score }) {
  const getRecommendations = () => {
    const recs = [];

    if (score < 60) {
      recs.push({
        priority: 1,
        action: 'Update your headline with role + key skills',
        example: 'Software Engineer | React | TypeScript | Full-Stack',
        impact: '+15 points',
      });
    }

    if (score < 70) {
      recs.push({
        priority: 2,
        action: 'Add a professional photo if missing',
        example: 'Clear, professional headshot',
        impact: '+12 points',
      });

      recs.push({
        priority: 3,
        action: 'Expand your About section',
        example: 'Write 2-3 sentences about your expertise and career goals',
        impact: '+10 points',
      });
    }

    recs.push({
      priority: 4,
      action: 'Add verifiable skills (top 10)',
      example: 'Request endorsements from colleagues',
      impact: '+8 points',
    });

    return recs;
  };

  const recs = getRecommendations();

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 text-white">
      <div className="flex items-center gap-2 mb-6">
        <Zap className="w-5 h-5 text-blue-400" />
        <h3 className="text-xl font-bold">Next Steps to Improve Your Score</h3>
      </div>

      <div className="space-y-4 mb-6">
        {recs.map((rec, i) => (
          <div key={i} className="flex gap-4">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 font-bold text-sm shrink-0">
              {rec.priority}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-white mb-1">{rec.action}</p>
              <p className="text-xs text-slate-300 mb-2">{rec.example}</p>
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300">{rec.impact}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-700 pt-6 flex gap-3">
        <a
          href="https://linkedin.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
        >
          Open LinkedIn <ExternalLink className="w-4 h-4" />
        </a>
        <button className="flex-1 px-4 py-3 bg-slate-700 text-white rounded-xl font-semibold hover:bg-slate-600 transition-colors">
          Re-Analyze Later
        </button>
      </div>
    </div>
  );
}

export default function LinkedInOptimizerEnhanced() {
  const [formData, setFormData] = useState({
    headline: '',
    about: '',
    skills: '',
    experienceCount: 0,
    yearsOfExperience: 0,
    connections: 'lt100',
    hasPhoto: false,
    hasFeatured: false,
  });
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  const handleAnalyze = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setReport(null);
    try {
      const { data } = await api.post('/profiles/linkedin/analyze', formData);
      setReport(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto py-16 px-4 sm:px-6">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-sky-500/5 mb-6">
          <span className="material-symbols-outlined text-sky-600 text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>
            group
          </span>
        </div>
        <h1 className="text-4xl font-black text-slate-900 mb-4">LinkedIn Profile Optimizer</h1>
        <p className="text-lg text-slate-600 font-medium max-w-2xl mx-auto">
          Get an instant score and actionable suggestions to improve your LinkedIn visibility
        </p>
      </div>

      {error && (
        <div className="max-w-3xl mx-auto mb-6 bg-rose-50 border border-rose-100 p-4 rounded-2xl text-rose-600 text-sm font-medium">
          {error}
        </div>
      )}

      {!report ? (
        <form onSubmit={handleAnalyze} className="max-w-3xl mx-auto mb-16 space-y-4">
          <div className="bg-white rounded-3xl p-6 shadow-[0px_20px_40px_rgba(14,165,233,0.06)] space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-900 mb-2">
                Headline <span className="text-xs text-slate-500">(max 220 chars)</span>
              </label>
              <input
                type="text"
                maxLength={220}
                placeholder="e.g. Software Engineer | React & Node.js | Full-Stack"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                value={formData.headline}
                onChange={(e) => setFormData({ ...formData, headline: e.target.value })}
              />
              <p className="text-xs text-slate-500 mt-1">{formData.headline.length}/220</p>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-900 mb-2">About Section</label>
              <textarea
                placeholder="Write a brief summary of your professional background..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                rows="3"
                value={formData.about}
                onChange={(e) => setFormData({ ...formData, about: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-900 mb-2">Key Skills (comma-separated)</label>
              <input
                type="text"
                placeholder="React, Node.js, TypeScript, PostgreSQL, AWS"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                value={formData.skills}
                onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-900 mb-2">Experience Count</label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 font-medium text-slate-900 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  value={formData.experienceCount}
                  onChange={(e) => setFormData({ ...formData, experienceCount: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-900 mb-2">Years of Experience</label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 font-medium text-slate-900 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  value={formData.yearsOfExperience}
                  onChange={(e) => setFormData({ ...formData, yearsOfExperience: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-3 p-4 bg-slate-50 rounded-xl">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.hasPhoto}
                  onChange={(e) => setFormData({ ...formData, hasPhoto: e.target.checked })}
                  className="w-5 h-5 rounded"
                />
                <span className="text-sm font-semibold text-slate-900">I have a professional profile photo</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.hasFeatured}
                  onChange={(e) => setFormData({ ...formData, hasFeatured: e.target.checked })}
                  className="w-5 h-5 rounded"
                />
                <span className="text-sm font-semibold text-slate-900">I have featured content/projects</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading && <span className="animate-spin inline-block">⟳</span>}
              {loading ? 'Analyzing...' : 'Get LinkedIn Score'}
            </button>
          </div>
        </form>
      ) : (
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <ScoreRing score={report.score || 65} />
            <div>
              <h2 className="text-2xl font-black text-slate-900 mb-4">Your LinkedIn Score</h2>
              <p className="text-slate-600 mb-6">
                {report.score >= 80
                  ? 'Excellent! Your profile is highly optimized for recruiters.'
                  : report.score >= 60
                    ? 'Good start. Make the recommendations below to improve visibility.'
                    : 'Room for improvement. Focus on the priority actions below.'}
              </p>

              <div className="space-y-3">
                {[
                  { label: 'Profile Completeness', value: report.completeness || 60 },
                  { label: 'Keyword Density', value: report.keywordScore || 55 },
                  { label: 'Engagement Potential', value: report.engagement || 50 },
                ].map((metric, i) => (
                  <div key={i}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-bold text-slate-700">{metric.label}</span>
                      <span className="text-xs font-bold text-slate-600">{metric.value}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-sky-400 to-sky-600 rounded-full" style={{ width: `${metric.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <NextStepsCard suggestions={report.suggestions} score={report.score || 65} />

          <button onClick={() => setReport(null)} className="w-full py-3 px-4 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-colors">
            Analyze Again
          </button>
        </div>
      )}
    </div>
  );
}
