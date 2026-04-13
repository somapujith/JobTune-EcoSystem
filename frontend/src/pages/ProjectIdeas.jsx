import React, { useState } from 'react';
import { Lightbulb, Code2, Play, Users, Clock, Box } from 'lucide-react';

const projects = [
  { id: 1, title: 'E-Commerce Dashboard', diff: 'Intermediate', time: '10 hrs', tech: ['React', 'Chart.js', 'Tailwind'], category: 'Frontend' },
  { id: 2, title: 'Real-time Chat App', diff: 'Advanced', time: '15 hrs', tech: ['Node.js', 'Socket.io', 'Express'], category: 'Full Stack' },
  { id: 3, title: 'Weather API Wrapper', diff: 'Beginner', time: '3 hrs', tech: ['JavaScript', 'Fetch API'], category: 'Backend' },
  { id: 4, title: 'URL Shortener', diff: 'Intermediate', time: '8 hrs', tech: ['Express', 'MongoDB', 'Redis'], category: 'Backend' },
];

export default function ProjectIdeas() {
  const [filter, setFilter] = useState('All');
  
  const filtered = filter === 'All' ? projects : projects.filter(p => p.category === filter);

  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold text-slate-900 mb-4 flex items-center justify-center gap-3">
          <Lightbulb className="w-10 h-10 text-yellow-500" /> Project Ideas & Templates
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">Build your portfolio with 200+ guided projects. Step-by-step instructions and starter templates included.</p>
      </div>

      <div className="flex gap-4 justify-center mb-12">
        {['All', 'Frontend', 'Backend', 'Full Stack'].map(c => (
          <button 
            key={c}
            onClick={() => setFilter(c)}
            className={`px-6 py-2 rounded-full font-medium transition-colors ${filter === c ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filtered.map(proj => (
          <div key={proj.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <span className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
                proj.diff === 'Beginner' ? 'bg-emerald-100 text-emerald-700' :
                proj.diff === 'Intermediate' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
              }`}>{proj.diff}</span>
              <span className="flex items-center gap-1 text-slate-500 text-sm font-medium"><Clock className="w-4 h-4" /> {proj.time}</span>
            </div>
            
            <h3 className="text-xl font-bold text-slate-900 mb-3">{proj.title}</h3>
            
            <div className="flex flex-wrap gap-2 mb-6 flex-grow">
              {proj.tech.map(t => (
                <span key={t} className="px-2.5 py-1 bg-slate-50 text-slate-600 border border-slate-200 rounded font-medium text-xs">
                  {t}
                </span>
              ))}
            </div>

            <div className="flex gap-3">
              <button className="flex-1 py-2.5 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition-colors flex items-center justify-center gap-2">
                <Play className="w-4 h-4" /> Start Guide
              </button>
              <button className="px-4 py-2.5 bg-slate-100 text-slate-600 font-medium rounded-lg hover:bg-slate-200 transition-colors">
                <Box className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
