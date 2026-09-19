import { isBrowser } from './browser';

/**
 * Single source of truth for the backend API base URL.
 *
 * - VITE_API_URL set  -> use it verbatim (e.g. the deployed backend, or http://localhost:5000/api).
 * - Browser, unset    -> same-origin `/api`. In local dev the Vite dev server proxies that to the
 *                        backend (see vite.config.js), so no CORS and no per-machine config.
 * - SSR (no window)   -> the local backend directly; keep the port in sync with backend/.env PORT.
 */
export const API_BASE =
  import.meta.env.VITE_API_URL ||
  (isBrowser ? `${window.location.origin}/api` : 'http://localhost:5000/api');
