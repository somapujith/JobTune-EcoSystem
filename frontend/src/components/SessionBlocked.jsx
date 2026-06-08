import { Link } from 'react-router-dom';
import { MonitorOff, LogIn } from 'lucide-react';
import useAuthStore from '../store/useAuthStore';

export default function SessionBlocked() {
  const { sessionBlockedMessage, clearSessionBlocked, logout } = useAuthStore();

  const handleSignInAgain = async () => {
    clearSessionBlocked();
    await logout();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 p-6">
      <div className="max-w-md w-full text-center glass-card rounded-3xl p-10 border border-rose-200/50 dark:border-rose-900/40">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-rose-100 dark:bg-rose-900/30 mb-6">
          <MonitorOff className="w-10 h-10 text-rose-600 dark:text-rose-400" />
        </div>

        <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-3">
          Session ended
        </h1>

        <p className="text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
          {sessionBlockedMessage ||
            'This account is only allowed on one device at a time. It was signed in elsewhere, so this session was closed.'}
        </p>

        <p className="text-sm text-slate-500 mb-8">
          To prevent account sharing, JobTune allows a single active session per user.
        </p>

        <button
          onClick={handleSignInAgain}
          className="w-full py-3.5 px-6 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 mb-3"
        >
          <LogIn className="w-5 h-5" />
          Sign in on this device
        </button>

        <Link
          to="/"
          className="block text-sm font-semibold text-slate-500 hover:text-blue-600 transition-colors"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
