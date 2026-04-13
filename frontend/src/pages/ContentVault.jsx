import React, { useState, useEffect } from 'react';
import { BookOpen, Search, PlayCircle, FileText, Code } from 'lucide-react';

const resources = [
  { id: 1, title: 'Complete React Guide 2026', type: 'Video', duration: '12 Hours', category: 'Frontend' },
  { id: 2, title: 'System Design Interview Prep', type: 'Article', duration: '45 Mins', category: 'Backend' },
  { id: 3, title: 'Advanced SQL Patterns', type: 'Interactive', duration: '2 Hours', category: 'Database' },
  { id: 4, title: 'Mastering the Behavioral Interview', type: 'Course', duration: '3 Hours', category: 'Soft Skills' },
  { id: 5, title: 'TypeScript for JavaScript Developers', type: 'Video', duration: '4 Hours', category: 'Frontend' },
  { id: 6, title: 'Docker & Kubernetes Basics', type: 'Article', duration: '1.5 Hours', category: 'DevOps' }
];

export default function ContentVault() {
  const [filter, setFilter] = useState('All');
  const categories = ['All', 'Frontend', 'Backend', 'Database', 'Soft Skills', 'DevOps'];

  const filtered = filter === 'All' ? resources : resources.filter(r => r.category === filter);

  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6">
      <div className="flex flex-col md:flex-row justify-between items-center mb-12 gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2 flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-amber-500" /> Content Vault
          </h1>
          <p className="text-slate-600">Access your personalized learning paths and resources.</p>
        </div>
        <div className="relative">
          <input 
            type="text" 
            placeholder="Search resources..." 
            className="w-full md:w-80 pl-10 pr-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
          />
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-4 mb-8">
        {categories.map(c => (
          <button 
            key={c}
            onClick={() => setFilter(c)}
            className={`px-6 py-2 rounded-full font-medium whitespace-nowrap transition-colors ${filter === c ? 'bg-amber-100 text-amber-700' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(item => (
          <div key={item.id} className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 to-orange-400 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300"></div>
            <div className="flex justify-between items-start mb-4">
              <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-md uppercase tracking-wider">{item.category}</span>
              {item.type === 'Video' && <PlayCircle className="text-slate-400 w-5 h-5" />}
              {item.type === 'Article' && <FileText className="text-slate-400 w-5 h-5" />}
              {item.type === 'Interactive' && <Code className="text-slate-400 w-5 h-5" />}
              {item.type === 'Course' && <BookOpen className="text-slate-400 w-5 h-5" />}
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-amber-600 transition-colors">{item.title}</h3>
            <p className="text-sm font-medium text-slate-500 mb-6">{item.duration} • {item.type}</p>
            <button className="w-full py-2 bg-slate-50 text-slate-700 font-medium rounded-lg group-hover:bg-amber-50 group-hover:text-amber-700 transition-colors">
              Start Learning
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
