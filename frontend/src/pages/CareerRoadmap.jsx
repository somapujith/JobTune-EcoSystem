import { useState, useEffect, useRef } from 'react';
import { Loader, CheckCircle, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { api } from '../store/useAuthStore';

export default function CareerRoadmap() {
  const [step, setStep] = useState('form'); // form | generating | display
  const [formData, setFormData] = useState({
    currentRole: '',
    targetRole: '',
    currentSkills: '',
    timeframe: '6months'
  });
  const [roadmap, setRoadmap] = useState(null);
  const [expandedPhases, setExpandedPhases] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const generatingRef = useRef(false);

  // Load saved roadmap on mount
  useEffect(() => {
    loadSavedRoadmap();
  }, []);

  async function loadSavedRoadmap() {
    try {
      const { data } = await api.get('/career/roadmap');
      setRoadmap(data.roadmap || data);
      setStep('display');
    } catch (err) {
      // No saved roadmap, show form
      setStep('form');
    }
  }

  async function handleGenerateRoadmap(e) {
    e.preventDefault();
    setError('');

    if (generatingRef.current || loading) return;

    if (!formData.targetRole.trim()) {
      setError('Target role is required');
      return;
    }

    generatingRef.current = true;
    setLoading(true);
    setStep('generating');

    try {
      const skillsArray = formData.currentSkills
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const { data } = await api.post('/career/roadmap', {
        currentRole: formData.currentRole,
        targetRole: formData.targetRole,
        currentSkills: skillsArray,
        timeframe: formData.timeframe
      });

      setRoadmap(data);
      setStep('display');
      setExpandedPhases({}); // Collapse all initially
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate roadmap');
      setStep('form');
    } finally {
      generatingRef.current = false;
      setLoading(false);
    }
  }

  const togglePhase = (phaseNum) => {
    setExpandedPhases(prev => ({
      ...prev,
      [phaseNum]: !prev[phaseNum]
    }));
  };

  // ─────────────────────────────────────────────────────────────
  // FORM STEP
  // ─────────────────────────────────────────────────────────────
  if (step === 'form') {
    return (
      <div className="w-full py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="glass-card rounded-3xl p-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Career Roadmap</h1>
            <p className="text-slate-600 dark:text-slate-400 mb-8">
              Get a personalized 3-12 month plan to reach your career goals
            </p>

            <form onSubmit={handleGenerateRoadmap} className="space-y-6">
              {/* Current Role */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Current Role (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g., Junior Developer, Fresher, Intern"
                  value={formData.currentRole}
                  onChange={(e) => setFormData({ ...formData, currentRole: e.target.value })}
                  className="w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-2 text-on-surface focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Target Role */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Target Role *
                </label>
                <input
                  type="text"
                  placeholder="e.g., Senior Frontend Developer, Full Stack Engineer"
                  value={formData.targetRole}
                  onChange={(e) => setFormData({ ...formData, targetRole: e.target.value })}
                  className="w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-2 text-on-surface focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Current Skills */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Current Skills (comma-separated, optional)
                </label>
                <textarea
                  placeholder="e.g., React, Node.js, JavaScript, CSS"
                  value={formData.currentSkills}
                  onChange={(e) => setFormData({ ...formData, currentSkills: e.target.value })}
                  rows={3}
                  className="w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-2 text-on-surface focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Timeframe */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  How long do you have?
                </label>
                <select
                  value={formData.timeframe}
                  onChange={(e) => setFormData({ ...formData, timeframe: e.target.value })}
                  className="w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-2 text-on-surface focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="3months">3 months</option>
                  <option value="6months">6 months</option>
                  <option value="1year">1 year</option>
                </select>
              </div>

              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg"
              >
                {loading ? 'Generating...' : 'Generate My Roadmap'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // GENERATING STEP
  // ─────────────────────────────────────────────────────────────
  if (step === 'generating') {
    return (
      <div className="w-full py-12 px-4 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-600 mb-6 animate-spin">
            <Loader className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Generating Your Roadmap</h2>
          <p className="text-slate-600 dark:text-slate-400">Creating a personalized path to {formData.targetRole}...</p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // DISPLAY STEP
  // ─────────────────────────────────────────────────────────────
  if (!roadmap) return null;

  return (
    <div className="w-full py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-3">
            {roadmap.title}
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 mb-6">
            {roadmap.summary}
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div className="glass-card rounded-2xl p-4">
              <div className="text-sm text-slate-600 dark:text-slate-400">Estimated Hours</div>
              <div className="text-2xl font-bold text-blue-600">{roadmap.estimatedHours || 200}</div>
            </div>
            <div className="glass-card rounded-2xl p-4">
              <div className="text-sm text-slate-600 dark:text-slate-400">Phases</div>
              <div className="text-2xl font-bold text-blue-600">{roadmap.phases?.length || 3}</div>
            </div>
            <div className="glass-card rounded-2xl p-4">
              <div className="text-sm text-slate-600 dark:text-slate-400">Key Milestones</div>
              <div className="text-2xl font-bold text-blue-600">{roadmap.keyMetrics?.length || 4}</div>
            </div>
          </div>
        </div>

        {/* Phases Timeline */}
        <div className="space-y-4 mb-12">
          {roadmap.phases?.map((phase, idx) => (
            <div
              key={idx}
              className="glass-card rounded-3xl overflow-hidden"
            >
              <button
                onClick={() => togglePhase(idx)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <div className="flex items-center gap-4 text-left">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 font-semibold">
                      {phase.phase}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      {phase.title}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {phase.duration}
                    </p>
                  </div>
                </div>
                {expandedPhases[idx] ? (
                  <ChevronUp className="w-5 h-5 text-slate-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-500" />
                )}
              </button>

              {expandedPhases[idx] && (
                <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 space-y-4">
                  <p className="text-slate-700 dark:text-slate-300">{phase.description}</p>

                  {phase.goals && phase.goals.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Goals</h4>
                      <ul className="space-y-1">
                        {phase.goals.map((goal, i) => (
                          <li key={i} className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                            {goal}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {phase.skills && phase.skills.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Skills to Learn</h4>
                      <div className="flex flex-wrap gap-2">
                        {phase.skills.map((skill, i) => (
                          <span
                            key={i}
                            className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full text-sm"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {phase.projects && phase.projects.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Projects</h4>
                      <ul className="space-y-2">
                        {phase.projects.map((project, i) => (
                          <li key={i} className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                            <p className="font-medium text-slate-900 dark:text-white">{project.name}</p>
                            <p className="text-sm text-slate-600 dark:text-slate-400">{project.description}</p>
                            <span className="inline-block mt-1 text-xs px-2 py-1 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 rounded">
                              {project.difficulty}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {phase.resources && phase.resources.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Resources</h4>
                      <ul className="space-y-1">
                        {phase.resources.map((resource, i) => (
                          <li key={i} className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                            <ExternalLink className="w-4 h-4 flex-shrink-0" />
                            <span className="text-sm">{resource.title}</span>
                            <span className="text-xs px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded">
                              {resource.type}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Tips & Metrics */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {roadmap.tips && roadmap.tips.length > 0 && (
            <div className="glass-card rounded-3xl p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">💡 Tips for Success</h3>
              <ul className="space-y-2">
                {roadmap.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                    <span className="text-yellow-500 flex-shrink-0">→</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {roadmap.keyMetrics && roadmap.keyMetrics.length > 0 && (
            <div className="glass-card rounded-3xl p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">📊 Track Progress</h3>
              <ul className="space-y-2">
                {roadmap.keyMetrics.map((metric, i) => (
                  <li key={i} className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <input type="checkbox" className="w-4 h-4 rounded border-slate-300" />
                    {metric}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <button
          onClick={() => { setStep('form'); setError(''); }}
          className="w-full glass-card hover:bg-white/40 text-on-surface font-bold py-3 px-4 rounded-2xl transition-all"
        >
          Generate New Roadmap
        </button>
      </div>
    </div>
  );
}
