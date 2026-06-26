import { useState, useEffect } from 'react';
import { Loader2, ChevronDown, ChevronUp, ArrowLeft, Search, Filter } from 'lucide-react';
import { api } from '../store/useAuthStore';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STATUSES = ['Planning', 'In Progress', 'Completed', 'Showcased'];

const STATUS_STYLES = {
  Planning: 'bg-sky-500/10 text-sky-600 border-sky-500/30',
  'In Progress': 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  Completed: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  Showcased: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
};

const STATUS_ICONS = {
  Planning: 'edit_note',
  'In Progress': 'pending',
  Completed: 'check_circle',
  Showcased: 'star',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getProgress(tasks) {
  if (!tasks?.length) return 0;
  const done = tasks.filter((t) => t.done).length;
  return Math.round((done / tasks.length) * 100);
}

function getAllTechFromPlan(plan) {
  if (!plan?.techStack) return [];
  const ts = plan.techStack;
  return [...(ts.frontend || []), ...(ts.backend || []), ...(ts.database || []), ...(ts.tools || [])];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ProjectWorkspace() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterTech, setFilterTech] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [expandedMilestones, setExpandedMilestones] = useState({});

  // ── Load projects ─────────────────────────────────────────────────────────

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    setLoading(true);
    try {
      const { data } = await api.get('/project-builder/workspace');
      const parsed = (data.projects || []).map((p) => ({
        ...p,
        plan: typeof p.plan === 'string' ? JSON.parse(p.plan) : p.plan,
        tasks: typeof p.tasks === 'string' ? JSON.parse(p.tasks) : p.tasks || [],
      }));
      setProjects(parsed);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  }

  // ── Update helpers ────────────────────────────────────────────────────────

  async function updateProject(id, updates) {
    setSavingId(id);
    try {
      const { data } = await api.put(`/project-builder/workspace/${id}`, updates);
      const updated = data.project;
      if (typeof updated.plan === 'string') updated.plan = JSON.parse(updated.plan);
      if (typeof updated.tasks === 'string') updated.tasks = JSON.parse(updated.tasks);

      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
      if (selectedProject?.id === id) {
        setSelectedProject((prev) => ({ ...prev, ...updated }));
      }
    } catch (err) {
      console.error('Failed to update project:', err);
    } finally {
      setSavingId(null);
    }
  }

  function toggleTask(taskId) {
    if (!selectedProject) return;
    const updated = selectedProject.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t));
    setSelectedProject((prev) => ({ ...prev, tasks: updated }));
    updateProject(selectedProject.id, { tasks: updated });
  }

  function updateNotes(notes) {
    if (!selectedProject) return;
    setSelectedProject((prev) => ({ ...prev, notes }));
  }

  function saveNotes() {
    if (!selectedProject) return;
    updateProject(selectedProject.id, { notes: selectedProject.notes });
  }

  function updateStatus(newStatus) {
    if (!selectedProject) return;
    setSelectedProject((prev) => ({ ...prev, status: newStatus }));
    updateProject(selectedProject.id, { status: newStatus });
  }

  // ── Filtering ─────────────────────────────────────────────────────────────

  const allTechs = [...new Set(projects.flatMap((p) => getAllTechFromPlan(p.plan)))].sort();

  const filtered = projects.filter((p) => {
    if (filterStatus !== 'All' && p.status !== filterStatus) return false;
    if (filterTech && !getAllTechFromPlan(p.plan).includes(filterTech)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const nameMatch = p.name?.toLowerCase().includes(q);
      const descMatch = p.plan?.description?.toLowerCase().includes(q);
      if (!nameMatch && !descMatch) return false;
    }
    return true;
  });

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = {
    total: projects.length,
    inProgress: projects.filter((p) => p.status === 'In Progress').length,
    completed: projects.filter((p) => p.status === 'Completed' || p.status === 'Showcased').length,
  };

  // ── Render: Loading ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // ── Render: Project Detail ────────────────────────────────────────────────

  if (selectedProject) {
    const proj = selectedProject;
    const plan = proj.plan || {};
    const tech = getAllTechFromPlan(plan);
    const progress = getProgress(proj.tasks);
    const steps = plan.implementationSteps || [];

    // Group tasks by step
    const tasksByStep = {};
    (proj.tasks || []).forEach((t) => {
      const key = t.step || 0;
      if (!tasksByStep[key]) tasksByStep[key] = [];
      tasksByStep[key].push(t);
    });

    return (
      <div className="w-full py-8 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Back Button */}
          <button
            onClick={() => setSelectedProject(null)}
            className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-on-surface mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Projects
          </button>

          {/* Overview Card */}
          <div className="glass-card rounded-3xl p-6 mb-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-on-surface">{proj.name}</h2>
                <p className="text-on-surface-variant mt-1">{plan.description}</p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {tech.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 border border-blue-500/20">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <select
                  value={proj.status}
                  onChange={(e) => updateStatus(e.target.value)}
                  className="bg-surface-container border border-outline/20 rounded-xl px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-on-surface-variant mb-1">
                <span>Progress</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          {/* Tasks / Checklist */}
          <div className="glass-card rounded-3xl p-6 mb-6">
            <h3 className="text-lg font-bold text-on-surface mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-500">checklist</span>
              Tasks
              <span className="text-xs text-on-surface-variant font-normal ml-1">
                ({(proj.tasks || []).filter((t) => t.done).length}/{(proj.tasks || []).length})
              </span>
            </h3>

            {steps.length > 0 ? (
              <div className="space-y-3">
                {steps.map((step) => {
                  const stepTasks = tasksByStep[step.step] || [];
                  const stepDone = stepTasks.filter((t) => t.done).length;
                  const isExpanded = expandedMilestones[step.step] !== false;

                  return (
                    <div key={step.step} className="bg-surface-container/50 rounded-xl border border-outline/10 overflow-hidden">
                      <button
                        onClick={() =>
                          setExpandedMilestones((prev) => ({
                            ...prev,
                            [step.step]: !isExpanded,
                          }))
                        }
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface-container/80 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-blue-600/10 text-blue-600 text-xs font-bold flex items-center justify-center">
                            {step.step}
                          </span>
                          <span className="text-sm font-semibold text-on-surface">{step.title}</span>
                          <span className="text-xs text-on-surface-variant">
                            ({stepDone}/{stepTasks.length})
                          </span>
                        </div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-on-surface-variant" /> : <ChevronDown className="w-4 h-4 text-on-surface-variant" />}
                      </button>
                      {isExpanded && stepTasks.length > 0 && (
                        <div className="px-4 pb-3 space-y-1.5">
                          {stepTasks.map((task) => (
                            <label
                              key={task.id}
                              className="flex items-start gap-2.5 cursor-pointer group"
                            >
                              <input
                                type="checkbox"
                                checked={task.done}
                                onChange={() => toggleTask(task.id)}
                                className="mt-1 w-4 h-4 rounded border-outline/30 text-blue-600 focus:ring-blue-500"
                              />
                              <span className={`text-sm transition-all ${task.done ? 'line-through text-on-surface-variant/50' : 'text-on-surface'}`}>
                                {task.text}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (proj.tasks || []).length > 0 ? (
              <div className="space-y-1.5">
                {proj.tasks.map((task) => (
                  <label key={task.id} className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={() => toggleTask(task.id)}
                      className="mt-1 w-4 h-4 rounded border-outline/30 text-blue-600 focus:ring-blue-500"
                    />
                    <span className={`text-sm ${task.done ? 'line-through text-on-surface-variant/50' : 'text-on-surface'}`}>
                      {task.text}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant text-center py-4">No tasks yet. Generate a project plan first.</p>
            )}
          </div>

          {/* Notes */}
          <div className="glass-card rounded-3xl p-6 mb-6">
            <h3 className="text-lg font-bold text-on-surface mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-500">sticky_note_2</span>
              Notes
            </h3>
            <textarea
              value={proj.notes || ''}
              onChange={(e) => updateNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Add notes, ideas, or reminders for this project..."
              rows={5}
              className="w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-3 text-on-surface text-sm placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
            {savingId === proj.id && (
              <p className="text-xs text-on-surface-variant mt-1 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Saving...
              </p>
            )}
          </div>

          {/* Team Members (Placeholder) */}
          <div className="glass-card rounded-3xl p-6 mb-6">
            <h3 className="text-lg font-bold text-on-surface mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-sky-500">group</span>
              Team Members
            </h3>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                You
              </div>
              <div>
                <p className="text-sm font-semibold text-on-surface">You (Owner)</p>
                <p className="text-xs text-on-surface-variant">Solo project</p>
              </div>
            </div>
            <p className="text-xs text-on-surface-variant mt-3 bg-surface-container/50 rounded-lg p-2 border border-outline/10">
              Team collaboration features coming soon. For now, you can share your project plan by exporting it.
            </p>
          </div>

          {/* Timeline / Milestones */}
          {steps.length > 0 && (
            <div className="glass-card rounded-3xl p-6">
              <h3 className="text-lg font-bold text-on-surface mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-purple-500">timeline</span>
                Milestones
              </h3>
              <div className="relative">
                <div className="absolute left-5 top-2 bottom-2 w-0.5 bg-outline/20" />
                <div className="space-y-4">
                  {steps.map((step) => {
                    const stepTasks = tasksByStep[step.step] || [];
                    const allDone = stepTasks.length > 0 && stepTasks.every((t) => t.done);
                    const someDone = stepTasks.some((t) => t.done);

                    return (
                      <div key={step.step} className="relative pl-12">
                        <div
                          className={`absolute left-2.5 top-1 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center ${
                            allDone
                              ? 'bg-emerald-500 text-white'
                              : someDone
                              ? 'bg-amber-500 text-white'
                              : 'bg-surface-container border-2 border-outline/30 text-on-surface-variant'
                          }`}
                        >
                          {allDone ? (
                            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check</span>
                          ) : (
                            step.step
                          )}
                        </div>
                        <div>
                          <h4 className={`text-sm font-semibold ${allDone ? 'text-emerald-600' : 'text-on-surface'}`}>
                            {step.title}
                          </h4>
                          <p className="text-xs text-on-surface-variant">{step.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Render: Project List ──────────────────────────────────────────────────

  return (
    <div className="w-full py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-headline font-bold text-on-surface flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-emerald-500 text-3xl">workspaces</span>
            Project Workspace
          </h1>
          <p className="text-on-surface-variant mt-1">Manage and track your AI-generated projects</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Projects', value: stats.total, icon: 'folder', color: 'blue' },
            { label: 'In Progress', value: stats.inProgress, icon: 'pending', color: 'amber' },
            { label: 'Completed', value: stats.completed, icon: 'check_circle', color: 'emerald' },
          ].map((s) => (
            <div key={s.label} className="glass-card rounded-2xl p-4 text-center">
              <span className={`material-symbols-outlined text-${s.color}-500 text-2xl`}>{s.icon}</span>
              <p className="text-2xl font-bold text-on-surface mt-1">{s.value}</p>
              <p className="text-xs text-on-surface-variant">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Search & Filters */}
        <div className="glass-card rounded-2xl p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface-container border border-outline/20 rounded-xl pl-9 pr-4 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                showFilters || filterStatus !== 'All' || filterTech
                  ? 'bg-blue-600/10 text-blue-600 border-blue-500/30'
                  : 'bg-surface-container/50 text-on-surface-variant border-outline/20 hover:border-outline/40'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
            </button>
          </div>

          {showFilters && (
            <div className="mt-3 pt-3 border-t border-outline/10 flex flex-wrap gap-4">
              <div>
                <label className="text-xs font-semibold text-on-surface-variant mb-1 block">Status</label>
                <div className="flex flex-wrap gap-1.5">
                  {['All', ...STATUSES].map((s) => (
                    <button
                      key={s}
                      onClick={() => setFilterStatus(s)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                        filterStatus === s
                          ? 'bg-blue-600 text-white'
                          : 'bg-surface-container/50 text-on-surface-variant hover:bg-surface-container'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              {allTechs.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant mb-1 block">Tech Stack</label>
                  <select
                    value={filterTech}
                    onChange={(e) => setFilterTech(e.target.value)}
                    className="bg-surface-container border border-outline/20 rounded-lg px-2 py-1 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">All Tech</option>
                    {allTechs.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Project List */}
        {filtered.length === 0 ? (
          <div className="glass-card rounded-3xl p-12 text-center">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-4">inventory_2</span>
            <h3 className="text-lg font-bold text-on-surface mb-1">
              {projects.length === 0 ? 'No projects yet' : 'No matching projects'}
            </h3>
            <p className="text-sm text-on-surface-variant">
              {projects.length === 0
                ? 'Head to the AI Project Builder to create your first project plan.'
                : 'Try adjusting your filters or search query.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((proj) => {
              const tech = getAllTechFromPlan(proj.plan);
              const progress = getProgress(proj.tasks);

              return (
                <button
                  key={proj.id}
                  onClick={() => setSelectedProject(proj)}
                  className="w-full text-left glass-card rounded-2xl p-5 hover:ring-1 hover:ring-blue-500/30 transition-all group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-bold text-on-surface truncate group-hover:text-blue-600 transition-colors">
                          {proj.name}
                        </h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 ${STATUS_STYLES[proj.status] || STATUS_STYLES.Planning}`}>
                          <span className="material-symbols-outlined mr-0.5 align-middle" style={{ fontSize: '12px' }}>
                            {STATUS_ICONS[proj.status] || 'circle'}
                          </span>
                          {proj.status}
                        </span>
                      </div>
                      <p className="text-sm text-on-surface-variant line-clamp-1">
                        {proj.plan?.description || 'No description'}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {tech.slice(0, 5).map((t) => (
                          <span key={t} className="px-2 py-0.5 rounded-full text-xs bg-surface-container text-on-surface-variant">
                            {t}
                          </span>
                        ))}
                        {tech.length > 5 && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-surface-container text-on-surface-variant">
                            +{tech.length - 5}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-on-surface-variant">{formatDate(proj.updated_at)}</p>
                      {proj.tasks?.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-on-surface-variant mb-0.5">{progress}%</p>
                          <div className="w-16 h-1.5 bg-surface-container rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Showcase Section */}
        {projects.some((p) => p.status === 'Showcased' || p.status === 'Completed') && (
          <div className="mt-10">
            <h2 className="text-xl font-bold text-on-surface mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-purple-500">trophy</span>
              Showcase
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects
                .filter((p) => p.status === 'Showcased' || p.status === 'Completed')
                .map((proj) => {
                  const tech = getAllTechFromPlan(proj.plan);
                  return (
                    <div
                      key={proj.id}
                      onClick={() => setSelectedProject(proj)}
                      className="glass-card rounded-2xl p-5 cursor-pointer hover:ring-1 hover:ring-purple-500/30 transition-all"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="material-symbols-outlined text-purple-500" style={{ fontSize: '20px' }}>
                          {proj.status === 'Showcased' ? 'star' : 'check_circle'}
                        </span>
                        <h4 className="text-sm font-bold text-on-surface truncate">{proj.name}</h4>
                      </div>
                      <p className="text-xs text-on-surface-variant line-clamp-2 mb-3">
                        {proj.plan?.description || 'No description'}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {tech.slice(0, 3).map((t) => (
                          <span key={t} className="px-2 py-0.5 rounded-full text-xs bg-purple-500/10 text-purple-600">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
