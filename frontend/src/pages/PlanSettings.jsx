import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import useAuthStore, { api } from '../store/useAuthStore';
import useSubscriptionStore from '../store/useSubscriptionStore';
import PlanChangeModal from '../components/PlanChangeModal';
import LoadingButton from '../components/LoadingButton';
import { formatPrice, getChangeType, PLAN_META } from '../config/planDetails';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Crown,
  Sparkles,
} from 'lucide-react';

const PLAN_STYLES = {
  'Learn & Build': {
    ring: 'ring-blue-500/30',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    button: 'bg-blue-600 hover:bg-blue-700',
  },
  'Tune & Polish': {
    ring: 'ring-purple-500/30',
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    button: 'bg-purple-600 hover:bg-purple-700',
  },
  'Zero to Hero': {
    ring: 'ring-amber-500/30',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    button: 'bg-amber-600 hover:bg-amber-700',
  },
};

export default function PlanSettings() {
  const { isAuthenticated } = useAuthStore();
  const { userPlan, plans, selectPlan, isLoading, fetchPlans, getUserPlan } = useSubscriptionStore();
  const location = useLocation();

  const [pageLoading, setPageLoading] = useState(true);
  const [pendingPlan, setPendingPlan] = useState(null);
  const [switchError, setSwitchError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const highlightPlan = location.state?.highlightPlan || null;
  const fromTool = location.state?.fromTool || null;

  useEffect(() => {
    let mounted = true;
    (async () => {
      setPageLoading(true);
      await Promise.all([fetchPlans(), getUserPlan()]);
      if (mounted) setPageLoading(false);
    })();
    return () => { mounted = false; };
  }, [fetchPlans, getUserPlan]);

  useEffect(() => {
    api.get('/auth/sessions')
      .then(({ data }) => {
        const sessions = data.sessions || [];
        setCurrentSession(sessions.find((s) => s.isCurrent) || sessions[0] || null);
      })
      .catch(() => setCurrentSession(null))
      .finally(() => setSessionLoading(false));
  }, []);

  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => (PLAN_META[a.name]?.tier || 0) - (PLAN_META[b.name]?.tier || 0)),
    [plans]
  );

  useEffect(() => {
    if (!highlightPlan || pageLoading || sortedPlans.length === 0) return;
    const slug = highlightPlan.replace(/\s+/g, '-').toLowerCase();
    const el = document.getElementById(`plan-${slug}`);
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    }
  }, [highlightPlan, pageLoading, sortedPlans.length]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const openSwitchModal = (plan) => {
    if (userPlan && plan.id === userPlan.id) return;
    setSwitchError(null);
    setPendingPlan(plan);
  };

  const closeSwitchModal = () => {
    if (isLoading) return;
    setPendingPlan(null);
    setSwitchError(null);
  };

  const confirmSwitch = async () => {
    if (!pendingPlan) return;
    setSwitchError(null);
    try {
      await selectPlan(pendingPlan.id);
      setPendingPlan(null);
      setSuccessMessage(`You're now on ${pendingPlan.name}. Your tools have been updated.`);
      setTimeout(() => setSuccessMessage(null), 6000);
    } catch (err) {
      setSwitchError(err.response?.data?.error || 'Failed to switch plans. Please try again.');
    }
  };

  const getActionLabel = (plan) => {
    if (!userPlan) return 'Select plan';
    if (plan.id === userPlan.id) return 'Current plan';
    const changeType = getChangeType(userPlan.name, plan.name);
    if (changeType === 'upgrade') return `Upgrade to ${plan.name}`;
    if (changeType === 'downgrade') return `Switch to ${plan.name}`;
    return `Switch to ${plan.name}`;
  };

  return (
    <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8 w-full">
      {/* Back + header */}
      <div className="mb-10">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-blue-600 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-2">Subscription</p>
            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Manage your plan</h1>
            <p className="text-lg text-slate-500 mt-2 max-w-xl">
              Compare tiers, preview what changes, and switch instantly — no page reload needed.
            </p>
          </div>

          {fromTool && highlightPlan && (
            <div className="glass-card rounded-2xl px-5 py-4 flex items-start gap-3 max-w-md">
              <Sparkles className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">Unlock {fromTool}</p>
                <p className="text-sm text-slate-500">
                  {highlightPlan} includes this tool. Review the plan below to upgrade.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Success banner */}
      {successMessage && (
        <div className="mb-8 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <Check className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{successMessage}</p>
          <Link to="/dashboard" className="ml-auto text-sm font-bold text-emerald-700 hover:underline shrink-0">
            Go to dashboard
          </Link>
        </div>
      )}

      {/* Current plan hero */}
      {pageLoading ? (
        <div className="glass-card rounded-3xl p-8 mb-10 animate-pulse">
          <div className="h-6 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
          <div className="h-10 w-64 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
      ) : userPlan ? (
        <div className="glass-card rounded-3xl p-8 mb-10 border-2 border-blue-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/5 rounded-full -mr-16 -mt-16" />
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg">
                <Crown className="w-7 h-7" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-1">Your current plan</p>
                <h2 className="text-3xl font-black text-slate-900 dark:text-white">{userPlan.name}</h2>
                <p className="text-slate-500 mt-1">
                  {formatPrice(userPlan.price)} · {userPlan.features?.length || 0} tools unlocked
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(userPlan.features || []).slice(0, 4).map((f) => (
                <span key={f} className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-xs font-semibold text-blue-700 dark:text-blue-300">
                  {f}
                </span>
              ))}
              {(userPlan.features?.length || 0) > 4 && (
                <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-500">
                  +{userPlan.features.length - 4} more
                </span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Plan cards */}
      <div className="grid md:grid-cols-3 gap-6 mb-16">
        {pageLoading
          ? [1, 2, 3].map((i) => (
              <div key={i} className="glass-card rounded-3xl p-8 animate-pulse h-96" />
            ))
          : sortedPlans.map((plan) => {
              const meta = PLAN_META[plan.name] || {};
              const PlanIcon = meta.icon || Crown;
              const styles = PLAN_STYLES[plan.name] || PLAN_STYLES['Learn & Build'];
              const isCurrent = userPlan?.id === plan.id;
              const isHighlighted = highlightPlan === plan.name && !isCurrent;
              const changeType = userPlan ? getChangeType(userPlan.name, plan.name) : 'same';

              return (
                <div
                  key={plan.id}
                  id={`plan-${plan.name.replace(/\s+/g, '-').toLowerCase()}`}
                  className={`relative glass-card rounded-3xl p-8 flex flex-col transition-all duration-300 ${
                    isCurrent
                      ? `ring-2 ring-blue-600 shadow-lg ${styles.ring}`
                      : isHighlighted
                      ? 'ring-2 ring-amber-500 shadow-xl scale-[1.02]'
                      : 'hover:shadow-lg hover:-translate-y-1'
                  }`}
                >
                  {isCurrent && (
                    <span className="absolute -top-3 left-6 px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-bold">
                      Active
                    </span>
                  )}
                  {isHighlighted && (
                    <span className="absolute -top-3 right-6 px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-bold">
                      Recommended
                    </span>
                  )}

                  <div className="flex items-center gap-3 mb-5">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${styles.badge}`}>
                      <PlanIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900 dark:text-white">{plan.name}</h3>
                      <p className="text-sm text-slate-500">{meta.tagline || plan.description}</p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <p className="text-4xl font-black text-slate-900 dark:text-white">
                      {plan.price === 0 ? 'Free' : `₹${plan.price}`}
                    </p>
                    {plan.price > 0 && <p className="text-sm text-slate-500">per month</p>}
                  </div>

                  {meta.bestFor && (
                    <div className="mb-5 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Best for</p>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{meta.bestFor}</p>
                    </div>
                  )}

                  <div className="flex-1 space-y-2.5 mb-6">
                    {(plan.features || []).map((feature) => (
                      <div key={feature} className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span className="text-sm text-slate-700 dark:text-slate-300">{feature}</span>
                      </div>
                    ))}
                  </div>

                  {meta.outcome && (
                    <div className="mb-6 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50">
                      <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{meta.outcome}</p>
                    </div>
                  )}

                  {isCurrent ? (
                    <div className="w-full py-3.5 px-4 rounded-xl font-bold text-center bg-blue-600/10 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      ✓ Current plan
                    </div>
                  ) : (
                    <LoadingButton
                      loading={isLoading && pendingPlan?.id === plan.id}
                      disabled={isLoading}
                      onClick={() => openSwitchModal(plan)}
                      className={`w-full py-3.5 px-4 rounded-xl font-bold text-white transition-all active:scale-[0.98] ${
                        changeType === 'downgrade'
                          ? 'bg-slate-700 hover:bg-slate-800'
                          : styles.button
                      }`}
                    >
                      {getActionLabel(plan)}
                      <ChevronRight className="w-4 h-4" />
                    </LoadingButton>
                  )}
                </div>
              );
            })}
      </div>

      {/* Single-device session */}
      <div className="glass-card rounded-3xl p-8 mb-16 max-w-3xl">
        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">Device session</h3>
        <p className="text-sm text-slate-500 mb-6">
          Your account allows one active device at a time. Signing in elsewhere ends this session. To switch computers, sign in on the new device and choose &quot;Use this device instead&quot; on the login screen.
        </p>
        {sessionLoading ? (
          <p className="text-sm text-slate-400">Loading session…</p>
        ) : !currentSession ? (
          <p className="text-sm text-slate-400">No active session found.</p>
        ) : (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <p className="font-bold text-slate-900 dark:text-white">
              {currentSession.deviceName}
              <span className="ml-2 text-xs font-bold text-emerald-600">This device</span>
            </p>
            {currentSession.ipAddress && (
              <p className="text-xs text-slate-500 mt-1">IP: {currentSession.ipAddress}</p>
            )}
            <p className="text-xs text-slate-500 mt-1">
              Last active {new Date(currentSession.lastActiveAt).toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="glass-card rounded-3xl p-8 max-w-3xl">
        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-6">How plan changes work</h3>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            { step: '1', title: 'Preview changes', desc: 'See exactly which tools you gain or lose before confirming.' },
            { step: '2', title: 'Instant activation', desc: 'Your new plan applies immediately — no reload or re-login.' },
            { step: '3', title: 'Data preserved', desc: 'Downgrading locks tools but keeps all your saved work.' },
          ].map((item) => (
            <div key={item.step}>
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-black flex items-center justify-center mb-3">
                {item.step}
              </div>
              <p className="font-bold text-slate-900 dark:text-white mb-1">{item.title}</p>
              <p className="text-sm text-slate-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <PlanChangeModal
        isOpen={!!pendingPlan}
        currentPlan={userPlan}
        targetPlan={pendingPlan}
        onConfirm={confirmSwitch}
        onCancel={closeSwitchModal}
        isLoading={isLoading}
        error={switchError}
      />
    </div>
  );
}
