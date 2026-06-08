import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, FileText, Github, Linkedin, Layout as LayoutIcon,
  BookOpen, Lightbulb, ArrowRight, Sparkles, ChevronRight,
  CheckCircle2, TrendingUp, Users, Zap, Star, Lock
} from 'lucide-react';

// ── Data ─────────────────────────────────────────────────────────────────────

const TOOLS = [
  { name: 'Skill Assessment',  icon: Activity,    path: '/skills',    accent: '#3b82f6', light: '#eff6ff', tag: 'Foundation' },
  { name: 'Resume Forge',      icon: FileText,    path: '/resume',    accent: '#10b981', light: '#f0fdf4', tag: 'Resumes'    },
  { name: 'LinkedIn Optimizer',icon: Linkedin,    path: '/linkedin',  accent: '#0ea5e9', light: '#f0f9ff', tag: 'Profile'    },
  { name: 'GitHub Optimizer',  icon: Github,      path: '/github',    accent: '#6366f1', light: '#eef2ff', tag: 'Profile'    },
  { name: 'Portfolio Builder', icon: LayoutIcon,  path: '/portfolio', accent: '#8b5cf6', light: '#f5f3ff', tag: 'Profile'    },
  { name: 'Content Vault',     icon: BookOpen,    path: '/learning',  accent: '#f59e0b', light: '#fffbeb', tag: 'Growth'     },
  { name: 'Project Ideas',     icon: Lightbulb,   path: '/projects',  accent: '#ef4444', light: '#fef2f2', tag: 'Growth'     },
];

const STEPS = [
  { num: '01', title: 'Assess',   desc: 'A 45-min diagnostic maps your exact technical standing across 25+ domains.' },
  { num: '02', title: 'Optimize', desc: 'AI rewrites your resume, LinkedIn headline, and GitHub profile for recruiters.' },
  { num: '03', title: 'Learn',    desc: 'A personalized path fills every gap the assessment found — nothing extra.' },
  { num: '04', title: 'Build',    desc: 'Ship real projects using guided templates and host them with one click.' },
];

// ── Micro-components (Composition Pattern) ───────────────────────────────────

function SectionBadge({ children }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs font-bold tracking-widest uppercase">
      {children}
    </span>
  );
}

function DarkBadge({ children }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/8 border border-white/10 text-blue-300 text-xs font-bold tracking-widest uppercase">
      {children}
    </span>
  );
}

// Animated counter hook
function useCounter(target, duration = 1500) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        let start = 0;
        const step = target / (duration / 16);
        const timer = setInterval(() => {
          start = Math.min(start + step, target);
          setCount(Math.floor(start));
          if (start >= target) clearInterval(timer);
        }, 16);
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return [count, ref];
}

function StatCounter({ value, suffix = '', label }) {
  const [count, ref] = useCounter(value);
  return (
    <div ref={ref} className="text-center">
      <p className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tighter">
        {count.toLocaleString()}{suffix}
      </p>
      <p className="text-slate-500 text-sm font-medium mt-1">{label}</p>
    </div>
  );
}

// ── Pure CSS Visuals for Feature Sections ────────────────────────────────────

function AssessmentVisual() {
  const skills = [
    { label: 'React.js',       pct: 82, color: '#3b82f6' },
    { label: 'System Design',  pct: 54, color: '#f59e0b' },
    { label: 'Databases',      pct: 68, color: '#10b981' },
    { label: 'Behavioral',     pct: 91, color: '#8b5cf6' },
  ];
  return (
    <div className="bg-slate-900/80 rounded-2xl p-6 space-y-4 shadow-glass backdrop-blur-md border border-white/10">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Skill Radar</span>
        <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-full">
          Score: 73 / 100
        </span>
      </div>
      {skills.map(s => (
        <div key={s.label}>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-slate-400 font-medium">{s.label}</span>
            <span className="text-slate-600">{s.pct}%</span>
          </div>
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${s.pct}%`, background: s.color }}
            />
          </div>
        </div>
      ))}
      <div className="pt-3 border-t border-white/5 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
        <p className="text-[11px] text-slate-500">
          Gap detected: <span className="text-amber-400 font-semibold">System Design</span>
        </p>
      </div>
      <div className="bg-blue-500/8 rounded-xl p-3 border border-blue-500/15">
        <p className="text-[11px] text-blue-300 font-medium">
          ✦ Suggested path: System Design for SDE-1
        </p>
      </div>
    </div>
  );
}

function ResumeVisual() {
  return (
    <div className="bg-slate-900/80 rounded-2xl p-6 border border-white/10 shadow-glass backdrop-blur-md space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative w-16 h-16 shrink-0">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1e293b" strokeWidth="3.2" />
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#3b82f6" strokeWidth="3.2"
              strokeDasharray="85 100" strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-black text-white">85</span>
          </div>
        </div>
        <div>
          <p className="text-white font-bold">ATS Score</p>
          <p className="text-slate-500 text-xs mt-0.5">Better than 78% of applicants</p>
        </div>
      </div>
      <div className="space-y-1">
        {[
          { label: 'Keyword match',  status: 'Strong',  ok: true  },
          { label: 'Impact verbs',   status: 'Weak',    ok: false },
          { label: 'Quantified wins',status: 'Missing', ok: false },
          { label: 'Format check',   status: 'Pass',    ok: true  },
        ].map(r => (
          <div key={r.label} className="flex items-center justify-between py-2 border-b border-white/5">
            <span className="text-xs text-slate-400">{r.label}</span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${r.ok ? 'text-emerald-400 bg-emerald-400/10' : 'text-rose-400 bg-rose-400/10'}`}>
              {r.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VaultVisual() {
  const items = [
    { title: 'React Patterns Deep Dive', type: 'Video',       dur: '12h', c: '#3b82f6' },
    { title: 'System Design Crash Course', type: 'Course',    dur: '6h',  c: '#8b5cf6' },
    { title: 'Advanced SQL & Indexing',   type: 'Interactive',dur: '2h',  c: '#10b981' },
    { title: 'Behavioral Interview Guide',type: 'PDF',         dur: '1h',  c: '#f59e0b' },
  ];
  return (
    <div className="bg-slate-900/80 rounded-2xl p-6 border border-white/10 shadow-glass backdrop-blur-md space-y-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">For you</span>
        <span className="text-[11px] text-blue-400 font-semibold">4 new</span>
      </div>
      {items.map(it => (
        <div key={it.title} className="flex items-center gap-3 p-3 rounded-xl bg-white/3 hover:bg-white/6 transition-colors cursor-pointer group">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: it.c + '18' }}>
            <div className="w-3 h-3 rounded" style={{ background: it.c }} />
          </div>
          <div className="flex-grow min-w-0">
            <p className="text-sm font-semibold text-white truncate">{it.title}</p>
            <p className="text-[11px] text-slate-500">{it.type} · {it.dur}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-700 group-hover:text-slate-400 shrink-0 transition-colors" />
        </div>
      ))}
    </div>
  );
}

const FEATURES = [
  {
    badge: 'Step 1 — Skill Assessment',
    title: 'Know your blind spots\nbefore recruiters find them.',
    desc: 'Our assessment covers 25+ domains: React, System Design, SQL, DevOps, and even behavioral questions. You walk out with a ranked breakdown and a personal learning path — not just a number.',
    cta: 'Take the Assessment',
    path: '/skills',
    Visual: AssessmentVisual,
  },
  {
    badge: 'Step 2 — Resume Forge',
    title: 'Get past every ATS\nfilter, every time.',
    desc: 'Upload once. Get a full ATS compatibility score, keyword gap analysis, and rewritten bullet points with quantified impact — all in seconds. Most users improve their score by 20+ points.',
    cta: 'Forge My Resume',
    path: '/resume',
    Visual: ResumeVisual,
  },
  {
    badge: 'Step 3 — Content Vault',
    title: 'Learn exactly what\nthe market is hiring for.',
    desc: '1,000+ hand-picked resources mapped directly to your skill gaps. No random Udemy rabbit holes — just the specific content that closes the specific gaps your assessment found.',
    cta: 'Enter the Vault',
    path: '/learning',
    Visual: VaultVisual,
  },
];

// ── Main Component ────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div className="flex flex-col flex-grow w-full overflow-x-hidden">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section
        className="relative min-h-screen flex flex-col items-center justify-center text-center px-4 sm:px-6 lg:px-8 overflow-hidden"
        style={{
          background: 'transparent',
          backgroundImage: `
            linear-gradient(rgba(128,128,128,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(128,128,128,0.05) 1px, transparent 1px)
          `,
          backgroundSize: '72px 72px',
        }}
      >
        {/* Glow orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/15 blur-[140px] rounded-full pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 blur-[140px] rounded-full pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto space-y-8">
          <DarkBadge>
            <Sparkles className="w-3 h-3" /> The Complete Career OS for Freshers
          </DarkBadge>

          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-slate-900 dark:text-white leading-[0.95] tracking-tighter drop-shadow-sm">
            Stop applying.<br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(135deg, #60a5fa 0%, #818cf8 50%, #a78bfa 100%)' }}
            >
              Start getting hired.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed font-light">
            7 interconnected tools that take you from confused fresher to job-ready professional.
            Built for CS graduates. Free, forever.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
            <Link
              to="/login"
              className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-blue-600 text-white rounded-xl font-bold text-base hover:bg-blue-500 transition-all duration-200 active:scale-95 shadow-[0_0_40px_rgba(37,99,235,0.35)]"
            >
              Get Started — It's Free
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-white/5 border border-white/10 text-slate-300 rounded-xl font-bold text-base hover:bg-white/10 transition-all duration-200 backdrop-blur-sm"
            >
              See how it works
            </a>
          </div>

          {/* Social proof */}
          <div className="flex items-center justify-center gap-6 pt-4">
            <div className="flex -space-x-2.5">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="w-9 h-9 rounded-full border-2 border-[#030712] bg-slate-800 overflow-hidden">
                  <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i * 7}`} alt="" />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                ))}
              </div>
              <span className="text-slate-600 dark:text-slate-400 text-sm">
                <span className="text-slate-900 dark:text-white font-bold">50,000+</span> students improving
              </span>
            </div>
          </div>
        </div>

        {/* Tool strip */}
        <div className="absolute bottom-12 left-0 right-0 z-10 overflow-hidden">
          <div className="flex justify-center gap-3 px-4 flex-wrap">
            {TOOLS.map(t => (
              <div
                key={t.name}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border backdrop-blur-sm ${t.locked ? 'bg-slate-200/50 dark:bg-white/2 border-slate-300 dark:border-white/4 grayscale' : 'bg-slate-200/50 dark:bg-white/4 border-slate-300 dark:border-white/8'}`}
                title={t.locked ? 'Under maintenance' : ''}
              >
                {t.locked ? <Lock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600" /> : <t.icon className="w-3.5 h-3.5" style={{ color: t.accent }} />}
                <span className="text-xs text-slate-700 dark:text-slate-400 font-medium whitespace-nowrap flex items-center gap-1">
                  {t.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats Bar ────────────────────────────────────────────────────── */}
      <section className="glass-panel border-t border-white/20 border-b border-white/20 dark:border-white/5 relative z-10">
        <div className="max-w-5xl mx-auto px-4 py-16 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-0 md:divide-x md:divide-slate-300 dark:md:divide-white/10">
          <StatCounter value={50000} suffix="+" label="Students enrolled" />
          <StatCounter value={87}    suffix="%" label="Reported better interviews" />
          <StatCounter value={7}     suffix=""  label="Interconnected tools" />
          <StatCounter value={1000}  suffix="+" label="Curated resources" />
        </div>
      </section>

      {/* ── Feature Sections ─────────────────────────────────────────────── */}
      {FEATURES.map((f, idx) => {
        const isEven = idx % 2 === 0;
        return (
          <section key={idx} className="relative z-10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
              <div className={`grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center ${!isEven ? 'lg:grid-flow-dense' : ''}`}>

                {/* Text */}
                <div className={`space-y-6 ${!isEven ? 'lg:col-start-2' : ''}`}>
                  <SectionBadge>{f.badge}</SectionBadge>
                  <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white leading-tight tracking-tight whitespace-pre-line">
                    {f.title}
                  </h2>
                  <p className="text-lg text-slate-500 leading-relaxed">
                    {f.desc}
                  </p>
                  <Link
                    to={f.path}
                    className="inline-flex items-center gap-2 text-blue-600 font-bold text-sm hover:gap-3 transition-all group"
                  >
                    {f.cta}
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>

                {/* Visual */}
                <div className={`${!isEven ? 'lg:col-start-1 lg:row-start-1' : ''}`}>
                  <div className="rounded-2xl overflow-hidden glass-card border border-white/30 dark:border-white/10">
                    <div className="bg-slate-200/50 dark:bg-slate-800/50 px-4 py-3 flex items-center gap-2 border-b border-white/20 dark:border-white/5">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-rose-400/80" />
                        <div className="w-3 h-3 rounded-full bg-amber-400/80" />
                        <div className="w-3 h-3 rounded-full bg-emerald-400/80" />
                      </div>
                      <div className="flex-grow h-5 bg-white/40 dark:bg-slate-700/50 rounded mx-8" />
                    </div>
                    <div className="p-4 bg-transparent">
                      <f.Visual />
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </section>
        );
      })}

      {/* ── All 7 Tools ──────────────────────────────────────────────────── */}
      <section
        id="tools"
        className="py-24 lg:py-32 relative overflow-hidden glass-panel border-y border-white/20 dark:border-white/5"
      >
        <div className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 20% 50%, rgba(59,130,246,0.05) 0%, transparent 50%),
                              radial-gradient(circle at 80% 20%, rgba(139,92,246,0.05) 0%, transparent 50%)`,
          }}
        />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center space-y-4 mb-16">
            <DarkBadge>Every tool you need</DarkBadge>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tight drop-shadow-sm">
              The complete 7-tool ecosystem
            </h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">
              Each tool feeds into the next. Your skill gaps inform your resume. Your resume score shapes your LinkedIn. It all connects.
            </p>
          </div>

          {/* Bento grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TOOLS.map((tool, i) => {
              const Icon = tool.icon;
              const isFeatured = i === 0 || i === 5;
              return tool.locked ? (
                <div 
                  key={tool.name}
                  className={`relative p-6 rounded-2xl border border-white/8 bg-white/3 opacity-50 cursor-not-allowed flex flex-col gap-4 overflow-hidden ${isFeatured ? 'sm:col-span-2 lg:col-span-1' : ''}`}
                >
                  <div className="relative z-10 flex items-start justify-between">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-slate-800">
                      <Lock className="w-5 h-5 text-slate-600" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 border border-white/8 px-2 py-0.5 rounded-full flex items-center gap-1">
                      {tool.tag} <Lock className="w-2.5 h-2.5" />
                    </span>
                  </div>
                  <div className="relative z-10">
                    <h3 className="text-base font-bold text-slate-500 mb-1">{tool.name}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed italic">
                      Temporarily unavailable while undergoing a massive AI upgrade.
                    </p>
                  </div>
                </div>
              ) : (
                <Link
                  key={tool.name}
                  to={tool.path}
                  className={`group relative p-6 rounded-2xl glass-button flex flex-col gap-4 overflow-hidden ${isFeatured ? 'sm:col-span-2 lg:col-span-1' : ''}`}
                >
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"
                    style={{ background: `radial-gradient(circle at 0% 0%, ${tool.accent}10 0%, transparent 60%)` }}
                  />
                  <div className="relative z-10 flex items-start justify-between">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center"
                      style={{ background: tool.accent + '18' }}
                    >
                      <Icon className="w-5 h-5" style={{ color: tool.accent }} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 border border-white/8 px-2 py-0.5 rounded-full">
                      {tool.tag}
                    </span>
                  </div>
                  <div className="relative z-10">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                      {tool.name}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      {[
                        'Interactive quiz covering 25+ skills. Get a 360° view of your technical standing.',
                        'ATS-focused scoring and impact analysis. Upload any format.',
                        'Keyword strategy and headline scoring for executive-level visibility.',
                        'Automated profile README generation and repo health audit.',
                        'Build a high-conversion personal site with zero code required.',
                        '1,000+ curated resources mapped to your specific skill gaps.',
                        'Industry-standard project blueprints with step-by-step guides.',
                      ][i]}
                    </p>
                  </div>
                  <div className="relative z-10 flex items-center gap-1.5 text-xs font-bold mt-auto opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200" style={{ color: tool.accent }}>
                    Open tool <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How it Works ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="relative z-10 py-24 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <SectionBadge>The process</SectionBadge>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tight">
              From day one to offer letter
            </h2>
          </div>

          <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Connecting line (desktop) */}
            <div className="hidden lg:block absolute top-10 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

            {STEPS.map((step, i) => (
              <div key={i} className="relative flex flex-col items-center text-center group">
                <div className="relative mb-6">
                  <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center group-hover:border-blue-200 dark:group-hover:border-blue-500 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 transition-all duration-300">
                    <span className="text-2xl font-black text-slate-300 dark:text-slate-600 group-hover:text-blue-500 transition-colors">
                      {step.num}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="lg:hidden absolute top-1/2 left-full w-8 h-px bg-slate-200 -translate-y-1/2" />
                  )}
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">{step.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed max-w-[200px]">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="relative z-10 py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div
            className="rounded-3xl p-12 md:p-20 text-center relative overflow-hidden glass-card"
          >
            {/* Subtle grid overlay */}
            <div
              className="absolute inset-0 rounded-3xl opacity-30"
              style={{
                backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
                backgroundSize: '40px 40px',
              }}
            />
            <div className="absolute top-0 right-0 w-80 h-80 bg-blue-600/10 blur-[100px] rounded-full pointer-events-none" />

            <div className="relative z-10 space-y-6">
              <div className="flex items-center justify-center gap-2 mb-2">
                {[...Array(5)].map((_, i) => (
                  <CheckCircle2 key={i} className="w-4 h-4 text-emerald-400" />
                ))}
              </div>
              <h2 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white leading-tight tracking-tight">
                Your career doesn't wait.<br />
                <span className="text-blue-600 dark:text-blue-300">Neither should you.</span>
              </h2>
              <p className="text-slate-600 dark:text-slate-400 text-lg max-w-lg mx-auto font-light leading-relaxed">
                Join 50,000+ freshers who stopped guessing and started building a profile that actually gets interviews.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
                <Link
                  to="/login"
                  className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-white text-slate-900 rounded-xl font-black text-base hover:bg-blue-50 transition-all duration-200 active:scale-95 shadow-xl"
                >
                  <Users className="w-5 h-5 text-blue-600" />
                  Start for free
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link
                  to="/skills"
                  className="inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-white/5 border border-white/10 text-slate-300 rounded-xl font-bold text-base hover:bg-white/10 transition-all duration-200"
                >
                  <Zap className="w-4 h-4 text-blue-400" />
                  Take the assessment first
                </Link>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-xs">No credit card. No paywall. No BS.</p>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
