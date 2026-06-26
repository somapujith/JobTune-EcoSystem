import { useEffect, useRef, useCallback } from 'react';
import { api } from '../store/useAuthStore';
import useAuthStore from '../store/useAuthStore';

/**
 * Tracks user activity for the student engagement dashboard.
 *
 * Automatically records a page_visit on mount (once, StrictMode-safe).
 * Exposes `trackActivity(type, metadata)` for manual event tracking
 * with a 2-second debounce per event key.
 *
 * All tracking calls are fire-and-forget — errors are silently swallowed.
 */
export function useActivityTracker(toolName) {
  const { isAuthenticated } = useAuthStore();
  const hasFired = useRef(false);
  const recentEvents = useRef(new Set());

  useEffect(() => {
    if (!isAuthenticated || !toolName || hasFired.current) return;
    hasFired.current = true;
    api.post('/activity/track', { toolName, activityType: 'page_visit' }).catch(() => {});
  }, [isAuthenticated, toolName]);

  const trackActivity = useCallback((activityType, metadata = {}) => {
    if (!isAuthenticated || !toolName) return;
    const eventKey = `${toolName}:${activityType}`;
    if (recentEvents.current.has(eventKey)) return;
    recentEvents.current.add(eventKey);
    setTimeout(() => recentEvents.current.delete(eventKey), 2000);
    api.post('/activity/track', { toolName, activityType, metadata }).catch(() => {});
  }, [isAuthenticated, toolName]);

  return { trackActivity };
}
