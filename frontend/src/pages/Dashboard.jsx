import React, { useEffect, useState } from 'react';
import useAuthStore, { api } from '../store/useAuthStore';
import useSubscriptionStore from '../store/useSubscriptionStore';
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
  Lightbulb,
  Lock,
  Crown,
  TrendingUp as TrendingUpIcon,
  Search,
  Gauge,
  ListChecks,
  Map as MapIcon,
  GraduationCap
} from 'lucide-react';

// Mirrors the JobTube Subscription Plans PDF tiers exactly.
const ALL_TOOLS = [
  // Learn & Build (₹199/month)
  { name: 'Skill Assessment', icon: Activity, path: '/skills', color: 'bg-blue-500', tier: 'Foundation', plan: 'Learn & Build' },
  { name: 'Career Roadmap', icon: MapIcon, path: '/career', color: 'bg-teal-500', tier: 'Foundation', plan: 'Learn & Build' },
  { name: 'Learning Hub', icon: BookOpen, path: '/learning', color: 'bg-amber-500', tier: 'Foundation', plan: 'Learn & Build' },
  { name: 'Learning Path', icon: GraduationCap, path: '/learning-path', color: 'bg-cyan-600', tier: 'Foundation', plan: 'Learn & Build' },
  { name: 'Project Builder', icon: Lightbulb, path: '/projects', color: 'bg-rose-500', tier: 'Foundation', plan: 'Learn & Build' },
  { name: 'Portfolio Builder', icon: LayoutIcon, path: '/portfolio', color: 'bg-indigo-500', tier: 'Foundation', plan: 'Learn & Build' },

  // Tune & Polish (₹299/month)
  { name: 'Resume Optimizer', icon: FileText, path: '/resume', color: 'bg-emerald-500', tier: 'Profile', plan: 'Tune & Polish' },
  { name: 'ATS Checker', icon: CheckCircle2, path: '/ats-checker', color: 'bg-green-500', tier: 'Profile', plan: 'Tune & Polish' },
  { name: 'LinkedIn Optimizer', icon: Linkedin, path: '/linkedin', color: 'bg-sky-500', tier: 'Profile', plan: 'Tune & Polish' },
  { name: 'GitHub Optimizer', icon: Github, path: '/github', color: 'bg-slate-900', tier: 'Profile', plan: 'Tune & Polish' },
  { name: 'Recruiter Visibility Checker', icon: Gauge, path: '/recruiter-visibility', color: 'bg-fuchsia-500', tier: 'Profile', plan: 'Tune & Polish' },
  { name: 'Resume Consistency Checker', icon: CheckCircle2, path: '/resume-consistency', color: 'bg-lime-600', tier: 'Profile', plan: 'Tune & Polish' },
  { name: 'Achievement Enhancer', icon: FileText, path: '/achievement-enhancer', color: 'bg-amber-600', tier: 'Profile', plan: 'Tune & Polish' },
  { name: 'Application Assistant', icon: FileText, path: '/cover-letter', color: 'bg-orange-500', tier: 'Profile', plan: 'Tune & Polish' },
  { name: 'Job Discovery', icon: Search, path: '/discover', color: 'bg-cyan-500', tier: 'Profile', plan: 'Tune & Polish' },

  // Zero To Hero (₹499/month)
  { name: 'Interview Prep', icon: Zap, path: '/interview', color: 'bg-purple-500', tier: 'Advanced', plan: 'Zero to Hero' },
  { name: 'Job Analytics', icon: TrendingUpIcon, path: '/jobs', color: 'bg-cyan-700', tier: 'Advanced', plan: 'Zero to Hero' },
  { name: 'Career Readiness Dashboard', icon: ListChecks, path: '/career-readiness', color: 'bg-violet-600', tier: 'Advanced', plan: 'Zero to Hero' },
  { name: 'Evidence Dashboard', icon: ListChecks, path: '/evidence', color: 'bg-indigo-700', tier: 'Advanced', plan: 'Zero to Hero' },
  { name: 'Job Fit Analysis', icon: Target, path: '/job-fit', color: 'bg-pink-600', tier: 'Advanced', plan: 'Zero to Hero' },
  { name: 'Job Description Analyzer', icon: ListChecks, path: '/job-analyzer', color: 'bg-stone-600', tier: 'Advanced', plan: 'Zero to Hero' },
];

const PLAN_TIERS = {
  'Learn & Build': 1,
  'Tune & Polish': 2,
  'Zero to Hero': 3,
};

export default function Dashboard() {
  const { user, isAuthenticated } = useAuthStore();
  const { userPlan, getUserPlan } = useSubscriptionStore();
  const [overview, setOverview] = useState(null);
  const [visibleTools, setVisibleTools] = useState([]);

  useEffect(() => {
    // Fetch user's plan on mount
    getUserPlan();
    api.get('/dashboard/overview')
      .then(({ data }) => setOverview(data))
      .catch(() => {/* keep static fallback */});
  }, []);

  useEffect(() => {
    if (userPlan) {
      const userTier = PLAN_TIERS[userPlan.name] || 0;
      const available = ALL_TOOLS.filter(tool => {
        const toolTier = PLAN_TIERS[tool.plan] || 0;
        return toolTier <= userTier;
      });
      setVisibleTools(available);
    } else {
      // Show free tools if plan not loaded yet
      const available = ALL_TOOLS.filter(tool => PLAN_TIERS[tool.plan] === 1);
      setVisibleTools(available);
    }
  }, [userPlan]);

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
           <p className="text-slate-500 mt-2 font-medium">
             Your plan: <span className="font-bold text-blue-600">{userPlan?.name || 'Loading...'}</span>
             {userPlan && <span className="text-emerald-600 ml-2">• {visibleTools.length} tools available</span>}
             {overview?.profile?.field_of_interest && (
               <span className="text-slate-400 ml-2">• Focused on {overview.profile.field_of_interest}</span>
             )}
           </p>
        </div>
        <div className="flex flex-col gap-3">
          {userPlan && (
            <div className="flex items-center gap-3 glass-card p-4 rounded-2xl">
              <Crown className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-tighter">Current Plan</p>
                <p className="text-sm font-black text-slate-900">{userPlan.name}</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-4 glass-card p-2 rounded-2xl">
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
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {[
          { label: 'Readiness Score', val: overview ? `${overview.readinessScore}/100` : '45/100', icon: Target, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Skills Verified', val: overview ? `${overview.skillScore}/100` : '60/100', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Resume Score', val: overview ? `${overview.resumeScore}/100` : '70/100', icon: Star, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Interviews Done', val: overview ? overview.interviewsCompleted || '0' : '0', icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map((stat, i) => (
          <div key={i} className="glass-card p-6 rounded-3xl flex items-center gap-5 group transition-colors">
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
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Your Tool Ecosystem ({visibleTools.length})</h3>
              <Link to="/" className="text-sm font-bold text-blue-600 flex items-center gap-1 hover:underline">
                 View Introduction <ExternalLink className="w-3 h-3" />
              </Link>
           </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {ALL_TOOLS.map((tool, i) => {
                 const isAvailable = visibleTools.some(t => t.name === tool.name);
                 return isAvailable ? (
                   <Link key={i} to={tool.path} className="group flex items-center justify-between p-6 glass-card rounded-3xl transition-all duration-300 hover:shadow-lg">
                      <div className="flex items-center gap-4">
                         <div className={`w-12 h-12 ${tool.color} rounded-xl flex items-center justify-center text-white shadow-lg`}>
                            <tool.icon className="w-6 h-6" />
                         </div>
                         <div>
                            <p className="text-[10px] font-black uppercase tracking-tighter text-slate-400">{tool.tier}</p>
                            <h4 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{tool.name}</h4>
                         </div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                   </Link>
                 ) : (
                   <div
                    key={i}
                    className="flex items-center justify-between p-6 glass-card rounded-3xl cursor-not-allowed opacity-50"
                    title={`Available in ${tool.plan} plan or higher`}
                   >
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-200 rounded-xl flex items-center justify-center text-slate-400">
                           <tool.icon className="w-6 h-6" />
                        </div>
                        <div>
                           <p className="text-[10px] font-black uppercase tracking-tighter text-slate-400 flex items-center gap-1">
                             {tool.tier} <Lock className="w-2.5 h-2.5" />
                           </p>
                           <h4 className="font-bold text-slate-400">{tool.name}</h4>
                           <p className="text-xs text-slate-400 mt-1">{tool.plan}+</p>
                        </div>
                     </div>
                     <Lock className="w-5 h-5 text-slate-300" />
                   </div>
                 );
               })}
            </div>
        </div>

        {/* Action Center & Walkthrough */}
        <div className="space-y-8">
           <h3 className="text-2xl font-black text-slate-900 tracking-tight">Priority Actions</h3>
           <div className="glass-panel border border-white/20 dark:border-white/10 rounded-[2.5rem] p-8 text-slate-900 dark:text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                 <Zap className="w-32 h-32 text-blue-400" />
              </div>
              <div className="relative z-10 space-y-6">
                 <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-400 text-xs font-bold uppercase tracking-wider">
                    Walkthrough Guide
                 </div>
                 <div className="space-y-4">
                    <div className="flex gap-4">
                       <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-black border-2 border-slate-100 dark:border-slate-900 shrink-0 relative z-20 text-white">1</div>
                       <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-snug">
                          Complete the <span className="text-slate-900 dark:text-white font-bold">Technical Assessment</span> to unlock your learning path.
                       </p>
                    </div>
                    <div className="flex gap-4">
                       <div className="w-6 h-6 rounded-full bg-slate-300 dark:bg-slate-800 flex items-center justify-center text-[10px] font-black border-2 border-slate-100 dark:border-slate-900 shrink-0 relative z-20 text-slate-600 dark:text-slate-400">2</div>
                       <p className="text-sm font-medium text-slate-600 dark:text-slate-400 leading-snug">
                          Optimize your <span className="text-slate-800 dark:text-white/60 font-bold">LinkedIn Headline</span> based on suggested keywords.
                       </p>
                    </div>
                 </div>
                 <Link to="/skills" className="flex items-center justify-center gap-2 w-full py-4 glass-card text-slate-900 rounded-2xl font-black hover:bg-white/80 transition-all active:scale-95 text-sm">
                    Continue Placement Path <ArrowRight className="w-4 h-4" />
                 </Link>
              </div>
           </div>

           {/* Activity Log */}
           <div className="glass-card rounded-3xl p-8">
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
