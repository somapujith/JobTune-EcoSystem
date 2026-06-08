import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../store/useAuthStore';
import useAuthStore from '../store/useAuthStore';

/**
 * Loads and persists per-user progress to the database (cross-device sync).
 */
export function useUserProgress(contextKey, defaultData = {}) {
  const { isAuthenticated } = useAuthStore();
  const [data, setData] = useState(defaultData);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const saveTimer = useRef(null);
  const pendingRef = useRef(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false);
      setIsReady(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setIsReady(false);
    setError(null);

    api.get(`/progress/${contextKey}`)
      .then(({ data: res }) => {
        if (cancelled) return;
        const stored = res?.data && Object.keys(res.data).length > 0 ? res.data : defaultData;
        setData(stored);
        setIsReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(`Failed to load progress (${contextKey}):`, err);
        setData(defaultData);
        setIsReady(true);
        setError('Could not load your saved progress.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contextKey, isAuthenticated]);

  const flushSave = useCallback(async (payload) => {
    if (!isAuthenticated || !isReady) return;
    setIsSaving(true);
    try {
      await api.put(`/progress/${contextKey}`, { data: payload });
      setError(null);
    } catch (err) {
      console.error(`Failed to save progress (${contextKey}):`, err);
      setError('Failed to save progress. Changes will retry on next edit.');
    } finally {
      setIsSaving(false);
    }
  }, [contextKey, isAuthenticated, isReady]);

  const scheduleSave = useCallback((payload) => {
    pendingRef.current = payload;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (pendingRef.current) {
        flushSave(pendingRef.current);
        pendingRef.current = null;
      }
    }, 700);
  }, [flushSave]);

  const updateProgress = useCallback((updater) => {
    setData((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const replaceProgress = useCallback((next) => {
    setData(next);
    scheduleSave(next);
  }, [scheduleSave]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  return {
    data,
    setData: replaceProgress,
    updateProgress,
    isLoading,
    isSaving,
    error,
    isReady: !isLoading && isReady,
  };
}
