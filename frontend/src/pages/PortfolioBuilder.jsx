import React, { useState } from 'react';

export default function PortfolioBuilder() {
  const [sections, setSections] = useState([
    { id: 1, type: 'hero', title: 'Hi, I am Alex Developer', subtitle: 'Building aesthetic, modern web experiences.', bg: 'bg-slate-900 text-white' },
    { id: 2, type: 'about', text: 'I am a passionate software engineer specializing in frontend technologies ecosystem. I love building tools that empower users.' }
  ]);

  return (
    <div className="flex h-[calc(100vh-80px)] overflow-hidden w-full">
      {/* Sidebar */}
      <div className="w-80 glass-card rounded-r-3xl rounded-l-none border-l-0 flex flex-col hidden sm:flex shadow-none">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-indigo-600 text-2xl" style={{ fontVariationSettings: "'FILL' 0" }}>web</span>
            <h2 className="text-xl font-black text-on-surface font-headline">Portfolio Blocks</h2>
          </div>
          <p className="text-sm text-on-surface-variant font-medium">Drag blocks to build your professional site</p>
        </div>
        <div className="px-8 pb-8 space-y-4 overflow-y-auto flex-grow">
          <button className="w-full text-left p-4 glass-card hover:bg-white/40 rounded-2xl transition-all duration-200 flex items-center gap-4 group">
            <span className="material-symbols-outlined text-indigo-600 text-lg group-hover:scale-110 transition-transform" style={{ fontVariationSettings: "'FILL' 0" }}>text_fields</span>
            <span className="font-bold text-on-surface">Hero Section</span>
          </button>
          <button className="w-full text-left p-4 glass-card hover:bg-white/40 rounded-2xl transition-all duration-200 flex items-center gap-4 group">
            <span className="material-symbols-outlined text-indigo-600 text-lg group-hover:scale-110 transition-transform" style={{ fontVariationSettings: "'FILL' 0" }}>image</span>
            <span className="font-bold text-on-surface">Project Gallery</span>
          </button>
          <button className="w-full text-left p-4 glass-card hover:bg-white/40 rounded-2xl transition-all duration-200 flex items-center gap-4 group">
            <span className="material-symbols-outlined text-indigo-600 text-lg group-hover:scale-110 transition-transform" style={{ fontVariationSettings: "'FILL' 0" }}>edit</span>
            <span className="font-bold text-on-surface">About Section</span>
          </button>
          <button className="w-full text-left p-4 glass-card hover:bg-white/40 rounded-2xl transition-all duration-200 flex items-center gap-4 group">
            <span className="material-symbols-outlined text-indigo-600 text-lg group-hover:scale-110 transition-transform" style={{ fontVariationSettings: "'FILL' 0" }}>contact_page</span>
            <span className="font-bold text-on-surface">Contact & Social</span>
          </button>
        </div>
        <div className="p-8 space-y-4">
          <button className="w-full bg-indigo-600 text-on-primary font-bold py-4 rounded-2xl hover:bg-indigo-700 active:scale-95 transition-all duration-200 shadow-[0px_10px_30px_rgba(99,102,241,0.3)] flex items-center justify-center gap-3">
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>visibility</span>
            Preview Site
          </button>
          <button className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-4 rounded-2xl hover:scale-105 active:scale-95 transition-all duration-200 shadow-[0px_15px_35px_rgba(0,78,159,0.25)] flex items-center justify-center gap-3">
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>publish</span>
            Publish Portfolio
          </button>
        </div>
      </div>

      {/* Editor Canvas */}
      <div className="flex-grow overflow-y-auto p-4 sm:p-8">
        <div className="max-w-5xl mx-auto glass-card min-h-[900px] rounded-3xl overflow-hidden">
          {sections.map(sec => (
            <div key={sec.id} className={`group relative hover:shadow-[0px_10px_30px_rgba(0,78,159,0.15)] transition-all duration-300 ${sec.bg || 'glass-card border-none'}`}>
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity glass-card text-on-surface text-sm px-4 py-2 rounded-2xl shadow-lg font-bold cursor-pointer border flex items-center gap-2">
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>edit</span>
                Edit Block
              </div>
              {sec.type === 'hero' && (
                <div className="py-32 px-16 text-center">
                  <h1 className="text-6xl font-black tracking-tight mb-8 font-headline">{sec.title}</h1>
                  <p className="text-xl text-on-surface-variant font-medium max-w-2xl mx-auto leading-relaxed">{sec.subtitle}</p>
                </div>
              )}
              {sec.type === 'about' && (
                <div className="py-20 px-16">
                  <h3 className="text-3xl font-black mb-8 font-headline">About Me</h3>
                  <p className="text-lg leading-relaxed text-on-surface-variant font-medium max-w-3xl">{sec.text}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
