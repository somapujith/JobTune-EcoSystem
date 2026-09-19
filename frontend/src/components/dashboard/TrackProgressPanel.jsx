import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wrench, Target, Zap, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '../../store/useAuthStore';
import useSubscriptionStore from '../../store/useSubscriptionStore';

const TRACK_META = {
  'learn-and-build': {
    label: 'Learn & Build',
    icon: Wrench,
    color: 'text-orange-600',
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    border: 'border-orange-200 dark:border-orange-800/50',
    link: '/preparation/learn-and-build',
    minPlan: 'Learn & Build',
  },
  'tune-and-polish': {
    label: 'Tune & Polish',
    icon: Target,
    color: 'text-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800/50',
    link: '/preparation/tune-and-polish',
    minPlan: 'Tune & Polish',
  },
  'zero-to-hero': {
    label: 'Zero to Hero',
    icon: Zap,
    color: 'text-purple-600',
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    border: 'border-purple-200 dark:border-purple-800/50',
    link: '/preparation/zero-to-hero',
    minPlan: 'Zero to Hero',
  },
};

const PLAN_TIER = {
  'Learn & Build': 1,
  'Tune & Polish': 2,
  'Zero to Hero': 3,
};

function computeProgress(key, data) {
  if (!data) return { pct: 0, detail: 'Not started' };

  if (key === 'learn-and-build') {
    const checked = Object.values(data.skillsChecked || {}).filter(Boolean).length;
    const total = 28; // 4 paths × 7 skills each
    const pct = Math.round((checked / total) * 100);
    return { pct, detail: `${checked} skills learned` };
  }

  if (key === 'tune-and-polish') {
    const checked = Object.values(data.checkedItems || {}).filter(Boolean).length;
    const total = 16; // 4 categories × 4 items each
    const pct = Math.round((checked / total) * 100);
    return { pct, detail: `${checked}/16 readiness items done` };
  }

  if (key === 'zero-to-hero') {
    const modules = data.modules || {};
    const total = Object.keys(modules).length;
    const completed = Object.values(modules).filter(m => m.status === 'completed').length;
    const step = data.step || 'intro';
    if (total === 0) {
      if (step === 'plan' || step === 'learning' || step === 'assessment') {
        return { pct: 10, detail: 'Interview done, plan created' };
      }
      if (step === 'interview') return { pct: 5, detail: 'Interview in progress' };
      return { pct: 0, detail: 'Not started' };
    }
    const pct = Math.round((completed / total) * 100);
    return { pct, detail: `${completed}/${total} modules complete` };
  }

  return { pct: 0, detail: 'Not started' };
}

export default function TrackProgressPanel() {
  const { userPlan } = useSubscriptionStore();
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);

  const planTier = PLAN_TIER[userPlan?.name] || 0;

  useEffect(() => {
    const keys = ['learn-and-build', 'tune-and-polish', 'zero-to-hero'];
    Promise.allSettled(keys.map(k => api.get(`/progress/${k}`))).then(results => {
      const map = {};
      results.forEach((r, i) => {
        map[keys[i]] = r.status === 'fulfilled' ? r.value.data?.data : null;
      });
      setProgress(map);
      setLoading(false);
    });
  }, []);

  return (
    <div className="card rounded-2xl p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">Track Progress</h3>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
      </div>

      <div className="space-y-4">
        {Object.entries(TRACK_META).map(([key, meta]) => {
          const { pct, detail } = computeProgress(key, progress[key]);
          const tier = PLAN_TIER[meta.minPlan];
          const hasAccess = planTier >= tier;

          return (
            <div
              key={key}
              className={`flex items-center gap-4 p-4 rounded-xl border ${meta.border} ${
                hasAccess ? '' : 'opacity-50'
              }`}
            >
              <div className={`p-2.5 rounded-xl ${meta.bg} shrink-0`}>
                <meta.icon className={`w-5 h-5 ${meta.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-bold text-sm text-slate-900 dark:text-white">{meta.label}</p>
                  <span className={`text-xs font-bold ${pct === 100 ? 'text-emerald-600' : meta.color}`}>
                    {pct}%
                  </span>
                </div>
                <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-1">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      pct === 100
                        ? 'bg-emerald-500'
                        : key === 'learn-and-build'
                          ? 'bg-orange-400'
                          : key === 'tune-and-polish'
                            ? 'bg-blue-500'
                            : 'bg-purple-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{detail}</p>
              </div>
              {hasAccess ? (
                <Link to={meta.link} className="shrink-0">
                  <ArrowRight className={`w-4 h-4 ${meta.color}`} />
                </Link>
              ) : (
                <span className="text-xs font-semibold text-slate-400 shrink-0">Locked</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
        <Link
          to="/preparation"
          className="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          View all tracks <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
