import React, { useState } from 'react';
import { Github, Code2, GitBranch, Star, AlertCircle, Copy } from 'lucide-react';

export default function GitHubOptimizer() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);

  const handleAnalyze = (e) => {
    e.preventDefault();
    if (!username) return;
    setLoading(true);
    setTimeout(() => {
      setReport({
        score: 65,
        repoCount: 12,
        stars: 4,
        readmeExists: false,
        issues: [
          "No profile README found. This is a critical missed opportunity.",
          "8 of 12 repositories lack a basic README.md",
          "Only 2 repositories have a description or tags."
        ],
        generatedReadme: `# Hi there, I'm ${username} 👋\n\n## 🚀 About Me\n- 🎓 Recent Computer Science Graduate\n- 💻 Passionate about Frontend Development & UI/UX\n- 🌱 I'm currently learning **Next.js & TypeScript**\n- 💬 Ask me about **React, JavaScript, and Tailwind CSS**\n\n## 🛠 Tech Stack\n**Languages:** JavaScript, HTML5, CSS3\n**Frameworks:** React.js, Express.js\n**Tools:** Git, VS Code, Figma\n\n## 📈 GitHub Stats\n![${username}'s GitHub stats](https://github-readme-stats.vercel.app/api?username=${username}&show_icons=true&theme=radical)`
      });
      setLoading(false);
    }, 2000);
  };

  return (
    <div className="w-full max-w-6xl mx-auto py-12 px-4 sm:px-6">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-slate-900 mb-4 flex items-center justify-center gap-3">
          <Github className="w-8 h-8 text-slate-800" /> GitHub Optimizer
        </h1>
        <p className="text-lg text-slate-600">Scan your repositories and generate a professional profile README instantly.</p>
      </div>

      <form onSubmit={handleAnalyze} className="max-w-xl mx-auto mb-16 relative">
        <input 
          type="text" 
          placeholder="GitHub Username" 
          required
          className="w-full px-6 py-4 rounded-full border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-800 shadow-sm pl-14"
          value={username}
          onChange={e => setUsername(e.target.value)}
        />
        <Code2 className="w-6 h-6 text-slate-400 absolute left-5 top-1/2 transform -translate-y-1/2" />
        <button 
          type="submit" 
          disabled={loading}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-slate-800 text-white px-6 py-2 rounded-full font-medium hover:bg-slate-900 disabled:opacity-50"
        >
          {loading ? 'Analyzing...' : 'Analyze Profile'}
        </button>
      </form>

      {report && (
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 space-y-6">
               <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-center">
                  <div className="text-5xl font-extrabold text-slate-800 mb-2">{report.score}</div>
                  <h3 className="text-lg font-bold text-slate-900 mb-6">Profile Health</h3>
                  <div className="grid grid-cols-2 gap-4 text-left">
                     <div className="bg-slate-50 p-4 rounded-xl">
                        <GitBranch className="w-5 h-5 text-slate-600 mb-2" />
                        <div className="font-bold text-xl">{report.repoCount}</div>
                        <div className="text-xs text-slate-500 uppercase">Repositories</div>
                     </div>
                     <div className="bg-slate-50 p-4 rounded-xl">
                        <Star className="w-5 h-5 text-amber-500 mb-2" />
                        <div className="font-bold text-xl">{report.stars}</div>
                        <div className="text-xs text-slate-500 uppercase">Total Stars</div>
                     </div>
                  </div>
               </div>

               <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <h3 className="text-lg font-bold text-rose-700 mb-4 flex items-center gap-2"><AlertCircle className="w-5 h-5" /> Critical Issues</h3>
                  <ul className="space-y-3">
                    {report.issues.map((iss, i) => (
                      <li key={i} className="text-sm text-slate-700 flex gap-2 items-start">
                        <span className="w-2 h-2 mt-1.5 rounded-full bg-rose-500 flex-shrink-0"></span>
                        {iss}
                      </li>
                    ))}
                  </ul>
               </div>
            </div>

            <div className="lg:col-span-2">
               <div className="bg-slate-900 rounded-2xl shadow-xl overflow-hidden flex flex-col h-full">
                  <div className="bg-slate-800 px-6 py-4 flex justify-between items-center">
                     <div className="flex items-center gap-3">
                        <Code2 className="w-5 h-5 text-slate-400" />
                        <h3 className="text-white font-mono text-sm font-medium">Generated Profile README.md</h3>
                     </div>
                     <button onClick={() => navigator.clipboard.writeText(report.generatedReadme)} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2 text-sm bg-slate-700/50 px-3 py-1.5 rounded-lg">
                        <Copy className="w-4 h-4" /> Copy
                     </button>
                  </div>
                  <div className="p-6 overflow-y-auto flex-grow">
                     <pre className="text-slate-300 font-mono text-sm whitespace-pre-wrap">
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
