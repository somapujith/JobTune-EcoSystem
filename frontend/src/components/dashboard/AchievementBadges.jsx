import { Footprints, FileText, Activity, Zap, Flame, Crown, GraduationCap, Compass, Rocket, Code2, BadgeCheck, Lock } from 'lucide-react';

const ICON_MAP = { Footprints, FileText, Activity, Zap, Flame, Crown, GraduationCap, Compass, Rocket, Code2, BadgeCheck };

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function UnlockedBadge({ definition, unlockedAt }) {
  const IconComponent = ICON_MAP[definition.icon] || BadgeCheck;
  const borderColor = definition.color || 'border-blue-500';

  return (
    <div className={`glass-card rounded-2xl p-4 border-l-4 ${borderColor}`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${definition.bgColor || 'bg-blue-100 dark:bg-blue-900/40'}`}>
          <IconComponent size={20} className={definition.iconColor || 'text-blue-500'} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-white">{definition.title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{definition.description}</p>
          <p className="text-xs text-emerald-500 dark:text-emerald-400 mt-1 font-medium">
            Unlocked {formatDate(unlockedAt)}
          </p>
        </div>
      </div>
    </div>
  );
}

function LockedBadge({ definition }) {
  const IconComponent = ICON_MAP[definition.icon] || BadgeCheck;

  return (
    <div className="glass-card rounded-2xl p-4 opacity-60 grayscale relative">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-slate-200 dark:bg-slate-700 relative">
          <IconComponent size={20} className="text-slate-400 dark:text-slate-500" />
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-slate-300 dark:bg-slate-600 flex items-center justify-center">
            <Lock size={8} className="text-slate-500 dark:text-slate-400" />
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{definition.title}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{definition.description}</p>
        </div>
      </div>
    </div>
  );
}

export default function AchievementBadges({ unlockedAchievements = [], definitions = [] }) {
  const unlockedMap = {};
  unlockedAchievements.forEach(a => {
    unlockedMap[a.key] = a.unlockedAt;
  });

  const unlockedCount = definitions.filter(d => unlockedMap[d.key]).length;

  if (definitions.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-6">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Achievements</h3>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-2">No achievements available yet.</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Achievements</h3>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {unlockedCount}/{definitions.length} Unlocked
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {definitions.map(def => {
          const isUnlocked = !!unlockedMap[def.key];
          return isUnlocked ? (
            <UnlockedBadge
              key={def.key}
              definition={def}
              unlockedAt={unlockedMap[def.key]}
            />
          ) : (
            <LockedBadge key={def.key} definition={def} />
          );
        })}
      </div>
    </div>
  );
}
