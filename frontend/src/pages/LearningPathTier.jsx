import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader, Flame, CheckCircle2, Circle, ChevronLeft, AlertCircle, ChevronRight } from 'lucide-react';
import { api } from '../store/useAuthStore';

const TIERS = [
  { key: 'Beginner', label: 'Beginner' },
  { key: 'Intermediate', label: 'Intermediate' },
  { key: 'Job_Tune', label: 'Job Tune' },
];

export default function LearningPathTier() {
  const { subject } = useParams();
  const navigate = useNavigate();

  const [activeTier, setActiveTier] = useState('Beginner');
  const [topicsByTier, setTopicsByTier] = useState({});
  const [loadingTiers, setLoadingTiers] = useState({});
  const [tierErrors, setTierErrors] = useState({});

  const [streak, setStreak] = useState(null);
  const [streakLoading, setStreakLoading] = useState(true);

  // Fetch streak once per subject
  useEffect(() => {
    let cancelled = false;
    setStreakLoading(true);
    api.get(`/learning-path/${encodeURIComponent(subject)}/streak`)
      .then(({ data }) => {
        if (!cancelled) setStreak(data);
      })
      .catch(() => {
        if (!cancelled) setStreak(null);
      })
      .finally(() => {
        if (!cancelled) setStreakLoading(false);
      });
    return () => { cancelled = true; };
  }, [subject]);

  // Load all three tiers' topic lists so progress fractions can render on every tab.
  // Each tier's request is tracked and guarded independently so one slow/failed
  // tier can't clobber the loading/error state of the others, and stale
  // responses from a previous subject can't overwrite the current one.
  useEffect(() => {
    let cancelled = false;
    setTopicsByTier({});
    setLoadingTiers(Object.fromEntries(TIERS.map((t) => [t.key, true])));
    setTierErrors({});
    setActiveTier('Beginner');

    TIERS.forEach((tier) => {
      api.get(`/learning-path/${encodeURIComponent(subject)}/${tier.key}`)
        .then(({ data }) => {
          if (cancelled) return;
          setTopicsByTier((prev) => ({ ...prev, [tier.key]: data?.topics || [] }));
        })
        .catch((err) => {
          if (cancelled) return;
          setTierErrors((prev) => ({
            ...prev,
            [tier.key]: err.response?.data?.error || `Failed to load ${tier.key} topics`,
          }));
        })
        .finally(() => {
          if (cancelled) return;
          setLoadingTiers((prev) => ({ ...prev, [tier.key]: false }));
        });
    });

    return () => { cancelled = true; };
  }, [subject]);

  const currentTopics = topicsByTier[activeTier];
  const loadingTier = loadingTiers[activeTier] ?? false;
  const tierError = tierErrors[activeTier] || '';

  const progressFor = (tierKey) => {
    const topics = topicsByTier[tierKey];
    if (!topics) return null;
    const done = topics.filter((t) => t.completed).length;
    return { done, total: topics.length };
  };

  return (
    <div className="w-full py-10 px-4">
      <div className="max-w-5xl mx-auto">
        <Link
          to="/learning-path"
          className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors mb-6"
        >
          <ChevronLeft className="w-4 h-4" /> All subjects
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            {subject}
          </h1>

          {/* Streak badge */}
          <div className="glass-card rounded-2xl px-5 py-3 flex items-center gap-4 border border-white/50 dark:border-slate-700/50">
            {streakLoading ? (
              <Loader className="w-5 h-5 text-orange-500 animate-spin" />
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Flame className="w-6 h-6 text-orange-500" />
                  <div>
                    <div className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                      {streak?.currentStreak ?? 0} day{(streak?.currentStreak ?? 0) === 1 ? '' : 's'}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">current streak</div>
                  </div>
                </div>
                <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />
                <div>
                  <div className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                    {streak?.longestStreak ?? 0}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">longest streak</div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tier tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {TIERS.map((tier) => {
            const progress = progressFor(tier.key);
            const isActive = activeTier === tier.key;
            const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
            return (
              <button
                key={tier.key}
                onClick={() => setActiveTier(tier.key)}
                className={`text-left rounded-2xl p-5 border transition-all duration-200 ${
                  isActive
                    ? 'border-blue-400 dark:border-blue-600 bg-blue-50/80 dark:bg-blue-900/20 shadow-lg'
                    : 'border-white/50 dark:border-slate-700/50 glass-card hover:-translate-y-0.5 hover:shadow-md'
                }`}
              >
                <div className={`text-sm font-bold uppercase tracking-wider mb-1 ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {tier.label}
                </div>
                {progress ? (
                  <>
                    <div className="text-xl font-black text-slate-900 dark:text-white mb-2">
                      {progress.done}/{progress.total} <span className="text-sm font-medium text-slate-500 dark:text-slate-400">complete</span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Loader className="w-4 h-4 animate-spin" /> Loading…
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Topic list */}
        {loadingTier && !currentTopics ? (
          <div className="w-full py-20 flex items-center justify-center">
            <div className="text-center">
              <Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400 font-medium">Loading topics…</p>
            </div>
          </div>
        ) : tierError && !currentTopics ? (
          <div className="glass-card rounded-3xl p-8 text-center max-w-lg mx-auto">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Couldn't load topics</h2>
            <p className="text-slate-600 dark:text-slate-400">{tierError}</p>
          </div>
        ) : currentTopics && currentTopics.length === 0 ? (
          <div className="glass-card rounded-3xl p-8 text-center max-w-lg mx-auto">
            <p className="text-slate-600 dark:text-slate-400">No topics available in this tier yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {currentTopics?.map((topic) => (
              <button
                key={topic.id ?? topic.slug}
                onClick={() => navigate(`/learning-path/${encodeURIComponent(subject)}/${activeTier}/${encodeURIComponent(topic.slug)}`)}
                className="group glass-card rounded-2xl p-5 border border-white/50 dark:border-slate-700/50 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex items-center gap-4 text-left"
              >
                <div className="flex-shrink-0">
                  {topic.completed ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  ) : (
                    <Circle className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">
                    Topic {topic.order}
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-white truncate">
                    {topic.title}
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
