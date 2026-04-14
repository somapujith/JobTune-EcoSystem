import React, { useState } from 'react';

export default function LinkedInOptimizer() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);

  const handleAnalyze = (e) => {
    e.preventDefault();
    if (!url) return;
    setLoading(true);
    setTimeout(() => {
      setReport({
        score: 72,
        metrics: [
          { label: 'Headline Impact', val: 60, status: 'warning' },
          { label: 'About Section Depth', val: 85, status: 'good' },
          { label: 'Experience Keywords', val: 70, status: 'warning' },
          { label: 'Skills & Endorsements', val: 90, status: 'good' }
        ],
        suggestions: [
          "Your headline is too generic ('Frontend Developer'). Try 'React.js Developer | Building Fast, Accessible Web Interfaces'.",
          "You have 15 skills listed but no endorsements for top skills like React and Node.js.",
          "Add metrics to your experience section (e.g., 'Improved loading time by 20%')."
        ]
      });
      setLoading(false);
    }, 2000);
  };

  return (
    <div className="w-full max-w-5xl mx-auto py-16 px-4 sm:px-6">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-sky-500/5 mb-6">
          <span className="material-symbols-outlined text-sky-600 text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>group</span>
        </div>
        <h1 className="text-4xl font-black text-on-surface font-headline mb-4">
          LinkedIn Profile Optimizer
        </h1>
        <p className="text-lg text-on-surface-variant font-medium max-w-2xl mx-auto">
          Scan your LinkedIn profile for keyword optimization, headline impact, and industry benchmarking to get more recruiter attention.
        </p>
      </div>

      <form onSubmit={handleAnalyze} className="max-w-3xl mx-auto mb-16">
        <div className="relative bg-surface-container-lowest rounded-3xl p-2 shadow-[0px_20px_40px_rgba(14,165,233,0.06)]">
          <div className="flex items-center gap-4 p-4">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-sky-600 text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>link</span>
            </div>
            <input
              type="url"
              placeholder="https://linkedin.com/in/your-username"
              required
              className="flex-1 bg-transparent outline-none font-medium text-on-surface placeholder:text-outline text-lg"
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-sky-500 to-sky-600 text-on-primary px-8 py-3 rounded-2xl font-bold hover:from-sky-600 hover:to-sky-700 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100 shadow-[0px_10px_30px_rgba(14,165,233,0.3)] flex items-center gap-3"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
                  Scanning...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>search</span>
                  Analyze Profile
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {report && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Profile Score Card */}
          <div className="bg-surface-container-lowest p-8 rounded-3xl shadow-[0px_20px_40px_rgba(14,165,233,0.06)] flex flex-col items-center justify-center text-center">
            <div className="relative mb-8">
              <svg viewBox="0 0 36 36" className="w-32 h-32 -rotate-90 mx-auto">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5eeff" strokeWidth="3.2" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#0ea5e9" strokeWidth="3.2"
                  strokeDasharray={`${(report.score / 100) * 100} 100`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-4xl font-black text-on-surface">{report.score}</span>
              </div>
            </div>
            <h3 className="text-2xl font-bold text-on-surface mb-3 font-headline">Profile Score</h3>
            <p className="text-on-surface-variant font-medium">Your profile is above average, but has room for optimization.</p>
          </div>

          {/* Metrics Breakdown */}
          <div className="bg-surface-container-lowest p-8 rounded-3xl shadow-[0px_20px_40px_rgba(14,165,233,0.06)]">
            <h3 className="text-xl font-bold text-on-surface mb-8 flex items-center gap-3 font-headline">
              <span className="material-symbols-outlined text-sky-600 text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>bar_chart</span>
              Metrics Breakdown
            </h3>
            <div className="space-y-6">
              {report.metrics.map((m, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm font-bold mb-3">
                    <span className="text-on-surface">{m.label}</span>
                    <span className="text-on-surface">{m.val}/100</span>
                  </div>
                  <div className="w-full bg-surface-container h-3 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${m.status === 'good' ? 'bg-emerald-500' : 'bg-amber-500'} shadow-[0_0_8px_${m.status === 'good' ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.4)'}]`}
                      style={{ width: `${m.val}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Suggestions */}
          <div className="lg:col-span-2 bg-sky-500/5 p-8 rounded-3xl">
            <h3 className="text-xl font-bold text-sky-700 mb-8 flex items-center gap-3 font-headline">
              <span className="material-symbols-outlined text-sky-600 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>lightbulb</span>
              AI-Powered Suggestions
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {report.suggestions.map((s, i) => (
                <div key={i} className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm flex gap-4 items-start">
                  <span className="material-symbols-outlined text-sky-600 text-lg mt-1" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <p className="text-on-surface font-medium leading-relaxed">{s}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
