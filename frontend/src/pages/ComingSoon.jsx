import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowLeft } from 'lucide-react';

export default function ComingSoon({
  toolName = 'This tool',
  description = "We're building this feature right now. Check back soon!",
}) {
  return (
    <div className="max-w-3xl mx-auto py-20 px-4 sm:px-6 w-full text-center">
      <div className="glass-card rounded-3xl p-12">
        <div className="w-16 h-16 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-6">
          <Sparkles className="w-8 h-8" />
        </div>
        <div className="text-blue-600 font-bold text-sm uppercase tracking-widest mb-2">Coming Soon</div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-3">{toolName}</h1>
        <p className="text-slate-500 font-medium max-w-md mx-auto mb-8">{description}</p>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
