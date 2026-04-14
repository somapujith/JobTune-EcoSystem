import React, { useEffect, useState } from 'react';
import useAuthStore, { api } from '../store/useAuthStore';
import { Navigate, Link } from 'react-router-dom';
import { 
  Target, 
  Activity, 
  FileText, 
  CheckCircle2, 
  TrendingUp, 
  ArrowRight,
  Zap,
  Star,
  Clock,
  ExternalLink,
  Linkedin,
  Github,
  Layout as LayoutIcon,
  BookOpen,
  Lightbulb
} from 'lucide-react';

const tools = [
  { name: 'Skill Assessment', icon: Activity, path: '/skills', color: 'bg-blue-500', tier: 'Foundation' },
  { name: 'Resume Optimizer', icon: FileText, path: '/resume', color: 'bg-emerald-500', tier: 'Profile' },
  { name: 'LinkedIn Optimizer', icon: Linkedin, path: '/linkedin', color: 'bg-sky-500', tier: 'Profile' },
  { name: 'GitHub Optimizer', icon: Github, path: '/github', color: 'bg-slate-900', tier: 'Profile' },
  { name: 'Portfolio Builder', icon: LayoutIcon, path: '/portfolio', color: 'bg-indigo-500', tier: 'Profile' },
  { name: 'Content Vault', icon: BookOpen, path: '/learning', color: 'bg-amber-500', tier: 'Growth' },
  { name: 'Project Ideas', icon: Lightbulb, path: '/projects', color: 'bg-rose-500', tier: 'Growth' },
];

export default function Dashboard() {
  const { user, isAuthenticated } = useAuthStore();
  const [overview, setOverview] = useState(null);

  useEffect(() => {
    api.get('/dashboard/overview')
      .then(({ data }) => setOverview(data))
      .catch(() => {/* keep static fallback */});
  }, []);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 w-full">
      {/* Header section with welcome and readiness */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12 gap-8">
        <div>
           <div className="flex items-center gap-2 text-blue-600 font-bold text-sm uppercase tracking-widest mb-2">
              <Zap className="w-4 h-4 fill-current" /> Ecosystem Dashboard
           </div>
           <h1 className="text-4xl font-black text-slate-900 tracking-tight">
              Hello, {user?.email?.split('@')[0] || 'Professional'}!
           </h1>
           <p className="text-slate-500 mt-2 font-medium">Your professional ecosystem is currenty <span className="text-emerald-600">45% optimized</span>.</p>
        </div>
        <div className="flex items-center gap-4 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
           <div className="flex -space-x-2 px-2">
              {[1, 2, 3].map(i => (
                 <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center overflow-hidden">
                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i + 42}`} alt="User" />
                 </div>
              ))}
           </div>
           <div className="h-8 w-px bg-slate-100 mx-2"></div>
           <div className="pr-4">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Your Network</p>
              <p className="text-sm font-black text-slate-900">+124 Peers</p>
           </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {[
          { label: 'Readiness Score', val: overview ? `${overview.readiness}/100` : '45/100', icon: Target, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Skills Verified', val: overview ? `${overview.skillsVerified}/25` : '12/25', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Profile Rating', val: overview ? `${overview.profileScore}/100` : 'A-', icon: Star, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Active Projects', val: overview ? overview.actionItems?.length ?? '3' : '3', icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-5 group hover:border-blue-200 transition-colors">
            <div className={`w-14 h-14 ${stat.bg} ${stat.color} rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
              <stat.icon className="w-7 h-7" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
              <p className="text-2xl font-black text-slate-900 tracking-tight">{stat.val}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Main Tool Applications Hub */}
        <div className="lg:col-span-2 space-y-8">
           <div className="flex justify-between items-center">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Your Tool Ecosystem</h3>
              <Link to="/" className="text-sm font-bold text-blue-600 flex items-center gap-1 hover:underline">
                 View Introduction <ExternalLink className="w-3 h-3" />
              </Link>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tools.map((tool, i) => (
                 <Link key={i} to={tool.path} className="group flex items-center justify-between p-6 bg-white rounded-3xl border border-slate-200/60 hover:border-blue-400 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300">
                    <div className="flex items-center gap-4">
                       <div className={`w-12 h-12 ${tool.color} rounded-xl flex items-center justify-center text-white shadow-lg shadow-${tool.color.split('-')[1]}-500/20`}>
                          <tool.icon className="w-6 h-6" />
                       </div>
                       <div>
                          <p className="text-[10px] font-black uppercase tracking-tighter text-slate-400">{tool.tier}</p>
                          <h4 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{tool.name}</h4>
                       </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                 </Link>
              ))}
           </div>
        </div>

        {/* Action Center & Walkthrough */}
        <div className="space-y-8">
           <h3 className="text-2xl font-black text-slate-900 tracking-tight">Priority Actions</h3>
           <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                 <Zap className="w-32 h-32 text-blue-400" />
              </div>
              <div className="relative z-10 space-y-6">
                 <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-400 text-xs font-bold uppercase tracking-wider">
                    Walkthrough Guide
                 </div>
                 <div className="space-y-4">
                    <div className="flex gap-4">
                       <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-black border-2 border-slate-900 shrink-0 relative z-20">1</div>
                       <p className="text-sm font-medium text-slate-300 leading-snug">
                          Complete the <span className="text-white">Technical Assessment</span> to unlock your learning path.
                       </p>
                    </div>
                    <div className="flex gap-4">
                       <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-black border-2 border-slate-900 shrink-0 relative z-20">2</div>
                       <p className="text-sm font-medium text-slate-400 leading-snug">
                          Optimize your <span className="text-white/60">LinkedIn Headline</span> based on suggested keywords.
                       </p>
                    </div>
                 </div>
                 <Link to="/skills" className="flex items-center justify-center gap-2 w-full py-4 bg-white text-slate-900 rounded-2xl font-black hover:bg-slate-50 transition-all active:scale-95 text-sm">
                    Continue Placement Path <ArrowRight className="w-4 h-4" />
                 </Link>
              </div>
           </div>

           {/* Activity Log */}
           <div className="bg-white rounded-[2rem] border border-slate-100 p-8">
              <div className="flex items-center justify-between mb-6">
                 <h4 className="font-black text-slate-900 tracking-tight">Recent Activity</h4>
                 <Clock className="w-4 h-4 text-slate-400" />
              </div>
              <div className="space-y-6">
                 {(overview?.recentActivity ?? [
                   { id: 1, action: "Skills Verified: React.js", date: "2h ago" },
                   { id: 2, action: "Resume Scored 85/100", date: "1d ago" },
                   { id: 3, action: "Ecosystem Initialized", date: "2d ago" },
                 ]).map((act, i) => (
                    <div key={act.id ?? i} className="flex gap-4">
                       <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2"></div>
                       <div className="flex-grow">
                          <p className="text-sm font-bold text-slate-800 leading-none">{act.action}</p>
                          <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-tighter">{act.date}</p>
                       </div>
                    </div>
                 ))}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
