import { useState } from 'react';
import { Check, Zap } from 'lucide-react';

export default function SuggestionTracker({ suggestions = [], onApply, currentScore }) {
  const [applied, setApplied] = useState({});
  const [recalculatingScore, setRecalculatingScore] = useState(false);

  const handleApply = async (suggestionId, suggestion) => {
    setApplied(prev => ({ ...prev, [suggestionId]: true }));

    if (onApply) {
      setRecalculatingScore(true);
      await onApply(suggestion);
      setRecalculatingScore(false);
    }
  };

  const appliedCount = Object.values(applied).filter(Boolean).length;
  const potentialPointsGain = suggestions.reduce((acc, s) => {
    if (applied[s.id]) return acc;
    return acc + (s.impact || 2);
  }, 0);

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-4 border border-blue-200">
        <div className="flex items-center justify-between mb-2">
          <p className="font-semibold text-slate-900">Progress</p>
          <span className="text-xs font-bold text-blue-600">{appliedCount} of {suggestions.length} applied</span>
        </div>
        <div className="w-full h-2 bg-white/70 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-500"
            style={{ width: `${(appliedCount / suggestions.length) * 100}%` }}
          />
        </div>
        {potentialPointsGain > 0 && (
          <p className="text-xs text-blue-700 font-semibold mt-3 flex items-center gap-1">
            <Zap className="w-3 h-3" /> Potential gain: +{potentialPointsGain} points
          </p>
        )}
      </div>

      <div className="space-y-3">
        {suggestions.map((suggestion, idx) => {
          const isApplied = applied[suggestion.id];

          return (
            <div
              key={suggestion.id || idx}
              className={`p-4 rounded-xl border-2 transition-all ${
                isApplied ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={isApplied}
                  onChange={() => handleApply(suggestion.id || idx, suggestion)}
                  disabled={isApplied}
                  className="mt-1 w-5 h-5 rounded cursor-pointer"
                />
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{suggestion.title}</p>
                      <p className="text-sm text-slate-600 mt-1">{suggestion.description}</p>
                    </div>
                    {suggestion.impact && (
                      <span className="text-xs font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap">
                        +{suggestion.impact} pts
                      </span>
                    )}
                  </div>

                  {suggestion.example && (
                    <div className="mt-3 p-2 bg-slate-100 rounded-lg text-xs font-mono text-slate-700">
                      {suggestion.example}
                    </div>
                  )}

                  {isApplied && (
                    <div className="mt-3 p-2 bg-green-100 rounded-lg flex items-center gap-2 text-xs text-green-700 font-semibold">
                      <Check className="w-4 h-4" /> Applied!
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {appliedCount === suggestions.length && suggestions.length > 0 && (
        <div className="p-4 bg-green-50 rounded-xl border border-green-200 text-center">
          <p className="text-sm font-bold text-green-700">All suggestions applied! Your resume score has improved.</p>
        </div>
      )}
    </div>
  );
}
