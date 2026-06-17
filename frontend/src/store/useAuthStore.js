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

function handleSessionSuperseded(message) {
  clearSession();
  useAuthStore.getState().setSessionBlocked(
    message || 'This account was signed in on another device.'
  );
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
    const code = error.response?.data?.code;

    if (code === 'SESSION_SUPERSEDED') {
      handleSessionSuperseded(error.response?.data?.error);
      return Promise.reject(error);
    }

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
      if (data.code === 'SESSION_SUPERSEDED') {
        handleSessionSuperseded(data.error);
        return Promise.reject(error);
      }
      setSafeLocalStorage('token', data.token);
      if (data.session?.id) setSafeLocalStorage('sessionId', String(data.session.id));
      processRefreshQueue(null, data.token);
      original.headers.Authorization = `Bearer ${data.token}`;
      return api(original);
    } catch (refreshError) {
      const refreshCode = refreshError.response?.data?.code;
      if (refreshCode === 'SESSION_SUPERSEDED') {
        handleSessionSuperseded(refreshError.response?.data?.error);
      } else {
        clearSession();
        useAuthStore.getState().resetAuth();
      }
      processRefreshQueue(refreshError, null);
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
  sessionBlocked: false,
  sessionBlockedMessage: null,
  accountInUse: null,

  resetAuth: () => set({
    user: null,
    sessionId: null,
    isAuthenticated: false,
    isLoading: false,
    hasCompletedOnboarding: false,
    sessionBlocked: false,
    sessionBlockedMessage: null,
    accountInUse: null,
  }),

  setSessionBlocked: (message) => set({
    sessionBlocked: true,
    sessionBlockedMessage: message,
    isAuthenticated: false,
    user: null,
    sessionId: null,
    isLoading: false,
  }),

  clearSessionBlocked: () => set({
    sessionBlocked: false,
    sessionBlockedMessage: null,
    accountInUse: null,
    error: null,
  }),

  clearAccountInUse: () => set({ accountInUse: null, error: null }),

  login: async (credentials, { replaceDevice = false } = {}) => {
    set({ isLoading: true, error: null, accountInUse: null });
    try {
      const { data } = await api.post('/auth/login', { ...credentials, replaceDevice });
      persistSession(data);
      set({
        user: data.user,
        sessionId: data.session?.id || null,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        accountInUse: null,
        sessionBlocked: false,
        sessionBlockedMessage: null,
      });
      return data;
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.code === 'ACCOUNT_IN_USE') {
        set({
          accountInUse: err.response.data.activeSession,
          error: err.response.data.error,
          isLoading: false,
          isAuthenticated: false,
        });
        const blocked = new Error('ACCOUNT_IN_USE');
        blocked.code = 'ACCOUNT_IN_USE';
        throw blocked;
      }
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
      const refreshToken = safeLocalStorage('refreshToken');
      await api.post('/auth/logout', { refreshToken });
    } catch {
      // still clear local session
    }
    clearSession();
    set({
      user: null,
      sessionId: null,
      isAuthenticated: false,
      hasCompletedOnboarding: false,
      sessionBlocked: false,
      sessionBlockedMessage: null,
      accountInUse: null,
    });
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
        sessionBlocked: false,
      });
    } catch (err) {
      if (err.response?.data?.code === 'SESSION_SUPERSEDED') {
        handleSessionSuperseded(err.response?.data?.error);
        return;
      }
      clearSession();
      set({ isLoading: false, isAuthenticated: false });
    }
  },
}));

export default useAuthStore;
export { api };
