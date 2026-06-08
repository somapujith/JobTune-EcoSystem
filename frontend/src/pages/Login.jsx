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
  Github,
  Monitor,
  AlertTriangle,
} from 'lucide-react';

export default function Login() {
  const { login, signup, isAuthenticated, isLoading, error, accountInUse, clearAccountInUse } = useAuthStore();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ email: '', password: '', github_username: '' });
  const [localError, setLocalError] = useState('');

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const redirectAfterAuth = () => {
    setTimeout(() => {
      window.location.href = '/onboarding';
    }, 500);
  };

  const handleSubmit = async (e, replaceDevice = false) => {
    e.preventDefault();
    setLocalError('');
    clearAccountInUse();
    try {
      if (isLogin) {
        await login(
          { email: formData.email, password: formData.password },
          { replaceDevice }
        );
        redirectAfterAuth();
      } else {
        await signup(formData);
        redirectAfterAuth();
      }
    } catch (err) {
      if (err.code === 'ACCOUNT_IN_USE') return;
      setLocalError('Authentication failed. Please verify your credentials.');
    }
  };

  const handleReplaceDevice = (e) => {
    handleSubmit(e, true);
  };

  return (
    <div className="w-full min-h-screen flex flex-col lg:flex-row bg-white dark:bg-slate-950">
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-center px-12 lg:px-24 overflow-hidden bg-gradient-to-br from-[#4b5a96] to-[#3a477a] dark:from-blue-900 dark:to-indigo-950">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-400/20 blur-[100px] rounded-full mix-blend-overlay" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-400/20 blur-[100px] rounded-full mix-blend-overlay" />
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
              <span className="text-[#8bb4f7]">FAANG</span> begins here.
            </h2>
            <p className="text-xl text-slate-400 font-light max-w-md">
              One account, one active device — built to keep your preparation personal and secure.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 pt-8">
            {[
              { title: 'Personalized Skill Gap Analysis', icon: Activity },
              { title: 'ATS-Grade Resume Optimization', icon: LayoutIcon },
              { title: 'Curated Industry Learning Paths', icon: Sparkles },
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

        <div className="absolute bottom-12 left-16 flex items-center gap-2 text-slate-500 text-sm">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          Single-device session protection
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 md:p-24 relative bg-white dark:bg-slate-900">
        <div className="max-w-md w-full space-y-8 animate-in fade-in slide-in-from-right duration-500">
          <div className="text-center lg:text-left space-y-2">
            <h3 className="text-4xl font-black text-slate-900 dark:text-white font-headline tracking-tight">
              {isLogin ? 'Welcome Back!' : 'Create your Account'}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 font-medium">
              {isLogin ? 'Pick up where you left off.' : 'Start your professional journey today.'}
            </p>
          </div>

          {accountInUse && (
            <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-5 space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">Account already in use</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                    This account is active on another device. Sign-in from a second computer or IP is blocked to prevent account sharing.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/80 dark:bg-slate-800/80 text-sm">
                <Monitor className="w-5 h-5 text-slate-500 shrink-0" />
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    {accountInUse.deviceName || 'Another device'}
                  </p>
                  {accountInUse.ipAddress && (
                    <p className="text-slate-500 text-xs mt-0.5">IP: {accountInUse.ipAddress}</p>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-500">
                If this is your device and you want to switch here, use the button below. The other session will be signed out immediately.
              </p>
              <button
                type="button"
                onClick={handleReplaceDevice}
                disabled={isLoading}
                className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Switching device…' : 'Use this device instead'}
              </button>
              <button
                type="button"
                onClick={clearAccountInUse}
                className="w-full text-sm font-semibold text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          )}

          {(error || localError) && !accountInUse && (
            <div className="glass-card border-rose-200/50 p-4 rounded-xl text-rose-600 font-bold text-sm flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-rose-500" />
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
                  className="w-full pl-12 pr-4 py-4 bg-[#f4f7fc] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#4255f4]/50 focus:border-[#4255f4] transition-all text-slate-900 dark:text-white placeholder:text-slate-400 font-medium"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input
                  type="password"
                  required
                  placeholder="Password"
                  className="w-full pl-12 pr-4 py-4 bg-[#f4f7fc] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#4255f4]/50 focus:border-[#4255f4] transition-all text-slate-900 dark:text-white placeholder:text-slate-400 font-medium"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
              {!isLogin && (
                <div className="relative group">
                  <Github className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                  <input
                    type="text"
                    placeholder="GitHub Username"
                    className="w-full pl-12 pr-4 py-4 bg-[#f4f7fc] dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#4255f4]/50 focus:border-[#4255f4] transition-all text-slate-900 dark:text-white placeholder:text-slate-400 font-medium"
                    value={formData.github_username}
                    onChange={(e) => setFormData({ ...formData, github_username: e.target.value })}
                  />
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || !!accountInUse}
              className="w-full bg-[#4255f4] hover:bg-[#3244d6] text-white font-black py-4 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
            >
              {isLoading ? 'Authenticating...' : isLogin ? 'Sign In' : 'Create Account'}
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-outline/10" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 py-1 bg-white dark:bg-slate-900 rounded-full text-slate-400 dark:text-slate-500 text-xs font-bold">
                New to the Ecosystem?
              </span>
            </div>
          </div>

          <button
            onClick={() => setIsLogin(!isLogin)}
            className="w-full py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95 shadow-sm"
          >
            {isLogin ? 'Create an Account' : 'Return to Login'}
          </button>

          <p className="text-center text-xs text-on-surface-variant font-medium px-8">
            By joining, you agree to our Terms of Service and single-device session policy.
          </p>
        </div>
      </div>
    </div>
  );
}
