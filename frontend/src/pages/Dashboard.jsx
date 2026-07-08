import React from 'react';
import useAuthStore from '../store/useAuthStore';
import useSubscriptionStore from '../store/useSubscriptionStore';
import { Navigate, Link } from 'react-router-dom';
import {
  Flame,
  Zap,
  Calendar,
  Wrench,
  Clock,
  Crown,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import { useActivityTracker } from '../hooks/useActivityTracker';
import { LEARNING_JOURNEY_STEPS, ACHIEVEMENT_DEFINITIONS } from '../config/learningJourney';
import ActivityHeatmap from '../components/dashboard/ActivityHeatmap';
import LearningJourneyStepper from '../components/dashboard/LearningJourneyStepper';
import WeeklyActivityChart from '../components/dashboard/WeeklyActivityChart';
import AchievementBadges from '../components/dashboard/AchievementBadges';
import ProgressOverviewCards from '../components/dashboard/ProgressOverviewCards';
import TrackProgressPanel from '../components/dashboard/TrackProgressPanel';

function DailyGoalBar({ progress }) {
  const clamped = Math.min(100, Math.max(0, progress));
  return (
    <div className="flex items-center gap-3 w-full max-w-xs">
      <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-500 transition-all duration-700"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">
        {clamped}%
      </span>
    </div>
  );
}

function QuickStatCard({ icon: Icon, label, value, color, bg }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${bg} ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider leading-none">{label}</p>
        <p className="text-lg font-extrabold text-slate-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}

function RecentActivityFeed({ activities }) {
  const items = activities?.length > 0 ? activities : [
    { id: 1, action: 'Welcome to JobTune!', date: 'Just now' },
  ];

  return (
    <div className="card rounded-2xl p-6 h-full">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">Recent Activity</h3>
        <Clock className="w-4 h-4 text-slate-400" />
      </div>
      <div className="space-y-4">
        {items.slice(0, 6).map((act, i) => (
          <div key={act.id ?? i} className="flex gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200 leading-snug">{act.action}</p>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">{act.date}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, isAuthenticated } = useAuthStore();
  const { userPlan, getUserPlan } = useSubscriptionStore();
  const { overview, heatmapData, weeklyData, stats, achievements, isLoading } = useDashboardData();

  useActivityTracker('Dashboard');

  React.useEffect(() => { getUserPlan(); }, []);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const completionStatus = overview?.completionStatus || {};
  const completedSteps = LEARNING_JOURNEY_STEPS.filter(s => completionStatus[s.completionKey]).length;

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 font-medium">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <div className="flex items-center gap-2 text-blue-600 font-bold text-sm uppercase tracking-widest mb-1">
            <Zap className="w-4 h-4 fill-current" /> Student Dashboard
          </div>
          <h1 className="page-title">
            Hello, {user?.email?.split('@')[0] || 'Student'}!
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium text-sm">
            Your plan: <span className="font-bold text-blue-600">{userPlan?.name || 'Loading...'}</span>
            <span className="text-slate-400 mx-2">|</span>
            <span className="text-emerald-600 font-bold">{completedSteps}/8 steps completed</span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Streak Badge */}
          <div className="flex items-center gap-3 card px-5 py-3 rounded-2xl">
            <Flame className="w-6 h-6 text-orange-500" />
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider leading-none">Streak</p>
              <p className="text-xl font-extrabold text-slate-900 dark:text-white leading-none">
                {stats.currentStreak} <span className="text-xs font-bold text-slate-400">days</span>
              </p>
            </div>
          </div>

          {/* Daily Goal */}
          <div className="flex flex-col gap-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider leading-none">Daily Goal</p>
            <DailyGoalBar progress={stats.dailyGoalProgress || 0} />
          </div>

          {/* Plan Badge */}
          {userPlan && (
            <div className="flex items-center gap-2 card px-4 py-3 rounded-2xl">
              <Crown className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-extrabold text-slate-900 dark:text-white">{userPlan.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Quick Stats ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <QuickStatCard icon={Calendar} label="Days Active" value={stats.daysActive || 0} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-950/50" />
        <QuickStatCard icon={Wrench} label="Tools Used" value={stats.toolsUsed || 0} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-950/50" />
        <QuickStatCard icon={TrendingUp} label="Readiness" value={`${overview?.readinessScore || 0}/100`} color="text-violet-600" bg="bg-violet-50 dark:bg-violet-950/50" />
        <QuickStatCard icon={Flame} label="Best Streak" value={`${stats.longestStreak || 0} days`} color="text-orange-600" bg="bg-orange-50 dark:bg-orange-950/50" />
      </div>

      {/* ─── Activity Heatmap ─── */}
      <ActivityHeatmap data={heatmapData} />

      {/* ─── Progress Overview Cards ─── */}
      <ProgressOverviewCards overview={overview} />

      {/* ─── Learning Journey Stepper ─── */}
      <div className="card rounded-2xl p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">Your Learning Journey</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Follow the path from beginner to job-ready
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-600 text-xs font-bold">
            {completedSteps}/{LEARNING_JOURNEY_STEPS.length} Complete
          </div>
        </div>
        <LearningJourneyStepper
          steps={LEARNING_JOURNEY_STEPS}
          completionStatus={completionStatus}
          userPlan={userPlan?.name || ''}
        />
      </div>

      {/* ─── Weekly Chart + Activity Feed + Track Progress ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <TrackProgressPanel />
        </div>
        <div className="lg:col-span-1">
          <WeeklyActivityChart data={weeklyData} />
        </div>
        <div className="lg:col-span-1">
          <RecentActivityFeed activities={overview?.recentActivity} />
        </div>
      </div>

      {/* ─── Achievements ─── */}
      <AchievementBadges
        unlockedAchievements={achievements}
        definitions={ACHIEVEMENT_DEFINITIONS}
      />

      {/* ─── Quick Access: Next Step CTA ─── */}
      {(() => {
        const nextStep = LEARNING_JOURNEY_STEPS.find(s => !completionStatus[s.completionKey]);
        if (!nextStep) return null;
        return (
          <div className="card rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-1">Next Step</p>
              <p className="text-lg font-extrabold text-slate-900 dark:text-white">{nextStep.title}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{nextStep.description}</p>
            </div>
            <Link
              to={nextStep.route}
              className="btn-primary shrink-0"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        );
      })()}
    </div>
  );
}
