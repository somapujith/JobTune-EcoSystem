import React, { useEffect, useState } from 'react';
import useSubscriptionStore from '../store/useSubscriptionStore';
import { Check, Crown, Zap, Rocket } from 'lucide-react';

const PLAN_ICONS = {
  'Learn & Build': <Zap className="w-8 h-8" />,
  'Tune & Polish': <Rocket className="w-8 h-8" />,
  'Zero to Hero': <Crown className="w-8 h-8" />
};

export default function PlanSelection({ recommendation }) {
  const { createOrder, isLoading, plans: allPlans } = useSubscriptionStore();
  const [selectedPlanId, setSelectedPlanId] = useState(null);

  useEffect(() => {
    if (recommendation?.recommendedPlan) {
      setSelectedPlanId(recommendation.recommendedPlan.id);
    }
  }, [recommendation]);

  const handleSelectPlan = async (planId) => {
    setSelectedPlanId(planId);
    try {
      const order = await createOrder(planId);
      // Redirect to payment confirmation page with the pending order reference
      setTimeout(() => {
        window.location.href = `/payment-confirm?order=${encodeURIComponent(order.order_ref)}`;
      }, 500);
    } catch (err) {
      console.error('Failed to create order:', err);
    }
  };

  const isRecommended = (plan) => {
    if (!recommendation?.recommendedPlan) return false;
    return recommendation.recommendedPlan.id === plan.id ||
           recommendation.recommendedPlan.name === plan.name;
  };

  // Use allPlans from store if available, otherwise use enriched plans from recommendation
  const plans = allPlans.length > 0 ? allPlans : (recommendation?.allPlans || []);

  return (
    <div className="w-full h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-12 px-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-3">Choose Your Perfect Plan</h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            We recommend <span className="font-bold text-blue-600 dark:text-blue-400">{recommendation?.recommendedPlan?.name}</span> based on your answers, but you can choose any plan.
          </p>
        </div>

        {/* Plans Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-8">
          {plans.map(plan => {
            const planData = plan;
            const isSelected = selectedPlanId === plan.id;
            const recommended = isRecommended(plan);

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl transition-all ${
                  recommended
                    ? 'ring-2 ring-blue-600 transform scale-105 shadow-2xl'
                    : 'shadow-lg hover:shadow-xl'
                } ${
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-900/20'
                    : 'bg-white dark:bg-slate-800'
                }`}
              >
                {/* Recommended Badge */}
                {recommended && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-bold">
                    Recommended for You
                  </div>
                )}

                <div className="p-8">
                  {/* Plan Icon & Name */}
                  <div className="flex items-center gap-3 mb-6">
                    <div className="text-blue-600 dark:text-blue-400">
                      {PLAN_ICONS[planData.name]}
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{planData.name}</h3>
                  </div>

                  {/* Price */}
                  {planData.price !== undefined && (
                    <div className="mb-6">
                      {planData.price === 0 ? (
                        <p className="text-3xl font-black text-blue-600">Free</p>
                      ) : (
                        <>
                          <p className="text-4xl font-black text-slate-900 dark:text-white">${planData.price}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-400">/month</p>
                        </>
                      )}
                    </div>
                  )}

                  {/* Description */}
                  {planData.description && (
                    <p className="text-slate-600 dark:text-slate-300 mb-6">{planData.description}</p>
                  )}

                  {/* Features */}
                  {planData.features && (
                    <div className="mb-8 space-y-3">
                      {planData.features.map((feature, idx) => (
                        <div key={idx} className="flex items-start gap-3">
                          <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                          <span className="text-slate-700 dark:text-slate-300">{feature}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* CTA Button */}
                  <button
                    onClick={() => handleSelectPlan(plan.id || plan.plan)}
                    disabled={isLoading}
                    className={`w-full py-3 px-6 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                      isSelected || recommended
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-slate-600'
                    } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isSelected ? (
                      <>
                        <Check className="w-5 h-5" /> Selected
                      </>
                    ) : (
                      'Choose Plan'
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Info Text */}
        <p className="text-center text-sm text-slate-600 dark:text-slate-400">
          You can change your plan anytime. All plans include customer support and regular updates.
        </p>
      </div>
    </div>
  );
}
