import React from 'react';
import { Clock } from 'lucide-react';

export default function ResumeHistory() {
  return (
    <div className="w-full max-w-7xl mx-auto py-16 px-4 sm:px-6 flex items-center justify-center min-h-[60vh]">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-[0px_8px_32px_rgba(0,0,0,0.04)] border border-slate-100 p-12 text-center relative overflow-hidden">
        
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-50 text-purple-700 text-sm font-bold mb-6">
          <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse"></span>
          Coming Soon
        </div>

        {/* Icon */}
        <div className="w-20 h-20 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-6">
          <Clock className="w-10 h-10 text-purple-600" />
        </div>

        {/* Text */}
        <h1 className="text-3xl font-black text-slate-800 tracking-tight mb-4">
          Resume History
        </h1>
        <p className="text-slate-500 text-lg leading-relaxed mb-8 max-w-md mx-auto">
          View all your past resume analyses and track your improvement over time.
        </p>

        {/* Action (disabled) */}
        <button disabled className="px-8 py-3.5 bg-slate-100 text-slate-400 font-bold rounded-xl cursor-not-allowed transition-all">
          Not yet available
        </button>

      </div>
    </div>
  );
}