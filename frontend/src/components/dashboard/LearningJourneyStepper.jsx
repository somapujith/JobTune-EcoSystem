import { CheckCircle2, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';

const PLAN_TIERS = { 'Learn & Build': 1, 'Tune & Polish': 2, 'Zero to Hero': 3 };

function getStepState(step, index, completionStatus, userTier, firstIncompleteFound) {
  const completed = completionStatus[step.completionKey] === true;
  const locked = userTier < (PLAN_TIERS[step.plan] || 0);

  if (completed) return 'completed';
  if (locked) return 'locked';
  if (!firstIncompleteFound.value) {
    firstIncompleteFound.value = true;
    return 'current';
  }
  return 'future';
}

function StepCircle({ state, index }) {
  const base = 'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all duration-300';

  switch (state) {
    case 'completed':
      return (
        <div className={`${base} bg-emerald-500 text-white shadow-lg shadow-emerald-500/25`}>
          <CheckCircle2 size={20} />
        </div>
      );
    case 'current':
      return (
        <div className={`${base} bg-blue-500 text-white shadow-lg shadow-blue-500/30 animate-pulse`}>
          {index + 1}
        </div>
      );
    case 'locked':
      return (
        <div className={`${base} bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500`}>
          <Lock size={16} />
        </div>
      );
    default: // future
      return (
        <div className={`${base} border-2 border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500`}>
          {index + 1}
        </div>
      );
  }
}

function ConnectingLine({ state }) {
  let colorClass = 'bg-slate-200 dark:bg-slate-700';
  if (state === 'completed') colorClass = 'bg-emerald-400 dark:bg-emerald-500';
  if (state === 'current') colorClass = 'bg-blue-400 dark:bg-blue-500';

  return (
    <>
      {/* Horizontal line for desktop */}
      <div className={`hidden md:block flex-1 h-0.5 ${colorClass} transition-colors duration-300`} />
      {/* Vertical line for mobile */}
      <div className={`block md:hidden w-0.5 h-8 ml-5 ${colorClass} transition-colors duration-300`} />
    </>
  );
}

function StepItem({ step, state, index }) {
  const isClickable = state === 'completed' || state === 'current';

  const content = (
    <div className="flex md:flex-col items-start md:items-center gap-3 md:gap-1.5 md:text-center max-w-[120px]">
      <StepCircle state={state} index={index} />
      <div className="min-w-0">
        <p className={`text-sm font-semibold leading-tight ${
          state === 'locked'
            ? 'text-slate-400 dark:text-slate-500'
            : 'text-slate-800 dark:text-white'
        }`}>
          {step.title}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 leading-snug">
          {step.description}
        </p>
        {state === 'locked' && step.plan && (
          <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">
            Requires {step.plan}
          </p>
        )}
      </div>
    </div>
  );

  if (isClickable && step.route) {
    return (
      <Link to={step.route} className="hover:scale-105 transition-transform duration-200">
        {content}
      </Link>
    );
  }

  return <div className={state === 'locked' ? 'opacity-60' : ''}>{content}</div>;
}

export default function LearningJourneyStepper({ steps = [], completionStatus = {}, userPlan = '' }) {
  const userTier = PLAN_TIERS[userPlan] || 0;
  const firstIncompleteFound = { value: false };

  const stepsWithState = steps.map((step, i) => ({
    ...step,
    state: getStepState(step, i, completionStatus, userTier, firstIncompleteFound),
  }));

  if (steps.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-6">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Your Learning Journey</h3>
        <p className="text-sm text-slate-400 dark:text-slate-500">No steps configured yet.</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-6">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Your Learning Journey</h3>

      <div className="flex flex-col md:flex-row md:items-start gap-0 md:gap-0">
        {stepsWithState.map((step, i) => (
          <div key={step.completionKey || i} className="flex flex-col md:flex-row md:items-start flex-1">
            <StepItem step={step} state={step.state} index={i} />
            {i < stepsWithState.length - 1 && (
              <ConnectingLine state={step.state} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
