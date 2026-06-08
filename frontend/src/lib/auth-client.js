// Better Auth client wrapper for frontend
// Bridges axios calls to the backend auth API

import axios from 'axios';
import { setSafeLocalStorage, safeLocalStorage, removeSafeLocalStorage } from './browser';

const apiURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const authApi = axios.create({
  baseURL: `${apiURL}/auth`,
  withCredentials: true,
});

function persistSession({ token, refreshToken, sessionId }) {
  if (token) setSafeLocalStorage('token', token);
  if (refreshToken) setSafeLocalStorage('refreshToken', refreshToken);
  if (sessionId) setSafeLocalStorage('sessionId', String(sessionId));
}

export const authClient = {
  signIn: {
    email: async ({ email, password }) => {
      try {
        const res = await authApi.post('/login', { email, password });
        persistSession(res.data);
        return { data: { user: res.data.user }, error: null };
      } catch (err) {
        return {
          data: null,
          error: {
            message: err.response?.data?.error || 'Login failed',
          },
        };
      }
    },
  },

  signUp: {
    email: async ({ email, password, name, githubUsername }) => {
      try {
        const res = await authApi.post('/signup', {
          email,
          password,
          github_username: githubUsername,
        });
        persistSession(res.data);
        return { data: { user: res.data.user }, error: null };
      } catch (err) {
        return {
          data: null,
          error: {
            message: err.response?.data?.error || 'Signup failed',
          },
        };
      }
    },
  },

  signOut: async () => {
    try {
      const token = safeLocalStorage('token');
      if (token) {
        await authApi.post('/logout', {}, { headers: { Authorization: `Bearer ${token}` } });
      }
    } catch {
      // ignore
    }
    removeSafeLocalStorage('token');
    removeSafeLocalStorage('refreshToken');
    removeSafeLocalStorage('sessionId');
    return { data: null, error: null };
  },

  getSession: async () => {
    try {
      const token = safeLocalStorage('token');
      if (!token) return { data: null, error: null };

      const res = await authApi.get('/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { data: { user: res.data.user, sessionId: res.data.sessionId }, error: null };
    } catch (err) {
      removeSafeLocalStorage('token');
      removeSafeLocalStorage('refreshToken');
      removeSafeLocalStorage('sessionId');
      return { data: null, error: { message: 'Session invalid' } };
    }
  },
};
