import { useState, useEffect } from 'react';
import { api } from '../store/useAuthStore';
import useAuthStore from '../store/useAuthStore';

const DEFAULT_STATS = {
  daysActive: 0,
  toolsUsed: 0,
  totalActivities: 0,
  currentStreak: 0,
  longestStreak: 0,
  dailyGoal: 30,
  dailyGoalProgress: 0,
};

/**
 * Fetches all dashboard data in parallel using Promise.allSettled.
 *
 * Returns `{ overview, heatmapData, weeklyData, stats, achievements, isLoading, error }`.
 * Each field falls back to a sensible default if its request fails.
 *
 * After a successful load, fires a background check-achievements call
 * so the backend can unlock any newly earned achievements.
 */
export function useDashboardData() {
  const { isAuthenticated } = useAuthStore();
  const [data, setData] = useState({
    overview: null,
    heatmapData: [],
    weeklyData: [],
    stats: DEFAULT_STATS,
    achievements: [],
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    if (!isAuthenticated) {
      setData(prev => ({ ...prev, isLoading: false }));
      return;
    }

    let cancelled = false;

    async function fetchAll() {
      const results = await Promise.allSettled([
        api.get('/dashboard/overview'),
        api.get('/activity/heatmap?months=12'),
        api.get('/activity/weekly'),
        api.get('/activity/stats'),
        api.get('/activity/achievements'),
      ]);

      if (cancelled) return;

      setData({
        overview: results[0].status === 'fulfilled' ? results[0].value.data : null,
        heatmapData: results[1].status === 'fulfilled' ? results[1].value.data.data : [],
        weeklyData: results[2].status === 'fulfilled' ? results[2].value.data.data : [],
        stats: results[3].status === 'fulfilled' ? results[3].value.data.data : DEFAULT_STATS,
        achievements: results[4].status === 'fulfilled' ? results[4].value.data.data : [],
        isLoading: false,
        error: null,
      });

      // Fire-and-forget: check for new achievements
      api.post('/activity/check-achievements').catch(() => {});
    }

    fetchAll().catch(() => {
      if (!cancelled) {
        setData(prev => ({ ...prev, isLoading: false, error: 'Failed to load dashboard data' }));
      }
    });

    return () => { cancelled = true; };
  }, [isAuthenticated]);

  return data;
}
