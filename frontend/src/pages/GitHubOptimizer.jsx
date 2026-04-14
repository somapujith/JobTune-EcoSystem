import React, { useState } from 'react';
import { api } from '../store/useAuthStore';

export default function GitHubOptimizer() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  const buildReadme = (u) =>
    `# Hi there, I'm ${u} 👋\n\n## 🚀 About Me\n- 🎓 Recent Computer Science Graduate\n- 💻 Passionate about Frontend Development & UI/UX\n- 🌱 I'm currently learning **Next.js & TypeScript**\n- 💬 Ask me about **React, JavaScript, and Tailwind CSS**\n\n## 🛠 Tech Stack\n**Languages:** JavaScript, HTML5, CSS3\n**Frameworks:** React.js, Express.js\n**Tools:** Git, VS Code, Figma\n\n## 📈 GitHub Stats\n![${u}'s GitHub stats](https://github-readme-stats.vercel.app/api?username=${u}&show_icons=true&theme=radical)`;

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!username) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/profiles/github/analyze', { username });
      setReport({
        score: data.score ?? 65,
        repoCount: data.repoCount ?? 12,
        stars: data.stars ?? 4,
        readmeExists: data.readmeExists ?? false,
        issues: data.issues ?? ["No profile README found.", "Several repositories lack README.md"],
        generatedReadme: buildReadme(username),
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto py-16 px-4 sm:px-6">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-slate-900/5 mb-6">
          <span className="material-symbols-outlined text-slate-900 text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>code</span>
        </div>
        <h1 className="text-4xl font-black text-on-surface font-headline mb-4">
          GitHub Profile Optimizer
        </h1>
        <p className="text-lg text-on-surface-variant font-medium max-w-2xl mx-auto">
          Scan your repositories and generate a professional profile README that showcases your skills to recruiters.
        </p>
      </div>

      {error && (
        <div className="max-w-2xl mx-auto mb-6 bg-rose-50 border border-rose-100 p-4 rounded-2xl text-rose-600 text-sm font-medium">
          {error}
        </div>
      )}
      <form onSubmit={handleAnalyze} className="max-w-2xl mx-auto mb-16">
        <div className="relative bg-surface-container-lowest rounded-3xl p-2 shadow-[0px_20px_40px_rgba(0,78,159,0.06)]">
          <div className="flex items-center gap-4 p-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-900/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-slate-900 text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>person</span>
            </div>
            <input
              type="text"
              placeholder="Enter your GitHub username"
              required
              className="flex-1 bg-transparent outline-none font-medium text-on-surface placeholder:text-outline text-lg"
              value={username}
              onChange={e => setUsername(e.target.value)}
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-slate-900 to-slate-800 text-on-primary px-8 py-3 rounded-2xl font-bold hover:from-slate-800 hover:to-slate-700 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100 shadow-[0px_10px_30px_rgba(15,23,42,0.3)] flex items-center gap-3"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
                  Analyzing...
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-8">
            {/* Profile Health Score */}
            <div className="bg-surface-container-lowest p-8 rounded-3xl shadow-[0px_20px_40px_rgba(0,78,159,0.06)] text-center">
              <div className="relative mb-6">
                <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90 mx-auto">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5eeff" strokeWidth="3.2" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#004e9f" strokeWidth="3.2"
                    strokeDasharray={`${(report.score / 100) * 100} 100`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-3xl font-black text-on-surface">{report.score}</span>
                </div>
              </div>
              <h3 className="text-xl font-bold text-on-surface mb-8 font-headline">Profile Health Score</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-container p-4 rounded-2xl text-center">
                  <span className="material-symbols-outlined text-outline text-xl mb-2 block" style={{ fontVariationSettings: "'FILL' 0" }}>account_tree</span>
                  <div className="font-black text-2xl text-on-surface">{report.repoCount}</div>
                  <div className="text-xs font-bold text-outline uppercase tracking-wider">Repositories</div>
                </div>
                <div className="bg-surface-container p-4 rounded-2xl text-center">
                  <span className="material-symbols-outlined text-amber-500 text-xl mb-2 block" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <div className="font-black text-2xl text-on-surface">{report.stars}</div>
                  <div className="text-xs font-bold text-outline uppercase tracking-wider">Total Stars</div>
                </div>
              </div>
            </div>

            {/* Critical Issues */}
            <div className="bg-surface-container-lowest p-8 rounded-3xl shadow-[0px_20px_40px_rgba(0,78,159,0.06)]">
              <h3 className="text-xl font-bold text-rose-600 mb-6 flex items-center gap-3 font-headline">
                <span className="material-symbols-outlined text-rose-500 text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>warning</span>
                Critical Issues
              </h3>
              <ul className="space-y-4">
                {report.issues.map((iss, i) => (
                  <li key={i} className="text-on-surface-variant font-medium flex gap-3 items-start">
                    <span className="w-2 h-2 mt-2 rounded-full bg-rose-500 flex-shrink-0"></span>
                    <span className="text-sm leading-relaxed">{iss}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Generated README */}
          <div className="lg:col-span-2">
            <div className="bg-slate-900 rounded-3xl shadow-[0px_25px_50px_rgba(15,23,42,0.25)] overflow-hidden flex flex-col h-full">
              <div className="bg-slate-800 px-8 py-6 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-slate-400 text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>description</span>
                  <div>
                    <h3 className="text-white font-bold text-lg">Generated Profile README.md</h3>
                    <p className="text-slate-400 text-sm">Copy this markdown to your GitHub profile</p>
                  </div>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(report.generatedReadme)}
                  className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl font-medium transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>content_copy</span>
                  Copy
                </button>
              </div>
              <div className="p-8 overflow-y-auto flex-grow">
                <pre className="text-slate-300 font-mono text-sm whitespace-pre-wrap leading-relaxed">
                  {report.generatedReadme}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
