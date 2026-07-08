import React, { useState, useEffect } from 'react';
import { api } from '../store/useAuthStore';
import { RadialBarChart, RadialBar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { Sparkles, Target, TrendingUp, Calendar, ChevronDown, ChevronRight, CheckCircle2, Clock, RefreshCw, GitCompare } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TARGET_ROLES = [
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'Data Scientist',
  'Machine Learning Engineer',
  'DevOps Engineer',
  'Mobile Developer',
  'Cloud Architect',
  'Cybersecurity Analyst',
  'Product Manager',
];

const CURRENT_LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const SCORE_LABELS = {
  technicalSkills: 'Technical Skills',
  projectsPortfolio: 'Projects & Portfolio',
  resumeProfile: 'Resume & Profile',
  interviewReadiness: 'Interview Readiness',
  communication: 'Communication',
};

const SCORE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9'];

function getScoreColor(score) {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#0ea5e9';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

function getPriorityColor(priority) {
  if (priority === 'High') return 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/30';
  if (priority === 'Medium') return 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30';
  return 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30';
}

// ─────────────────────────────────────────────────────────────────────────────
// Accordion Component
// ─────────────────────────────────────────────────────────────────────────────

function Accordion({ title, icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <span className="material-symbols-outlined text-slate-500 dark:text-slate-400">{icon}</span>
        <span className="font-bold text-slate-900 dark:text-white flex-1">{title}</span>
        {open ? <ChevronDown className="w-5 h-5 text-slate-500 dark:text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-500 dark:text-slate-400" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-slate-200 dark:border-slate-800">{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AICareerCoach() {
  const [targetRole, setTargetRole] = useState('Full Stack Developer');
  const [currentLevel, setCurrentLevel] = useState('beginner');
  const [activeTab, setActiveTab] = useState('overview');

  // Data states
  const [score, setScore] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [skillGaps, setSkillGaps] = useState([]);
  const [careerPlan, setCareerPlan] = useState(null);
  const [comparison, setComparison] = useState(null);

  // Compare roles
  const [compareRole1, setCompareRole1] = useState('Frontend Developer');
  const [compareRole2, setCompareRole2] = useState('Backend Developer');

  // Loading states
  const [loadingScore, setLoadingScore] = useState(false);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [loadingGaps, setLoadingGaps] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [generating, setGenerating] = useState(false);

  // ── Fetch career score on mount ──────────────────────────────────────────
  useEffect(() => {
    fetchScore();
  }, []);

  async function fetchScore() {
    setLoadingScore(true);
    try {
      const { data } = await api.get('/api/ai-coach/career-score');
      setScore(data);
    } catch (err) {
      console.error('Failed to fetch career score:', err);
    } finally {
      setLoadingScore(false);
    }
  }

  async function fetchRecommendations() {
    setLoadingRecs(true);
    try {
      const { data } = await api.post('/api/ai-coach/recommendations', { targetRole });
      setRecommendations(data.recommendations || []);
    } catch (err) {
      console.error('Failed to fetch recommendations:', err);
    } finally {
      setLoadingRecs(false);
    }
  }

  async function fetchSkillGaps() {
    setLoadingGaps(true);
    try {
      const { data } = await api.post('/api/ai-coach/skill-gap', {
        targetRole,
        currentSkills: [],
      });
      setSkillGaps(data.gaps || []);
    } catch (err) {
      console.error('Failed to fetch skill gaps:', err);
    } finally {
      setLoadingGaps(false);
    }
  }

  async function fetchCareerPlan() {
    setLoadingPlan(true);
    try {
      const { data } = await api.post('/api/ai-coach/career-plan', {
        targetRole,
        currentLevel,
      });
      setCareerPlan(data.plan || null);
    } catch (err) {
      console.error('Failed to fetch career plan:', err);
    } finally {
      setLoadingPlan(false);
    }
  }

  async function fetchComparison() {
    if (compareRole1 === compareRole2) return;
    setLoadingCompare(true);
    try {
      const { data } = await api.post('/api/ai-coach/compare-roles', {
        role1: compareRole1,
        role2: compareRole2,
      });
      setComparison(data.comparison || null);
    } catch (err) {
      console.error('Failed to compare roles:', err);
    } finally {
      setLoadingCompare(false);
    }
  }

  async function generateFullAnalysis() {
    setGenerating(true);
    try {
      await Promise.all([
        fetchScore(),
        fetchRecommendations(),
        fetchSkillGaps(),
        fetchCareerPlan(),
      ]);
    } finally {
      setGenerating(false);
    }
  }

  function toggleRecommendationDone(id) {
    setRecommendations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, done: !r.done } : r))
    );
  }

  // ── Radial chart data ────────────────────────────────────────────────────
  const radialData = score
    ? [{ name: 'Score', value: score.overall, fill: getScoreColor(score.overall) }]
    : [{ name: 'Score', value: 0, fill: '#64748b' }];

  const breakdownData = score
    ? Object.entries(score.breakdown).map(([key, val], i) => ({
        name: SCORE_LABELS[key] || key,
        score: val.score,
        weight: val.weight,
        fill: SCORE_COLORS[i % SCORE_COLORS.length],
      }))
    : [];

  // ── Skill gap chart data ─────────────────────────────────────────────────
  const gapChartData = skillGaps.map((g) => ({
    name: g.skill,
    current: g.currentLevel,
    required: g.requiredLevel,
  }));

  const TABS = [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'recommendations', label: 'Recommendations', icon: 'task_alt' },
    { id: 'skills', label: 'Skill Gaps', icon: 'equalizer' },
    { id: 'timeline', label: 'Career Plan', icon: 'timeline' },
    { id: 'compare', label: 'Compare Roles', icon: 'compare_arrows' },
  ];

  return (
    <div className="page-container">
      <div className="space-y-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="page-header-icon bg-indigo-100 dark:bg-indigo-500/20">
              <Sparkles className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="page-title">AI Career Coach</h1>
              <p className="page-subtitle !mt-1">
                Personalized career guidance powered by AI
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              className="input-field !w-auto"
            >
              {TARGET_ROLES.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>

            <button
              onClick={generateFullAnalysis}
              disabled={generating}
              className="btn-primary !bg-indigo-600 hover:!bg-indigo-500"
            >
              <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
              {generating ? 'Analyzing...' : 'Generate Analysis'}
            </button>
          </div>
        </div>

        {/* ── Tab Navigation ──────────────────────────────────────────────── */}
        <div className="tab-bar !w-full overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === 'recommendations' && recommendations.length === 0) fetchRecommendations();
                if (tab.id === 'skills' && skillGaps.length === 0) fetchSkillGaps();
                if (tab.id === 'timeline' && !careerPlan) fetchCareerPlan();
              }}
              className={`flex items-center gap-2 whitespace-nowrap ${
                activeTab === tab.id ? 'tab-active' : 'tab-inactive'
              }`}
            >
              <span className="material-symbols-outlined text-lg">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Overview Tab ────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Career Readiness Score */}
            <div className="lg:col-span-1 card rounded-2xl p-6 flex flex-col items-center">
              <h2 className="font-bold text-slate-900 dark:text-white text-lg mb-4">Career Readiness Score</h2>
              {loadingScore ? (
                <div className="flex items-center justify-center h-48">
                  <span className="material-symbols-outlined text-indigo-500 dark:text-indigo-400 text-4xl animate-spin">sync</span>
                </div>
              ) : (
                <>
                  <div className="w-48 h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadialBarChart
                        cx="50%"
                        cy="50%"
                        innerRadius="70%"
                        outerRadius="100%"
                        barSize={14}
                        data={radialData}
                        startAngle={90}
                        endAngle={-270}
                      >
                        <RadialBar
                          background={{ fill: '#1e293b' }}
                          dataKey="value"
                          cornerRadius={10}
                        />
                      </RadialBarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="text-center -mt-28 mb-16">
                    <span className="text-5xl font-extrabold text-slate-900 dark:text-white">{score?.overall || 0}</span>
                    <span className="text-slate-500 dark:text-slate-400 text-sm block mt-1">/ 100</span>
                  </div>
                </>
              )}
            </div>

            {/* Score Breakdown */}
            <div className="lg:col-span-2 card rounded-2xl p-6">
              <h2 className="font-bold text-slate-900 dark:text-white text-lg mb-4">Score Breakdown</h2>
              {loadingScore ? (
                <div className="flex items-center justify-center h-48">
                  <span className="material-symbols-outlined text-indigo-500 dark:text-indigo-400 text-4xl animate-spin">sync</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {breakdownData.map((item, i) => (
                    <div key={item.name} className="flex items-center gap-4">
                      <div className="w-40 text-sm text-slate-500 dark:text-slate-400 font-medium truncate">
                        {item.name}
                      </div>
                      <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${item.score}%`, backgroundColor: item.fill }}
                        />
                      </div>
                      <div className="w-12 text-right text-sm font-bold" style={{ color: item.fill }}>
                        {item.score}
                      </div>
                      <div className="w-14 text-right text-xs text-slate-500 dark:text-slate-400">
                        {item.weight}% wt
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Recommendations Tab ─────────────────────────────────────────── */}
        {activeTab === 'recommendations' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="section-title">
                <Target className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                Weekly Recommendations
              </h2>
              <button
                onClick={fetchRecommendations}
                disabled={loadingRecs}
                className="btn-secondary !px-4 !py-2 text-sm"
              >
                <RefreshCw className={`w-4 h-4 ${loadingRecs ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {loadingRecs ? (
              <div className="card rounded-2xl p-12 flex items-center justify-center">
                <span className="material-symbols-outlined text-indigo-500 dark:text-indigo-400 text-4xl animate-spin">sync</span>
                <span className="ml-3 text-slate-500 dark:text-slate-400 font-medium">Generating recommendations...</span>
              </div>
            ) : recommendations.length === 0 ? (
              <div className="card rounded-2xl p-12 text-center">
                <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-5xl mb-3">lightbulb</span>
                <p className="text-slate-500 dark:text-slate-400">Click "Generate Analysis" to get personalized recommendations.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className={`card rounded-2xl p-5 flex items-start gap-4 transition-all ${
                      rec.done ? 'opacity-60' : ''
                    }`}
                  >
                    <button
                      onClick={() => toggleRecommendationDone(rec.id)}
                      className="mt-0.5 flex-shrink-0"
                    >
                      {rec.done ? (
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />
                      ) : (
                        <div className="w-6 h-6 rounded-full border-2 border-slate-300 dark:border-slate-600 hover:border-indigo-400 transition-colors" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className={`font-bold text-slate-900 dark:text-white ${rec.done ? 'line-through' : ''}`}>
                          {rec.title}
                        </h3>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${getPriorityColor(rec.priority)}`}>
                          {rec.priority}
                        </span>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 text-sm mb-2">{rec.description}</p>
                      <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {rec.estimatedTime}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">category</span>
                          {rec.skillArea}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Skill Gaps Tab ──────────────────────────────────────────────── */}
        {activeTab === 'skills' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="section-title">
                <TrendingUp className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                Skill Gap Analysis
              </h2>
              <div className="flex items-center gap-3">
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  className="input-field !w-auto"
                >
                  {TARGET_ROLES.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
                <button
                  onClick={fetchSkillGaps}
                  disabled={loadingGaps}
                  className="btn-secondary !px-4 !py-2 text-sm"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingGaps ? 'animate-spin' : ''}`} />
                  Analyze
                </button>
              </div>
            </div>

            {loadingGaps ? (
              <div className="card rounded-2xl p-12 flex items-center justify-center">
                <span className="material-symbols-outlined text-indigo-500 dark:text-indigo-400 text-4xl animate-spin">sync</span>
                <span className="ml-3 text-slate-500 dark:text-slate-400 font-medium">Analyzing skill gaps...</span>
              </div>
            ) : skillGaps.length === 0 ? (
              <div className="card rounded-2xl p-12 text-center">
                <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-5xl mb-3">equalizer</span>
                <p className="text-slate-500 dark:text-slate-400">Select a target role and click "Analyze" to see your skill gaps.</p>
              </div>
            ) : (
              <>
                {/* Horizontal bar chart */}
                <div className="card rounded-2xl p-6">
                  <div className="flex items-center gap-6 mb-4 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-indigo-500" />
                      <span className="text-slate-500 dark:text-slate-400">Your Skills</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-rose-400" />
                      <span className="text-slate-500 dark:text-slate-400">Target Requirements</span>
                    </div>
                  </div>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={gapChartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                        <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                        <YAxis dataKey="name" type="category" width={120} tick={{ fill: '#cbd5e1', fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px' }}
                          labelStyle={{ color: '#e2e8f0' }}
                        />
                        <Bar dataKey="current" name="Your Level" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={12} />
                        <Bar dataKey="required" name="Required" fill="#fb7185" radius={[0, 4, 4, 0]} barSize={12} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Gap detail cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {skillGaps.map((gap, i) => {
                    const diff = gap.requiredLevel - gap.currentLevel;
                    const urgent = diff > 40;
                    return (
                      <div key={i} className="card rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-bold text-slate-900 dark:text-white">{gap.skill}</h3>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                            urgent ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400' : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400'
                          }`}>
                            Gap: {diff > 0 ? `+${diff}` : diff}
                          </span>
                        </div>
                        <div className="flex gap-4 mb-3 text-sm">
                          <div>
                            <span className="text-slate-500 dark:text-slate-400">Current: </span>
                            <span className="font-bold text-indigo-600 dark:text-indigo-400">{gap.currentLevel}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-slate-400">Required: </span>
                            <span className="font-bold text-rose-600 dark:text-rose-400">{gap.requiredLevel}</span>
                          </div>
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">{gap.recommendation}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Career Plan / Timeline Tab ──────────────────────────────────── */}
        {activeTab === 'timeline' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="section-title">
                <Calendar className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                Career Timeline & Action Plan
              </h2>
              <div className="flex items-center gap-3">
                <select
                  value={currentLevel}
                  onChange={(e) => setCurrentLevel(e.target.value)}
                  className="input-field !w-auto"
                >
                  {CURRENT_LEVELS.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
                <button
                  onClick={fetchCareerPlan}
                  disabled={loadingPlan}
                  className="btn-secondary !px-4 !py-2 text-sm"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingPlan ? 'animate-spin' : ''}`} />
                  Generate Plan
                </button>
              </div>
            </div>

            {loadingPlan ? (
              <div className="card rounded-2xl p-12 flex items-center justify-center">
                <span className="material-symbols-outlined text-indigo-500 dark:text-indigo-400 text-4xl animate-spin">sync</span>
                <span className="ml-3 text-slate-500 dark:text-slate-400 font-medium">Generating career plan...</span>
              </div>
            ) : !careerPlan ? (
              <div className="card rounded-2xl p-12 text-center">
                <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-5xl mb-3">timeline</span>
                <p className="text-slate-500 dark:text-slate-400">Click "Generate Plan" to create your personalized career timeline.</p>
              </div>
            ) : (
              <>
                {/* Vertical Timeline */}
                <div className="relative">
                  <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />
                  <div className="space-y-6">
                    {(careerPlan.timeline || []).map((phase, i) => (
                      <div key={i} className="relative pl-16">
                        {/* Timeline dot */}
                        <div className="absolute left-4 w-5 h-5 rounded-full border-2 border-indigo-500 bg-white dark:bg-slate-900 flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-indigo-400" />
                        </div>

                        <div className="card rounded-2xl p-5">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30">
                              Month {phase.month}
                            </span>
                            <h3 className="font-bold text-slate-900 dark:text-white">{phase.title}</h3>
                          </div>
                          <p className="text-slate-500 dark:text-slate-400 text-sm mb-3">{phase.description}</p>
                          <div className="flex flex-wrap gap-2 mb-2">
                            {(phase.tasks || []).map((task, j) => (
                              <span key={j} className="text-xs bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                                {task}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Milestone: {phase.milestone}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Plan Accordions */}
                <div className="space-y-3">
                  <Accordion title="Short-term Goals (This Week)" icon="sprint" defaultOpen={true}>
                    <ul className="space-y-2 mt-3">
                      {(careerPlan.shortTerm || []).map((goal, i) => (
                        <li key={i} className="flex items-start gap-2 text-slate-600 dark:text-slate-400 text-sm">
                          <ChevronRight className="w-4 h-4 text-indigo-500 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
                          {goal}
                        </li>
                      ))}
                    </ul>
                  </Accordion>

                  <Accordion title="Medium-term Goals (This Month)" icon="calendar_month">
                    <ul className="space-y-2 mt-3">
                      {(careerPlan.mediumTerm || []).map((goal, i) => (
                        <li key={i} className="flex items-start gap-2 text-slate-600 dark:text-slate-400 text-sm">
                          <ChevronRight className="w-4 h-4 text-amber-500 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                          {goal}
                        </li>
                      ))}
                    </ul>
                  </Accordion>

                  <Accordion title="Long-term Goals (This Quarter)" icon="event_note">
                    <ul className="space-y-2 mt-3">
                      {(careerPlan.longTerm || []).map((goal, i) => (
                        <li key={i} className="flex items-start gap-2 text-slate-600 dark:text-slate-400 text-sm">
                          <ChevronRight className="w-4 h-4 text-emerald-500 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                          {goal}
                        </li>
                      ))}
                    </ul>
                  </Accordion>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Compare Roles Tab ───────────────────────────────────────────── */}
        {activeTab === 'compare' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <h2 className="section-title">
                <GitCompare className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                Compare Career Paths
              </h2>
              <div className="flex items-center gap-3 flex-wrap">
                <select
                  value={compareRole1}
                  onChange={(e) => setCompareRole1(e.target.value)}
                  className="input-field !w-auto"
                >
                  {TARGET_ROLES.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
                <span className="text-slate-500 dark:text-slate-400 font-bold">vs</span>
                <select
                  value={compareRole2}
                  onChange={(e) => setCompareRole2(e.target.value)}
                  className="input-field !w-auto"
                >
                  {TARGET_ROLES.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
                <button
                  onClick={fetchComparison}
                  disabled={loadingCompare || compareRole1 === compareRole2}
                  className="btn-primary !bg-indigo-600 hover:!bg-indigo-500"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingCompare ? 'animate-spin' : ''}`} />
                  Compare
                </button>
              </div>
            </div>

            {compareRole1 === compareRole2 && (
              <div className="card rounded-2xl border-amber-200 dark:border-amber-500/30 p-4 text-amber-700 dark:text-amber-400 text-sm font-medium">
                Please select two different roles to compare.
              </div>
            )}

            {loadingCompare ? (
              <div className="card rounded-2xl p-12 flex items-center justify-center">
                <span className="material-symbols-outlined text-indigo-500 dark:text-indigo-400 text-4xl animate-spin">sync</span>
                <span className="ml-3 text-slate-500 dark:text-slate-400 font-medium">Comparing roles...</span>
              </div>
            ) : comparison ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[comparison.role1, comparison.role2].map((role, idx) => (
                    <div key={idx} className="card rounded-2xl p-6">
                      <h3 className="font-bold text-slate-900 dark:text-white text-lg mb-4 flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${idx === 0 ? 'bg-indigo-500' : 'bg-emerald-500'}`} />
                        {role.name}
                      </h3>
                      <div className="space-y-3">
                        {[
                          { label: 'Avg. Salary', value: role.avgSalary, icon: 'payments' },
                          { label: 'Demand', value: role.demandLevel, icon: 'trending_up' },
                          { label: 'Growth Rate', value: role.growthRate, icon: 'show_chart' },
                          { label: 'Entry Barrier', value: role.entryBarrier, icon: 'lock' },
                          { label: 'Remote Work', value: role.remoteOpportunities, icon: 'home_work' },
                        ].map((item) => (
                          <div key={item.label} className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                              <span className="material-symbols-outlined text-lg">{item.icon}</span>
                              {item.label}
                            </div>
                            <span className="font-bold text-slate-900 dark:text-white text-sm">{item.value}</span>
                          </div>
                        ))}
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Key Skills</span>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {(role.keySkills || []).map((skill, j) => (
                              <span key={j} className="text-xs bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {comparison.recommendation && (
                  <div className="card rounded-2xl border-indigo-200 dark:border-indigo-500/20 p-5">
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-indigo-500 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-1">AI Recommendation</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">{comparison.recommendation}</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="card rounded-2xl p-12 text-center">
                <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-5xl mb-3">compare_arrows</span>
                <p className="text-slate-500 dark:text-slate-400">Select two roles and click "Compare" to see a side-by-side analysis.</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
