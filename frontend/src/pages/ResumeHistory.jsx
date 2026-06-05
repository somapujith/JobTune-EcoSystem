import { Link } from 'react-router-dom';

export default function ResumeHistory() {
  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-24 flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mb-6">
        <span className="material-symbols-outlined text-violet-600 text-3xl" style={{ fontVariationSettings: "'FILL' 0" }}>history</span>
      </div>
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-50 border border-violet-100 text-violet-600 text-xs font-bold tracking-widest uppercase mb-4">
        Coming Soon
      </span>
      <h1 className="text-4xl font-black text-on-surface font-headline mb-4">Resume History</h1>
      <p className="text-lg text-on-surface-variant max-w-xl leading-relaxed mb-8">
        Track every version of your resume, compare ATS scores over time, and see exactly how your profile has improved since day one.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl mb-10">
        {[
          { icon: 'timeline',    label: 'Score Timeline',  desc: 'Track improvements'      },
          { icon: 'compare',     label: 'Version Compare', desc: 'Diff any two versions'   },
          { icon: 'cloud_done',  label: 'Cloud Storage',   desc: 'All versions saved'      },
        ].map(f => (
          <div key={f.label} className="glass-card p-5 rounded-2xl">
            <span className="material-symbols-outlined text-2xl text-violet-500 mb-2 block" style={{ fontVariationSettings: "'FILL' 1" }}>{f.icon}</span>
            <p className="font-bold text-on-surface text-sm">{f.label}</p>
            <p className="text-xs text-on-surface-variant mt-0.5">{f.desc}</p>
          </div>
        ))}
      </div>
      <Link to="/resume" className="inline-flex items-center gap-2 text-violet-600 font-bold text-sm hover:underline">
        <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 0" }}>upload_file</span>
        Analyze a new resume now
      </Link>
    </div>
  );
}
