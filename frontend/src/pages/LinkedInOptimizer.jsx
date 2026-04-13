import React, { useState } from 'react';
import { Linkedin, Search, Star, BarChart, CheckCircle2 } from 'lucide-react';

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
    <div className="w-full max-w-5xl mx-auto py-12 px-4 sm:px-6">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-slate-900 mb-4 flex items-center justify-center gap-3">
          <Linkedin className="w-8 h-8 text-sky-600" /> LinkedIn Optimizer
        </h1>
        <p className="text-lg text-slate-600">Scan your LinkedIn profile for keyword optimization, headline impact, and industry benchmarking.</p>
      </div>

      <form onSubmit={handleAnalyze} className="max-w-2xl mx-auto mb-16 relative">
        <input 
          type="url" 
          placeholder="https://linkedin.com/in/username" 
          required
          className="w-full px-6 py-4 rounded-full border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-sm pl-14"
          value={url}
          onChange={e => setUrl(e.target.value)}
        />
        <Search className="w-6 h-6 text-slate-400 absolute left-5 top-1/2 transform -translate-y-1/2" />
        <button 
          type="submit" 
          disabled={loading}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-sky-600 text-white px-6 py-2 rounded-full font-medium hover:bg-sky-700 disabled:opacity-50"
        >
          {loading ? 'Scanning...' : 'Analyze'}
        </button>
      </form>

      {report && (
         <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
               <div className="relative mb-6">
                  <svg className="w-40 h-40 transform -rotate-90">
                    <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-slate-100" />
                    <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="10" fill="transparent" 
                      strokeDasharray={70 * 2 * Math.PI} 
                      strokeDashoffset={70 * 2 * Math.PI - (report.score / 100) * (70 * 2 * Math.PI)}
                      className={report.score > 80 ? "text-emerald-500" : "text-sky-500"} 
                    />
                  </svg>
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-4xl font-bold text-slate-800">
                    {report.score}
                  </div>
               </div>
               <h3 className="text-2xl font-bold text-slate-900 mb-2">Profile Score</h3>
               <p className="text-slate-600">Your profile is above average, but has room for optimization.</p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
               <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2"><BarChart className="w-5 h-5 text-sky-600" /> Metrics Breakdown</h3>
               <div className="space-y-6">
                 {report.metrics.map((m, i) => (
                   <div key={i}>
                     <div className="flex justify-between text-sm font-medium mb-2">
                       <span className="text-slate-700">{m.label}</span>
                       <span className="text-slate-900">{m.val}/100</span>
                     </div>
                     <div className="w-full bg-slate-100 h-2 rounded-full">
                       <div className={`h-2 rounded-full ${m.status === 'good' ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${m.val}%` }}></div>
                     </div>
                   </div>
                 ))}
               </div>
            </div>

            <div className="md:col-span-2 bg-sky-50 border border-sky-100 p-8 rounded-2xl">
               <h3 className="text-xl font-bold text-sky-900 mb-6 flex items-center gap-2"><Star className="w-5 h-5 text-sky-600" /> AI Suggestions</h3>
               <ul className="space-y-4">
                 {report.suggestions.map((s, i) => (
                   <li key={i} className="flex gap-4 items-start bg-white p-4 rounded-xl shadow-sm">
                     <CheckCircle2 className="w-6 h-6 text-sky-500 flex-shrink-0" />
                     <p className="text-slate-700 font-medium">{s}</p>
                   </li>
                 ))}
               </ul>
            </div>
         </div>
      )}
    </div>
  );
}
