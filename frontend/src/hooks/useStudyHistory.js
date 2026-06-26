import { useState, useEffect, useCallback } from 'react';
import { api } from '../store/useAuthStore';
import useAuthStore from '../store/useAuthStore';

export function useStudyHistory(sessionType = null) {
  const { isAuthenticated } = useAuthStore();
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const params = sessionType ? `?type=${sessionType}&limit=20` : '?limit=20';
      const [histRes, statsRes] = await Promise.allSettled([
        api.get(`/study-history/history${params}`),
        api.get('/study-history/stats'),
      ]);
      if (histRes.status === 'fulfilled') setHistory(histRes.value.data.data || []);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data.data || []);
    } catch (err) {
      console.warn('Failed to fetch study history:', err.message);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, sessionType]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const saveSession = useCallback(async (sessionData) => {
    if (!isAuthenticated) return;
    try {
      await api.post('/study-history/history', sessionData);
      fetchHistory();
    } catch (err) {
      console.warn('Failed to save study session:', err.message);
    }
  }, [isAuthenticated, fetchHistory]);

  return { history, stats, isLoading, saveSession, refetch: fetchHistory };
}
