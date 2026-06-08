import { create } from 'zustand';
import axios from 'axios';
import { isBrowser, safeLocalStorage, setSafeLocalStorage, removeSafeLocalStorage } from '../lib/browser';

const apiBase =
  import.meta.env.VITE_API_URL ||
  (isBrowser ? `${window.location.origin}/api` : 'http://localhost:5000/api');

const api = axios.create({
  baseURL: apiBase,
});

function persistSession({ token, refreshToken, sessionId }) {
  if (token) setSafeLocalStorage('token', token);
  if (refreshToken) setSafeLocalStorage('refreshToken', refreshToken);
  if (sessionId) setSafeLocalStorage('sessionId', String(sessionId));
}

function clearSession() {
  removeSafeLocalStorage('token');
  removeSafeLocalStorage('refreshToken');
  removeSafeLocalStorage('sessionId');
}

api.interceptors.request.use((config) => {
  const token = safeLocalStorage('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let refreshQueue = [];

function processRefreshQueue(error, token = null) {
  refreshQueue.forEach((promise) => {
    if (error) promise.reject(error);
    else promise.resolve(token);
  });
  refreshQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (!original || original._retry) return Promise.reject(error);

    if (error.response?.status !== 401) return Promise.reject(error);

    const refreshToken = safeLocalStorage('refreshToken');
    if (!refreshToken) {
      clearSession();
      useAuthStore.getState().resetAuth();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const { data } = await axios.post(`${apiBase}/auth/refresh`, { refreshToken });
      setSafeLocalStorage('token', data.token);
      if (data.session?.id) setSafeLocalStorage('sessionId', String(data.session.id));
      processRefreshQueue(null, data.token);
      original.headers.Authorization = `Bearer ${data.token}`;
      return api(original);
    } catch (refreshError) {
      processRefreshQueue(refreshError, null);
      clearSession();
      useAuthStore.getState().resetAuth();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

const useAuthStore = create((set) => ({
  user: null,
  sessionId: safeLocalStorage('sessionId'),
  isAuthenticated: false,
  isLoading: isBrowser,
  error: null,
  hasCompletedOnboarding: false,

  resetAuth: () => set({
    user: null,
    sessionId: null,
    isAuthenticated: false,
    isLoading: false,
    hasCompletedOnboarding: false,
  }),

  login: async (credentials) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post('/auth/login', credentials);
      persistSession(data);
      set({
        user: data.user,
        sessionId: data.session?.id || null,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      return data;
    } catch (err) {
      const message = err.response?.data?.error || 'Login failed';
      set({ error: message, isLoading: false, isAuthenticated: false });
      throw new Error(message);
    }
  },

  signup: async (userData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post('/auth/signup', userData);
      persistSession(data);
      set({
        user: data.user,
        sessionId: data.session?.id || null,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      const message = err.response?.data?.error || 'Signup failed';
      set({ error: message, isLoading: false, isAuthenticated: false });
      throw new Error(message);
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // still clear local session
    }
    clearSession();
    set({ user: null, sessionId: null, isAuthenticated: false, hasCompletedOnboarding: false });
  },

  setOnboardingComplete: (complete) => {
    set({ hasCompletedOnboarding: complete });
  },

  checkAuth: async () => {
    const token = safeLocalStorage('token');
    if (!token) return set({ isLoading: false, isAuthenticated: false });
    try {
      const { data } = await api.get('/auth/me');
      set({
        user: data.user,
        sessionId: data.sessionId || safeLocalStorage('sessionId'),
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err) {
      clearSession();
      set({ isLoading: false, isAuthenticated: false });
    }
  },
}));

export default useAuthStore;
export { api };
