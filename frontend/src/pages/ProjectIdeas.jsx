import React, { useState, useEffect } from 'react';
import { api } from '../store/useAuthStore';

const FALLBACK_PROJECTS = [
  { id: 1, title: 'E-Commerce Dashboard', diff: 'Intermediate', time: '10 hrs', tech: ['React', 'Chart.js', 'Tailwind'], category: 'Frontend', color: '#3b82f6' },
  { id: 2, title: 'Real-time Chat App', diff: 'Advanced', time: '15 hrs', tech: ['Node.js', 'Socket.io', 'Express'], category: 'Full Stack', color: '#8b5cf6' },
  { id: 3, title: 'Weather API Wrapper', diff: 'Beginner', time: '3 hrs', tech: ['JavaScript', 'Fetch API'], category: 'Backend', color: '#10b981' },
  { id: 4, title: 'URL Shortener', diff: 'Intermediate', time: '8 hrs', tech: ['Express', 'MongoDB', 'Redis'], category: 'Backend', color: '#10b981' },
];

const CATEGORY_COLORS = { Frontend: '#3b82f6', Backend: '#10b981', 'Full Stack': '#8b5cf6', Database: '#f59e0b' };

export default function ProjectIdeas() {
  const [filter, setFilter] = useState('All');
  const [projects, setProjects] = useState(FALLBACK_PROJECTS);

  useEffect(() => {
    api.get('/projects/ideas')
      .then(({ data }) => {
        if (Array.isArray(data) && data.length > 0) {
          setProjects(data.map(p => ({ ...p, color: CATEGORY_COLORS[p.category] || '#6366f1' })));
        }
      })
      .catch(() => {/* keep fallback data */});
  }, []);

  const filtered = filter === 'All' ? projects : projects.filter(p => p.category === filter);

  return (
    <div className="w-full max-w-7xl mx-auto py-16 px-4 sm:px-6">
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-rose-500/5 mb-6">
          <span className="material-symbols-outlined text-rose-600 text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>lightbulb</span>
        </div>
        <h1 className="text-4xl font-black text-on-surface font-headline mb-4">
          Project Ideas & Templates
        </h1>
        <p className="text-lg text-on-surface-variant font-medium max-w-2xl mx-auto">
          Build your portfolio with 200+ guided projects. Step-by-step instructions and starter templates included.
        </p>
      </div>

      <div className="flex gap-4 justify-center mb-16 overflow-x-auto">
        {['All', 'Frontend', 'Backend', 'Full Stack'].map(c => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`px-8 py-3 rounded-2xl font-bold whitespace-nowrap transition-all duration-200 ${
              filter === c
                ? 'bg-gradient-to-r from-rose-500 to-rose-600 text-white shadow-lg shadow-rose-500/30'
                : 'glass-card hover:bg-white/40 text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filtered.map(proj => (
          <div key={proj.id} className="group glass-card rounded-3xl p-8 hover:-translate-y-2 transition-all duration-300 flex flex-col">
            <div className="flex justify-between items-start mb-6">
              <span className={`px-4 py-2 rounded-2xl text-xs font-bold uppercase tracking-wider ${
                proj.diff === 'Beginner' ? 'bg-emerald-500/10 text-emerald-700' :
                proj.diff === 'Intermediate' ? 'bg-amber-500/10 text-amber-700' : 'bg-rose-500/10 text-rose-700'
              }`}>{proj.diff}</span>
              <div className="flex items-center gap-2 text-outline text-sm font-bold">
                <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 0" }}>schedule</span>
                {proj.time}
              </div>
            </div>

            <h3 className="text-xl font-bold text-on-surface mb-4 font-headline leading-tight">{proj.title}</h3>

            <div className="flex flex-wrap gap-2 mb-8 flex-grow">
              {proj.tech.map(t => (
                <span key={t} className="px-3 py-1.5 bg-surface-container/50 border border-outline/20 text-on-surface-variant rounded-xl font-semibold text-sm">
                  {t}
                </span>
              ))}
            </div>

            <div className="flex gap-3 mt-auto">
              <button className="flex-1 py-4 bg-gradient-to-r from-rose-500 to-rose-600 text-on-primary font-bold rounded-2xl hover:from-rose-600 hover:to-rose-700 active:scale-95 transition-all duration-200 shadow-[0px_8px_20px_rgba(244,63,94,0.3)] flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>play_arrow</span>
                Start Guide
              </button>
              <button className="px-5 py-4 glass-card hover:bg-white/40 text-on-surface font-bold rounded-2xl active:scale-95 transition-all duration-200">
                <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>code</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
