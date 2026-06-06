// Better Auth client wrapper for frontend
// Bridges axios calls to the backend auth API

import axios from 'axios';

const apiURL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const authApi = axios.create({
  baseURL: `${apiURL}/auth`,
  withCredentials: true,
});

export const authClient = {
  signIn: {
    email: async ({ email, password }) => {
      try {
        const res = await authApi.post('/login', { email, password });
        if (res.data.token) {
          localStorage.setItem('token', res.data.token);
        }
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
        if (res.data.token) {
          localStorage.setItem('token', res.data.token);
        }
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
    localStorage.removeItem('token');
    return { data: null, error: null };
  },

  getSession: async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return { data: null, error: null };

      const res = await authApi.get('/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { data: { user: res.data.user }, error: null };
    } catch (err) {
      localStorage.removeItem('token');
      return { data: null, error: { message: 'Session invalid' } };
    }
  },
};
