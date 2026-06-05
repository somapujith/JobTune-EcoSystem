import React, { useState, useEffect } from 'react';
import { api } from '../store/useAuthStore';

const FALLBACK_RESOURCES = [
  { id: 1, title: 'Complete React Guide 2026', type: 'Video', duration: '12 Hours', category: 'Frontend', color: '#3b82f6' },
  { id: 2, title: 'System Design Interview Prep', type: 'Article', duration: '45 Mins', category: 'Backend', color: '#8b5cf6' },
  { id: 3, title: 'Advanced SQL Patterns', type: 'Interactive', duration: '2 Hours', category: 'Database', color: '#10b981' },
  { id: 4, title: 'Mastering the Behavioral Interview', type: 'Course', duration: '3 Hours', category: 'Soft Skills', color: '#f59e0b' },
  { id: 5, title: 'TypeScript for JavaScript Developers', type: 'Video', duration: '4 Hours', category: 'Frontend', color: '#3b82f6' },
  { id: 6, title: 'Docker & Kubernetes Basics', type: 'Article', duration: '1.5 Hours', category: 'DevOps', color: '#ef4444' }
];

const TYPE_COLORS = { Video: '#3b82f6', Article: '#8b5cf6', Interactive: '#10b981', Course: '#f59e0b' };

export default function ContentVault() {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [resources, setResources] = useState(FALLBACK_RESOURCES);
  const categories = ['All', 'Frontend', 'Backend', 'Database', 'Soft Skills', 'DevOps'];

  useEffect(() => {
    api.get('/learning/resources')
      .then(({ data }) => {
        if (Array.isArray(data) && data.length > 0) {
          setResources(data.map(r => ({ ...r, color: TYPE_COLORS[r.type] || '#6366f1' })));
        }
      })
      .catch(() => {/* keep fallback data */});
  }, []);

  const filtered = resources.filter(r => {
    const matchesFilter = filter === 'All' || r.category === filter;
    const matchesSearch = r.title.toLowerCase().includes(search.toLowerCase()) ||
                         r.type.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="w-full max-w-7xl mx-auto py-16 px-4 sm:px-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12 gap-8">
        <div>
          <h1 className="text-4xl font-black text-on-surface font-headline mb-3 flex items-center gap-4">
            <span className="material-symbols-outlined text-amber-500 text-4xl" style={{ fontVariationSettings: "'FILL' 0" }}>library_books</span>
            Content Vault
          </h1>
          <p className="text-lg text-on-surface-variant font-medium max-w-md">
            Access your personalized learning paths and curated resources designed to close your skill gaps.
          </p>
        </div>
        <div className="relative w-full lg:w-auto">
          <div className="absolute left-4 top-1/2 -translate-y-1/2">
            <span className="material-symbols-outlined text-outline text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>search</span>
          </div>
          <input
            type="text"
            placeholder="Search resources..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full lg:w-80 pl-12 pr-6 py-4 bg-surface-container/50 border border-outline/20 rounded-2xl focus:ring-2 focus:ring-amber-500/20 outline-none font-medium text-on-surface placeholder:text-outline"
          />
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4 mb-12">
        {categories.map(c => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`px-6 py-3 rounded-2xl font-bold whitespace-nowrap transition-all duration-200 ${
              filter === c
                ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
                : 'glass-card hover:bg-white/40 text-on-surface transition-all'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(item => (
          <div key={item.id} className="group glass-card rounded-3xl p-6 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden">
            <div
              className="absolute top-0 left-0 w-full h-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{ background: `linear-gradient(90deg, ${item.color} 0%, ${item.color}80 100%)` }}
            />

            <div className="flex justify-between items-start mb-6">
              <span className="px-4 py-2 glass-panel border border-outline/10 text-on-surface-variant text-xs font-bold rounded-xl uppercase tracking-wider">
                {item.category}
              </span>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: item.color + '20' }}
              >
                {item.type === 'Video' && <span className="material-symbols-outlined" style={{ color: item.color, fontVariationSettings: "'FILL' 0" }}>play_circle</span>}
                {item.type === 'Article' && <span className="material-symbols-outlined" style={{ color: item.color, fontVariationSettings: "'FILL' 0" }}>article</span>}
                {item.type === 'Interactive' && <span className="material-symbols-outlined" style={{ color: item.color, fontVariationSettings: "'FILL' 0" }}>code</span>}
                {item.type === 'Course' && <span className="material-symbols-outlined" style={{ color: item.color, fontVariationSettings: "'FILL' 0" }}>school</span>}
              </div>
            </div>

            <h3 className="text-xl font-bold text-on-surface mb-3 font-headline group-hover:text-amber-600 transition-colors leading-tight">
              {item.title}
            </h3>

            <div className="flex items-center gap-2 mb-6">
              <span className="text-sm font-medium text-outline">{item.duration}</span>
              <span className="text-outline">•</span>
              <span className="text-sm font-medium text-outline">{item.type}</span>
            </div>

            <button className="w-full py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-bold rounded-2xl hover:from-amber-600 hover:to-amber-700 active:scale-95 transition-all duration-200 shadow-lg flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>play_arrow</span>
              Start Learning
            </button>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <span className="material-symbols-outlined text-outline text-6xl mb-4 block" style={{ fontVariationSettings: "'FILL' 0" }}>search_off</span>
          <h3 className="text-xl font-bold text-on-surface mb-2">No resources found</h3>
          <p className="text-on-surface-variant">Try adjusting your search or filter criteria</p>
        </div>
      )}
    </div>
  );
}
