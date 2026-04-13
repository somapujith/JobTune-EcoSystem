import React, { useState } from 'react';
import { Layout as LayoutIcon, Eye, Save, Type, Image as ImageIcon, Link as LinkIcon, Edit3 } from 'lucide-react';

export default function PortfolioBuilder() {
  const [sections, setSections] = useState([
    { id: 1, type: 'hero', title: 'Hi, I am Alex Developer', subtitle: 'Building aesthetic, modern web experiences.', bg: 'bg-slate-900 text-white' },
    { id: 2, type: 'about', text: 'I am a passionate software engineer specializing in frontend technologies ecosystem. I love building tools that empower users.' }
  ]);

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* Sidebar logic for drag and drop */}
      <div className="w-80 bg-white border-r border-slate-200 flex flex-col hidden sm:flex">
         <div className="p-6 border-b border-slate-100">
           <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><LayoutIcon className="w-5 h-5" /> Blocks</h2>
           <p className="text-sm text-slate-500 mt-1">Click blocks to add them to your portfolio.</p>
         </div>
         <div className="p-4 space-y-3 overflow-y-auto flex-grow">
           <button className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-colors flex items-center gap-3">
             <Type className="text-slate-400 w-5 h-5" /> <span className="font-medium text-slate-700">Hero Section</span>
           </button>
           <button className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-colors flex items-center gap-3">
             <ImageIcon className="text-slate-400 w-5 h-5" /> <span className="font-medium text-slate-700">Project Gallery</span>
           </button>
           <button className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-colors flex items-center gap-3">
             <Edit3 className="text-slate-400 w-5 h-5" /> <span className="font-medium text-slate-700">Text / About</span>
           </button>
           <button className="w-full text-left p-4 border border-slate-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-colors flex items-center gap-3">
             <LinkIcon className="text-slate-400 w-5 h-5" /> <span className="font-medium text-slate-700">Contact / Social</span>
           </button>
         </div>
         <div className="p-4 border-t border-slate-100 space-y-3 pb-8">
           <button className="w-full bg-slate-900 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-800">
              <Eye className="w-5 h-5" /> Preview
           </button>
           <button className="w-full bg-indigo-600 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-700">
              <Save className="w-5 h-5" /> Publish
           </button>
         </div>
      </div>

      {/* Editor Canvas */}
      <div className="flex-grow bg-slate-100 overflow-y-auto p-4 sm:p-8">
         <div className="max-w-4xl mx-auto bg-white min-h-[800px] shadow-sm rounded-lg overflow-hidden outline outline-1 outline-slate-200">
            {sections.map(sec => (
              <div key={sec.id} className={`group relative border-2 border-transparent hover:border-indigo-400 transition-colors ${sec.bg || 'bg-white text-slate-900'}`}>
                 <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white text-slate-900 text-xs px-2 py-1 rounded shadow-sm font-medium cursor-pointer">Edit Block</div>
                 {sec.type === 'hero' && (
                    <div className="py-24 px-12 text-center">
                       <h1 className="text-5xl font-extrabold tracking-tight mb-6">{sec.title}</h1>
                       <p className="text-xl opacity-80">{sec.subtitle}</p>
                    </div>
                 )}
                 {sec.type === 'about' && (
                    <div className="py-16 px-12">
                       <h3 className="text-2xl font-bold mb-4">About Me</h3>
                       <p className="text-lg leading-relaxed opacity-80">{sec.text}</p>
                    </div>
                 )}
              </div>
            ))}
         </div>
      </div>
    </div>
  );
}
