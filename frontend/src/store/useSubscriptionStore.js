import { create } from 'zustand';
import { api } from './useAuthStore';

const useSubscriptionStore = create((set, get) => ({
  userPlan: null,
  plans: [],
  recommendation: null,
  onboardingComplete: false,
  isLoading: false,

  fetchPlans: async () => {
    try {
      const { data } = await api.get('/subscriptions/plans');
      set({ plans: data.plans });
    } catch (err) {
      console.error('Failed to fetch plans:', err);
    }
  },

  getUserPlan: async () => {
    try {
      const { data } = await api.get('/subscriptions/my-plan');
      set({ userPlan: data.plan });
    } catch (err) {
      console.error('Failed to fetch user plan:', err);
    }
  },

  checkOnboarded: async () => {
    try {
      const { data } = await api.get('/subscriptions/onboarded');
      set({ onboardingComplete: data.onboarded });
      return data.onboarded;
    } catch (err) {
      console.error('Failed to check onboarding status:', err);
      return false;
    }
  },

  getRecommendation: async (careerGoal, experienceLevel, painPoints) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post('/subscriptions/recommend', {
        careerGoal,
        experienceLevel,
        painPoints
      });
      set({ recommendation: data.recommendation, isLoading: false });
      return data.recommendation;
    } catch (err) {
      console.error('Failed to get recommendation:', err);
      set({ isLoading: false });
      throw err;
    }
  },

  selectPlan: async (planId) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post('/subscriptions/select-plan', { planId });
      set({ userPlan: data.plan, onboardingComplete: true, isLoading: false });
      return data.plan;
    } catch (err) {
      console.error('Failed to select plan:', err);
      set({ isLoading: false });
      throw err;
    }
  },

  hasAccess: (toolName) => {
    const { userPlan } = get();
    if (!userPlan) return false;
    return userPlan.features && userPlan.features.includes(toolName);
  }
}));

export default useSubscriptionStore;
