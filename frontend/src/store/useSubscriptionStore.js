import { create } from 'zustand';
import { api } from './useAuthStore';
import useAuthStore from './useAuthStore';

const useSubscriptionStore = create((set, get) => ({
  userPlan: null,
  plans: [],
  recommendation: null,
  pendingOrder: null,
  onboardingComplete: false,
  onboardingChecked: false,
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
      const onboarded = !!data.onboarded;
      useAuthStore.getState().setOnboardingComplete(onboarded);
      set({ onboardingComplete: onboarded, onboardingChecked: true });
      return onboarded;
    } catch (err) {
      console.error('Failed to check onboarding status:', err);
      set({ onboardingChecked: true });
      return false;
    }
  },

  getRecommendation: async (careerGoal, experienceLevel, painPoints, fieldOfInterest) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post('/subscriptions/recommend', {
        careerGoal,
        experienceLevel,
        painPoints,
        fieldOfInterest,
      });
      set({ recommendation: data.recommendation, isLoading: false });
      return data.recommendation;
    } catch (err) {
      console.error('Failed to get recommendation:', err);
      set({ isLoading: false });
      throw err;
    }
  },

  // Creates a pending order for the chosen plan. Plan access is NOT granted yet —
  // it's granted after verifyPayment() succeeds.
  createOrder: async (planId) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post('/subscriptions/create-order', { planId });
      set({ pendingOrder: data.order, isLoading: false });
      return data.order;
    } catch (err) {
      console.error('Failed to create order:', err);
      set({ isLoading: false });
      throw err;
    }
  },

  // Mock payment verification for now — no gateway wired up yet.
  verifyPayment: async (orderRef) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post('/subscriptions/verify-payment', { orderRef });
      useAuthStore.getState().setOnboardingComplete(true);
      set({ userPlan: data.plan, pendingOrder: null, onboardingComplete: true, onboardingChecked: true, isLoading: false });
      return data.plan;
    } catch (err) {
      console.error('Failed to verify payment:', err);
      set({ isLoading: false });
      throw err;
    }
  },

  hasAccess: (toolName) => {
    const { userPlan } = get();
    if (!userPlan) return false;
    return userPlan.features && userPlan.features.includes(toolName);
  },
}));

export default useSubscriptionStore;
