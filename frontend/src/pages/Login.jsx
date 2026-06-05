import React, { useState } from 'react';
import useAuthStore from '../store/useAuthStore';
import { Navigate, Link } from 'react-router-dom';
import { 
  Briefcase, 
  ArrowRight, 
  ShieldCheck, 
  Activity, 
  Layout as LayoutIcon, 
  Sparkles,
  Mail,
  Lock,
  Github
} from 'lucide-react';

export default function Login() {
  const { login, signup, user, isAuthenticated, isLoading, error } = useAuthStore();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ email: '', password: '', github_username: '' });
  const [localError, setLocalError] = useState('');

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    try {
      if (isLogin) {
        await login({ email: formData.email, password: formData.password });
      } else {
        await signup(formData);
      }
    } catch (err) {
      setLocalError('Authentication failed. Please verify your credentials.');
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto py-8 px-4 sm:px-6 flex items-center justify-center min-h-[calc(100vh-100px)]">
      <div className="w-full flex flex-col lg:flex-row glass-card rounded-[3rem] overflow-hidden shadow-2xl border border-outline/10">
      {/* Left Side: Visual/Walkthrough Reinforcement */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-center px-12 lg:px-16 overflow-hidden bg-gradient-to-br from-blue-900/80 to-indigo-900/80 border-r border-outline/10">
         <div className="absolute inset-0">
            <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-600/20 blur-[130px] rounded-full"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-600/20 blur-[130px] rounded-full"></div>
         </div>
         
         <div className="relative z-10 space-y-12">
            <Link to="/" className="inline-flex items-center gap-2 mb-8 group">
               <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center group-hover:rotate-12 transition-transform shadow-lg shadow-blue-500/30">
                  <Briefcase className="w-6 h-6 text-white" />
               </div>
               <span className="text-2xl font-black text-white tracking-tighter">JobTune</span>
            </Link>

            <div className="space-y-4">
               <h2 className="text-5xl font-extrabold text-white leading-tight">
                  Your journey to <br />
                  <span className="text-blue-400">FAANG</span> begins here.
               </h2>
               <p className="text-xl text-slate-400 font-light max-w-md">
                   Join 50,000+ students already utilizing our 7-tool ecosystem to land their dream placements.
               </p>
            </div>

            <div className="grid grid-cols-1 gap-6 pt-8">
               {[
                 { title: "Personalized Skill Gap Analysis", icon: Activity },
                 { title: "ATS-Grade Resume Optimization", icon: LayoutIcon },
                 { title: "Curated Industry Learning Paths", icon: Sparkles }
               ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4 bg-white/5 border border-white/10 p-4 rounded-xl backdrop-blur-sm">
                     <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                        <item.icon className="w-5 h-5" />
                     </div>
                     <p className="text-slate-300 font-medium">{item.title}</p>
                  </div>
               ))}
            </div>
         </div>

         {/* Decorative Badge */}
         <div className="absolute bottom-12 left-16 flex items-center gap-2 text-slate-500 text-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            End-to-end Encrypted Preparation
         </div>
      </div>

      {/* Right Side: Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 md:p-16 relative bg-surface-container-lowest/30 backdrop-blur-xl">
         <div className="max-w-md w-full space-y-8 animate-in fade-in slide-in-from-right duration-500">
            <div className="text-center lg:text-left space-y-2">
               <h3 className="text-3xl font-black text-on-surface font-headline tracking-tight">
                  {isLogin ? 'Welcome Back!' : 'Create your Account'}
               </h3>
               <p className="text-on-surface-variant font-medium">
                  {isLogin ? 'Pick up where you left off.' : 'Start your professional journey today.'}
               </p>
            </div>

            {(error || localError) && (
               <div className="glass-card border-rose-200/50 p-4 rounded-xl text-rose-600 font-bold text-sm flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                  {error || localError}
               </div>
            )}

            <form className="space-y-5" onSubmit={handleSubmit}>
               <div className="space-y-4">
                  <div className="relative group">
                     <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                     <input
                        type="email"
                        required
                        placeholder="Email Address"
                        className="w-full pl-12 pr-4 py-4 bg-surface-container/50 border border-outline/20 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-on-surface placeholder:text-outline font-medium"
                        value={formData.email}
                        onChange={e => setFormData({...formData, email: e.target.value})}
                     />
                  </div>
                  <div className="relative group">
                     <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                     <input
                        type="password"
                        required
                        placeholder="Password"
                        className="w-full pl-12 pr-4 py-4 bg-surface-container/50 border border-outline/20 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-on-surface placeholder:text-outline font-medium"
                        value={formData.password}
                        onChange={e => setFormData({...formData, password: e.target.value})}
                     />
                  </div>
                  {!isLogin && (
                    <div className="relative group">
                       <Github className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                       <input
                          type="text"
                          placeholder="GitHub Username"
                          className="w-full pl-12 pr-4 py-4 bg-surface-container/50 border border-outline/20 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-on-surface placeholder:text-outline font-medium"
                          value={formData.github_username}
                          onChange={e => setFormData({...formData, github_username: e.target.value})}
                       />
                    </div>
                  )}
               </div>

               <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
               >
                  {isLoading ? 'Authenticating...' : (isLogin ? 'Sign In' : 'Create Account')}
                  <ArrowRight className="w-5 h-5" />
               </button>
            </form>

            <div className="relative">
               <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-outline/10"></div>
               </div>
               <div className="relative flex justify-center text-sm">
                  <span className="px-4 py-1 glass-panel rounded-full text-outline font-bold">New to the Ecosystem?</span>
               </div>
            </div>

            <button
               onClick={() => setIsLogin(!isLogin)}
               className="w-full py-4 glass-card border-outline/20 rounded-2xl font-bold text-on-surface hover:bg-white/40 transition-all active:scale-95"
            >
               {isLogin ? 'Create an Account' : 'Return to Login'}
            </button>

            <p className="text-center text-xs text-on-surface-variant font-medium px-8">
               By joining, you agree to our Terms of Service and Professional Conduct Guidelines.
            </p>
         </div>
      </div>
      </div>
    </div>
  );
}
