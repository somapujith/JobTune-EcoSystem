import useAuthStore from './useAuthStore';
import useSubscriptionStore from './useSubscriptionStore';

/** Reset client stores between SSR requests to avoid cross-request state leaks. */
export function resetStoresForSsr() {
  useAuthStore.setState({
    user: null,
    sessionId: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    hasCompletedOnboarding: false,
  });

  useSubscriptionStore.setState({
    userPlan: null,
    recommendation: null,
    onboardingComplete: false,
    onboardingChecked: false,
    isLoading: false,
  });
}
