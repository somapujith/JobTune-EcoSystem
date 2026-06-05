import { Link } from 'react-router-dom';

export default function ResumeBuilder() {
  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-24 flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mb-6">
        <span className="material-symbols-outlined text-emerald-600 text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>edit_document</span>
      </div>
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-bold tracking-widest uppercase mb-4">
        Coming Soon
      </span>
      <h1 className="text-4xl font-black text-on-surface font-headline mb-4">Resume Builder</h1>
      <p className="text-lg text-on-surface-variant max-w-xl leading-relaxed mb-8">
        Build a professional resume from scratch using guided templates, section-by-section editing, and AI-powered suggestions — no design skills needed.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl mb-10">
        {[
          { icon: 'auto_awesome', label: '10+ Templates', desc: 'ATS-friendly designs'  },
          { icon: 'smart_toy',    label: 'AI Writing',    desc: 'Bullet point generator' },
          { icon: 'download',     label: 'PDF Export',    desc: 'One-click download'     },
        ].map(f => (
          <div key={f.label} className="glass-card p-5 rounded-2xl">
            <span className="material-symbols-outlined text-2xl text-emerald-500 mb-2 block" style={{ fontVariationSettings: "'FILL' 1" }}>{f.icon}</span>
            <p className="font-bold text-on-surface text-sm">{f.label}</p>
            <p className="text-xs text-on-surface-variant mt-0.5">{f.desc}</p>
          </div>
        ))}
      </div>
      <Link to="/resume" className="inline-flex items-center gap-2 text-emerald-600 font-bold text-sm hover:underline">
        <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>auto_fix_high</span>
        In the meantime, try Resume Forge
      </Link>
    </div>
  );
}
