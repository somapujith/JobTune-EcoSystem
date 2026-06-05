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
  questions: 'border-blue-500 bg-blue-50',
  talkingPoints: 'border-green-500 bg-green-50',
  companyResearch: 'border-purple-500 bg-purple-50'
};

function CollapsibleSection({ title, icon: Icon, colorClass, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`border-l-4 rounded-lg ${colorClass} mb-4 overflow-hidden`}>
      <button
        className="w-full flex items-center justify-between p-4 font-semibold text-gray-800 hover:bg-white/30 transition-colors"
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
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <BookOpen className="text-blue-600" size={28} />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Interview Prep Guide</h1>
          <p className="text-gray-500 text-sm">
            AI-powered questions, talking points, and company research for your next interview.
          </p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode('applicationId')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'applicationId'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          From Application
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'manual'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Manual Entry
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleGenerate} className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
        {mode === 'applicationId' ? (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Application ID
            </label>
            <input
              type="number"
              value={applicationId}
              onChange={e => setApplicationId(e.target.value)}
              placeholder="e.g. 42"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Find your Application ID in the Job Tracker.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role / Job Title
              </label>
              <input
                type="text"
                value={role}
                onChange={e => setRole(e.target.value)}
                placeholder="e.g. Senior Backend Engineer"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Job Description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={jobDescription}
                onChange={e => setJobDescription(e.target.value)}
                rows={5}
                placeholder="Paste the full job description here..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />
            </div>
          </>
        )}

        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm mb-4">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
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
          <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm mb-4">
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
                <li key={i} className="text-sm text-gray-700">
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
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
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
            <p className="text-sm text-gray-700 leading-relaxed">{guide.companyResearch}</p>
          </CollapsibleSection>
        </div>
      )}
    </div>
  );
}
