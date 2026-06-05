import React, { useState } from 'react';
import { api } from '../store/useAuthStore';
import {
  BookOpen,
  MessageSquare,
  Target,
  Building2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  CheckCircle2
} from 'lucide-react';

const SECTION_COLORS = {
  questions: 'glass-card border-blue-500/50 bg-blue-500/5',
  talkingPoints: 'glass-card border-emerald-500/50 bg-emerald-500/5',
  companyResearch: 'glass-card border-purple-500/50 bg-purple-500/5'
};

function CollapsibleSection({ title, icon: Icon, colorClass, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`border-l-4 rounded-xl ${colorClass} mb-4 overflow-hidden shadow-sm`}>
      <button
        className="w-full flex items-center justify-between p-4 font-bold text-on-surface hover:bg-surface-container/30 transition-colors"
        onClick={() => setOpen(prev => !prev)}
      >
        <span className="flex items-center gap-2">
          <Icon size={18} />
          {title}
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

export default function JobGuide() {
  const [mode, setMode] = useState('applicationId'); // 'applicationId' | 'manual'
  const [applicationId, setApplicationId] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [guide, setGuide] = useState(null);
  const [error, setError] = useState('');

  const handleGenerate = async (e) => {
    e.preventDefault();
    setError('');
    setGuide(null);

    const payload =
      mode === 'applicationId'
        ? { applicationId: Number(applicationId) }
        : { jobDescription, role };

    if (mode === 'applicationId' && !applicationId) {
      setError('Please enter an Application ID.');
      return;
    }
    if (mode === 'manual' && !jobDescription) {
      setError('Please enter a job description.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/guides/generate', payload);
      setGuide(data);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to generate guide. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-16 px-4 sm:px-6">
      <div className="flex items-center gap-3 mb-8">
        <BookOpen className="text-blue-600" size={32} />
        <div>
          <h1 className="text-3xl font-black text-on-surface font-headline">Interview Prep Guide</h1>
          <p className="text-on-surface-variant font-medium mt-1">
            AI-powered questions, talking points, and company research for your next interview.
          </p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode('applicationId')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
            mode === 'applicationId'
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
              : 'glass-card hover:bg-white/40 text-on-surface'
          }`}
        >
          From Application
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
            mode === 'manual'
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
              : 'glass-card hover:bg-white/40 text-on-surface'
          }`}
        >
          Manual Entry
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleGenerate} className="glass-card rounded-3xl p-8 mb-8 shadow-lg">
        {mode === 'applicationId' ? (
          <div className="mb-6">
            <label className="block text-sm font-bold text-on-surface mb-2">
              Application ID
            </label>
            <input
              type="number"
              value={applicationId}
              onChange={e => setApplicationId(e.target.value)}
              placeholder="e.g. 42"
              className="w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-2 text-sm font-medium text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="text-xs text-on-surface-variant font-medium mt-2">
              Find your Application ID in the Job Tracker.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <label className="block text-sm font-bold text-on-surface mb-2">
                Role / Job Title
              </label>
              <input
                type="text"
                value={role}
                onChange={e => setRole(e.target.value)}
                placeholder="e.g. Senior Backend Engineer"
                className="w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-2 text-sm font-medium text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-bold text-on-surface mb-2">
                Job Description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={jobDescription}
                onChange={e => setJobDescription(e.target.value)}
                rows={5}
                placeholder="Paste the full job description here..."
                className="w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-2 text-sm font-medium text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
              />
            </div>
          </>
        )}

        {error && (
          <div className="flex items-center gap-3 text-rose-600 glass-card border-rose-200/50 rounded-xl px-4 py-3 text-sm font-medium mb-6">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Generating Guide...
            </>
          ) : (
            <>
              <BookOpen size={16} />
              Generate Interview Guide
            </>
          )}
        </button>
      </form>

      {/* Results */}
      {guide && (
        <div>
          <div className="flex items-center gap-3 text-emerald-600 glass-card border-emerald-200/50 rounded-xl px-4 py-3 text-sm font-medium mb-6">
            <CheckCircle2 size={16} />
            Guide generated successfully (saved as #{guide.savedId})
          </div>

          <CollapsibleSection
            title={`Interview Questions (${guide.questions?.length || 0})`}
            icon={MessageSquare}
            colorClass={SECTION_COLORS.questions}
          >
            <ol className="list-decimal list-inside space-y-2">
              {(guide.questions || []).map((q, i) => (
                <li key={i} className="text-sm text-on-surface-variant font-medium leading-relaxed">
                  {q}
                </li>
              ))}
            </ol>
          </CollapsibleSection>

          <CollapsibleSection
            title={`Talking Points (${guide.talkingPoints?.length || 0})`}
            icon={Target}
            colorClass={SECTION_COLORS.talkingPoints}
          >
            <ul className="space-y-2">
              {(guide.talkingPoints || []).map((tp, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-on-surface-variant font-medium leading-relaxed">
                  <CheckCircle2 size={14} className="text-green-600 mt-0.5 shrink-0" />
                  {tp}
                </li>
              ))}
            </ul>
          </CollapsibleSection>

          <CollapsibleSection
            title="Company Research"
            icon={Building2}
            colorClass={SECTION_COLORS.companyResearch}
          >
            <p className="text-sm text-on-surface-variant font-medium leading-relaxed">{guide.companyResearch}</p>
          </CollapsibleSection>
        </div>
      )}
    </div>
  );
}
