import React from 'react';
import { Link } from 'react-router-dom';
import { Activity, FileText, Github, Linkedin, Layout as LayoutIcon, BookOpen, Lightbulb, ArrowRight, CheckCircle2 } from 'lucide-react';

const tools = [
  {
    tier: 'Tier 1: Foundation',
    items: [
      { name: 'Skill Assessment', icon: Activity, desc: '45-min interactive quiz covering 25+ skills. Identifies gaps.', path: '/skills', color: 'bg-blue-100 text-blue-600' }
    ]
  },
  {
    tier: 'Tier 2: Profile Building',
    items: [
      { name: 'Resume Optimizer', icon: FileText, desc: '6-score breakdown (ATS, Impact, Skills, etc).', path: '/resume', color: 'bg-emerald-100 text-emerald-600' },
      { name: 'LinkedIn Optimizer', icon: Linkedin, desc: 'Profile scoring and keyword optimization.', path: '/linkedin', color: 'bg-sky-100 text-sky-600' },
      { name: 'GitHub Optimizer', icon: Github, desc: 'README generator & repo analysis.', path: '/github', color: 'bg-slate-200 text-slate-800' },
      { name: 'Portfolio Builder', icon: LayoutIcon, desc: 'Drag-drop builder with zero coding required.', path: '/portfolio', color: 'bg-indigo-100 text-indigo-600' }
    ]
  },
  {
    tier: 'Tier 3: Learning & Growth',
    items: [
      { name: 'Content Vault', icon: BookOpen, desc: '1000+ curated resources & personalized paths.', path: '/learning', color: 'bg-amber-100 text-amber-600' },
      { name: 'Project Ideas', icon: Lightbulb, desc: '200+ projects with step-by-step guides.', path: '/projects', color: 'bg-rose-100 text-rose-600' }
    ]
  }
];

export default function Home() {
  return (
    <div className="flex flex-col flex-grow">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 touch-none"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-200 to-indigo-100">
            Launch Your Career. <br /> Zero Cost.
          </h1>
          <p className="text-xl md:text-2xl text-blue-100/80 mb-10 max-w-3xl mx-auto font-light leading-relaxed">
            The complete 7-tool ecosystem for fresh graduates. Build skills, optimize your profile, and land your dream job.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link to="/skills" className="px-8 py-4 bg-white text-blue-900 rounded-full font-bold text-lg hover:bg-blue-50 transition-all shadow-[0_0_40px_rgba(255,255,255,0.3)] hover:scale-105 flex items-center gap-2">
              Start Assessment <ArrowRight className="w-5 h-5" />
            </Link>
            <Link to="/resume" className="px-8 py-4 bg-blue-800/50 backdrop-blur-sm border border-blue-400/30 text-white rounded-full font-bold text-lg hover:bg-blue-800/80 transition-all flex items-center gap-2">
              Upload Resume
            </Link>
          </div>
        </div>
      </section>

      {/* Tools Section */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">The 7-Tool Ecosystem</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">Everything you need to go from fresher to employed, structured in three strategic tiers.</p>
          </div>

          <div className="space-y-16">
            {tools.map((tier, idx) => (
              <div key={idx} className="relative">
                <h3 className="text-xl font-bold text-slate-800 mb-8 flex items-center gap-4">
                  <span className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600">{idx + 1}</span>
                  {tier.tier}
                  <div className="h-px bg-slate-200 flex-grow ml-4"></div>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {tier.items.map((item, toolIdx) => {
                    const Icon = item.icon;
                    return (
                      <Link key={toolIdx} to={item.path} className="group bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col h-full">
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 ${item.color}`}>
                          <Icon className="w-7 h-7" />
                        </div>
                        <h4 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">{item.name}</h4>
                        <p className="text-slate-600 mb-6 flex-grow">{item.desc}</p>
                        <div className="text-sm font-medium text-blue-600 flex items-center opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">
                          Try Tool <ArrowRight className="w-4 h-4 ml-1" />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
