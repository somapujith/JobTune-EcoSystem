import { ArrowRight, Check, Minus, Plus, X } from 'lucide-react';
import LoadingButton from './LoadingButton';
import { formatPrice, getChangeType, getFeatureDiff } from '../config/planDetails';

export default function PlanChangeModal({
  isOpen,
  currentPlan,
  targetPlan,
  onConfirm,
  onCancel,
  isLoading,
  error,
}) {
  if (!isOpen || !targetPlan) return null;

  const isFirstSelection = !currentPlan;
  const changeType = isFirstSelection ? 'upgrade' : getChangeType(currentPlan.name, targetPlan.name);
  const { gained, lost } = getFeatureDiff(currentPlan?.features, targetPlan.features);
  const isDowngrade = changeType === 'downgrade';
  const priceDelta = (targetPlan.price || 0) - (currentPlan?.price || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />

      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="absolute top-4 right-4 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-slate-500" />
        </button>

        <div className="p-8">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
            {isFirstSelection ? 'Confirm plan' : isDowngrade ? 'Confirm downgrade' : 'Confirm plan change'}
          </p>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-6">
            {isFirstSelection ? `Get started with ${targetPlan.name}?` : `Switch to ${targetPlan.name}?`}
          </h2>

          {/* Plan transition */}
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 mb-6">
            {!isFirstSelection && (
              <>
                <div className="flex-1 text-center">
                  <p className="text-xs text-slate-400 font-bold uppercase mb-1">Current</p>
                  <p className="font-bold text-slate-900 dark:text-white">{currentPlan.name}</p>
                  <p className="text-sm text-slate-500">{formatPrice(currentPlan.price)}</p>
                </div>
                <ArrowRight className="w-5 h-5 text-blue-500 shrink-0" />
              </>
            )}
            <div className="flex-1 text-center">
              <p className="text-xs text-blue-500 font-bold uppercase mb-1">
                {isFirstSelection ? 'Selected plan' : 'New'}
              </p>
              <p className="font-bold text-slate-900 dark:text-white">{targetPlan.name}</p>
              <p className="text-sm text-slate-500">{formatPrice(targetPlan.price)}</p>
            </div>
          </div>

          {!isFirstSelection && priceDelta !== 0 && (
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              {priceDelta > 0
                ? `Your monthly cost increases by $${priceDelta}.`
                : priceDelta < 0
                ? `You'll save $${Math.abs(priceDelta)}/month on this plan.`
                : 'No change to monthly cost.'}
            </p>
          )}

          {/* Feature changes */}
          <div className="space-y-4 mb-6 max-h-48 overflow-y-auto">
            {gained.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-2 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Tools you'll unlock ({gained.length})
                </p>
                <ul className="space-y-1.5">
                  {gained.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {lost.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-amber-600 mb-2 flex items-center gap-1">
                  <Minus className="w-3.5 h-3.5" /> Tools you'll lose access to ({lost.length})
                </p>
                <ul className="space-y-1.5">
                  {lost.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <Minus className="w-4 h-4 text-amber-500 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-slate-500 mt-2">Your saved data stays intact — you just won't be able to open these tools until you upgrade again.</p>
              </div>
            )}

            {gained.length === 0 && lost.length === 0 && (
              <p className="text-sm text-slate-500">Same tool access — you're switching between equivalent tiers.</p>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-600 font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <LoadingButton
              loading={isLoading}
              onClick={onConfirm}
              className={`flex-1 py-3 px-4 rounded-xl font-bold text-white transition-colors ${
                isDowngrade
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isFirstSelection ? 'Confirm plan' : isDowngrade ? 'Confirm downgrade' : 'Confirm switch'}
            </LoadingButton>
          </div>
        </div>
      </div>
    </div>
  );
}
