import { create } from 'zustand';
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  hasCompletedOnboarding: localStorage.getItem('onboarded') === 'true',
  login: async (credentials) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post('/auth/login', credentials);
      localStorage.setItem('token', data.token);
      set({ user: data.user, isAuthenticated: true, isLoading: false, error: null });
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
      localStorage.setItem('token', data.token);
      set({ user: data.user, isAuthenticated: true, isLoading: false, error: null });
    } catch (err) {
      const message = err.response?.data?.error || 'Signup failed';
      set({ error: message, isLoading: false, isAuthenticated: false });
      throw new Error(message);
    }
  },
  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, isAuthenticated: false });
  },
  markOnboardingComplete: () => {
    localStorage.setItem('onboarded', 'true');
    set({ hasCompletedOnboarding: true });
  },
  checkAuth: async () => {
    const token = localStorage.getItem('token');
    if (!token) return set({ isLoading: false });
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch (err) {
      localStorage.removeItem('token');
      set({ isLoading: false });
    }
  }
}));

export default useAuthStore;
export { api };
