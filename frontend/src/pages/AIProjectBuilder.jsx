import { useState, useRef } from 'react';
import { Loader2, ChevronLeft, ChevronRight, Download, Save, Copy, Check, Sparkles } from 'lucide-react';
import { api } from '../store/useAuthStore';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TEMPLATES = [
  { id: 'todo', name: 'Todo App', icon: 'checklist' },
  { id: 'ecommerce', name: 'E-commerce', icon: 'shopping_cart' },
  { id: 'blog', name: 'Blog', icon: 'edit_note' },
  { id: 'social', name: 'Social Media', icon: 'group' },
  { id: 'portfolio', name: 'Portfolio', icon: 'web' },
  { id: 'dashboard', name: 'Dashboard', icon: 'dashboard' },
  { id: 'chat', name: 'Chat App', icon: 'chat' },
  { id: 'api', name: 'REST API', icon: 'api' },
];

const DIFFICULTIES = [
  { value: 'Beginner', label: 'Beginner', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  { value: 'Intermediate', label: 'Intermediate', color: 'bg-sky-500/10 text-sky-600 border-sky-500/30' },
  { value: 'Advanced', label: 'Advanced', color: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  { value: 'Industry-Level', label: 'Industry-Level', color: 'bg-rose-500/10 text-rose-600 border-rose-500/30' },
];

const DEPLOY_PLATFORMS = ['vercel', 'railway', 'render'];

const METHOD_COLORS = {
  GET: 'bg-emerald-500/10 text-emerald-600',
  POST: 'bg-sky-500/10 text-sky-600',
  PUT: 'bg-amber-500/10 text-amber-600',
  DELETE: 'bg-rose-500/10 text-rose-600',
  PATCH: 'bg-purple-500/10 text-purple-600',
};

const PRIORITY_COLORS = {
  High: 'bg-rose-500/10 text-rose-600 border-rose-500/30',
  Medium: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  Low: 'bg-slate-500/10 text-slate-600 border-slate-500/30',
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AIProjectBuilder() {
  const [currentStep, setCurrentStep] = useState(0);
  const [description, setDescription] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [difficulty, setDifficulty] = useState('Intermediate');
  const [plan, setPlan] = useState(null);
  const [readme, setReadme] = useState('');
  const [deployGuide, setDeployGuide] = useState(null);
  const [deployPlatform, setDeployPlatform] = useState('vercel');
  const [loading, setLoading] = useState(false);
  const [readmeLoading, setReadmeLoading] = useState(false);
  const [deployLoading, setDeployLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const generatingRef = useRef(false);

  const STEPS = [
    { label: 'Describe', icon: 'lightbulb' },
    { label: 'Plan', icon: 'architecture' },
    { label: 'Build Guide', icon: 'construction' },
    { label: 'README', icon: 'description' },
    { label: 'Deploy', icon: 'rocket_launch' },
  ];

  // ── API Calls ─────────────────────────────────────────────────────────────

  async function generatePlan() {
    if (generatingRef.current || loading) return;
    if (!description.trim() && !selectedTemplate) {
      setError('Please describe your project or select a template.');
      return;
    }

    setError('');
    generatingRef.current = true;
    setLoading(true);

    try {
      const { data } = await api.post('/project-builder/generate', {
        description: description.trim(),
        difficulty,
        template: selectedTemplate,
      });
      setPlan(data.plan);
      setCurrentStep(1);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate project plan.');
    } finally {
      generatingRef.current = false;
      setLoading(false);
    }
  }

  async function generateReadme() {
    if (readmeLoading || !plan) return;
    setReadmeLoading(true);
    try {
      const { data } = await api.post('/project-builder/readme', { projectPlan: plan });
      setReadme(data.readme);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate README.');
    } finally {
      setReadmeLoading(false);
    }
  }

  async function generateDeployGuide(platform) {
    if (deployLoading || !plan) return;
    setDeployPlatform(platform);
    setDeployLoading(true);
    try {
      const { data } = await api.post('/project-builder/deployment', {
        projectPlan: plan,
        platform,
      });
      setDeployGuide(data.guide);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate deployment guide.');
    } finally {
      setDeployLoading(false);
    }
  }

  async function saveProject() {
    if (saving || !plan) return;
    setSaving(true);
    try {
      const tasks = (plan.implementationSteps || []).flatMap((s) =>
        (s.tasks || []).map((t, i) => ({
          id: `${s.step}-${i}`,
          text: t,
          done: false,
          step: s.step,
        }))
      );
      await api.post('/project-builder/workspace', {
        name: plan.name,
        plan,
        status: 'Planning',
        tasks,
        notes: '',
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save project.');
    } finally {
      setSaving(false);
    }
  }

  function exportAsText() {
    if (!plan) return;
    const lines = [];
    lines.push(`# ${plan.name}`);
    lines.push(`${plan.description}\n`);
    lines.push(`## Difficulty: ${plan.difficulty || difficulty}\n`);
    lines.push(`## Tech Stack`);
    const ts = plan.techStack || {};
    if (ts.frontend?.length) lines.push(`Frontend: ${ts.frontend.join(', ')}`);
    if (ts.backend?.length) lines.push(`Backend: ${ts.backend.join(', ')}`);
    if (ts.database?.length) lines.push(`Database: ${ts.database.join(', ')}`);
    if (ts.tools?.length) lines.push(`Tools: ${ts.tools.join(', ')}`);
    if (ts.reasoning) lines.push(`\nReasoning: ${ts.reasoning}`);
    lines.push(`\n## Features`);
    (plan.features || []).forEach((f) => lines.push(`- [${f.priority}] ${f.name}: ${f.description}`));
    lines.push(`\n## API Endpoints`);
    (plan.apiEndpoints || []).forEach((e) => lines.push(`${e.method} ${e.path} — ${e.description}`));
    lines.push(`\n## Implementation Steps`);
    (plan.implementationSteps || []).forEach((s) => {
      lines.push(`\n### Step ${s.step}: ${s.title}`);
      lines.push(s.description);
      (s.tasks || []).forEach((t) => lines.push(`  - ${t}`));
    });
    if (readme) {
      lines.push(`\n---\n## README.md\n${readme}`);
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(plan.name || 'project').replace(/\s+/g, '-').toLowerCase()}-plan.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyReadme() {
    if (!readme) return;
    navigator.clipboard.writeText(readme);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function goToStep(step) {
    if (step < 0 || step > 4) return;
    if (step >= 1 && !plan) return;
    if (step === 3 && !readme) generateReadme();
    if (step === 4 && !deployGuide) generateDeployGuide(deployPlatform);
    setCurrentStep(step);
  }

  // ── Render Helpers ────────────────────────────────────────────────────────

  function renderStepIndicator() {
    return (
      <div className="flex items-center justify-center gap-1 mb-8">
        {STEPS.map((s, i) => (
          <button
            key={i}
            onClick={() => goToStep(i)}
            disabled={i >= 1 && !plan}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              i === currentStep
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                : i < currentStep
                ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
                : 'bg-surface-container/50 text-on-surface-variant'
            } ${i >= 1 && !plan ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className="material-symbols-outlined text-sm" style={{ fontSize: '14px' }}>
              {s.icon}
            </span>
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        ))}
      </div>
    );
  }

  // ── Step 0: Describe ──────────────────────────────────────────────────────

  function renderDescribeStep() {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="glass-card rounded-3xl p-8">
          <h2 className="text-2xl font-bold text-on-surface mb-1">What do you want to build?</h2>
          <p className="text-on-surface-variant mb-6">
            Describe your project idea or pick a template to get started.
          </p>

          {/* Difficulty Selector */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-on-surface-variant mb-2">Difficulty Level</label>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDifficulty(d.value)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    difficulty === d.value ? d.color + ' ring-2 ring-offset-1 ring-blue-500' : 'bg-surface-container/50 text-on-surface-variant border-outline/20 hover:border-outline/40'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Templates */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-on-surface-variant mb-2">Quick Templates</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedTemplate(selectedTemplate === t.id ? null : t.id);
                    if (selectedTemplate !== t.id) setDescription('');
                  }}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all text-center ${
                    selectedTemplate === t.id
                      ? 'bg-blue-600/10 border-blue-500/40 text-blue-600'
                      : 'bg-surface-container/50 border-outline/20 text-on-surface-variant hover:border-outline/40'
                  }`}
                >
                  <span className="material-symbols-outlined text-2xl">{t.icon}</span>
                  <span className="text-xs font-medium">{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-on-surface-variant mb-2">
              {selectedTemplate ? 'Customize (optional)' : 'Describe your project'}
            </label>
            <textarea
              placeholder="e.g., A task management app with team collaboration, real-time updates, and Kanban boards..."
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (e.target.value.trim()) setSelectedTemplate(null);
              }}
              rows={4}
              className="w-full bg-surface-container border border-outline/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={generatePlan}
            disabled={loading || (!description.trim() && !selectedTemplate)}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating Plan...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generate Project Plan
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Step 1: Plan Display ──────────────────────────────────────────────────

  function renderPlanStep() {
    if (!plan) return null;
    const ts = plan.techStack || {};

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="glass-card rounded-3xl p-8">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold text-on-surface">{plan.name}</h2>
              <p className="text-on-surface-variant mt-1">{plan.description}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveProject}
                disabled={saving}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  saved
                    ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30'
                    : 'bg-surface-container/50 text-on-surface-variant border border-outline/20 hover:border-outline/40'
                }`}
              >
                {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {saved ? 'Saved' : saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={exportAsText}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-surface-container/50 text-on-surface-variant border border-outline/20 hover:border-outline/40 transition-all"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>
        </div>

        {/* Tech Stack */}
        <div className="glass-card rounded-3xl p-6">
          <h3 className="text-lg font-bold text-on-surface mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-500">code</span>
            Tech Stack
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {[
              { label: 'Frontend', items: ts.frontend, color: 'blue' },
              { label: 'Backend', items: ts.backend, color: 'emerald' },
              { label: 'Database', items: ts.database, color: 'amber' },
              { label: 'Tools', items: ts.tools, color: 'purple' },
            ]
              .filter((g) => g.items?.length)
              .map((g) => (
                <div key={g.label}>
                  <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">{g.label}</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {g.items.map((t) => (
                      <span key={t} className={`px-2.5 py-0.5 rounded-full text-xs font-medium bg-${g.color}-500/10 text-${g.color}-600 border border-${g.color}-500/20`}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
          </div>
          {ts.reasoning && (
            <p className="text-sm text-on-surface-variant bg-surface-container/50 rounded-xl p-3 border border-outline/10">
              <span className="font-semibold">Why this stack: </span>
              {ts.reasoning}
            </p>
          )}
        </div>

        {/* Folder Structure */}
        {plan.folderStructure?.length > 0 && (
          <div className="glass-card rounded-3xl p-6">
            <h3 className="text-lg font-bold text-on-surface mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-500">folder</span>
              Folder Structure
            </h3>
            <div className="bg-surface-container/50 rounded-xl p-4 border border-outline/10 font-mono text-sm overflow-x-auto">
              {plan.folderStructure.map((f, i) => {
                const indent = '  '.repeat(f.depth);
                const icon = f.type === 'dir' ? '\u{1F4C1}' : '\u{1F4C4}';
                const name = f.path.replace(/\/$/, '').split('/').pop() || f.path;
                return (
                  <div key={i} className="text-on-surface-variant leading-relaxed">
                    {indent}{icon} {name}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Database Schema */}
        {plan.databaseSchema?.length > 0 && (
          <div className="glass-card rounded-3xl p-6">
            <h3 className="text-lg font-bold text-on-surface mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-500">database</span>
              Database Schema
            </h3>
            <div className="space-y-4">
              {plan.databaseSchema.map((table, i) => (
                <div key={i} className="bg-surface-container/50 rounded-xl border border-outline/10 overflow-hidden">
                  <div className="px-4 py-2 bg-surface-container font-semibold text-on-surface text-sm border-b border-outline/10 flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-emerald-500" style={{ fontSize: '16px' }}>table_chart</span>
                    {table.table}
                  </div>
                  <div className="p-3">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-on-surface-variant text-xs uppercase">
                          <th className="text-left pb-2 font-semibold">Column</th>
                          <th className="text-left pb-2 font-semibold">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(table.columns || []).map((col, j) => (
                          <tr key={j} className="border-t border-outline/5">
                            <td className="py-1.5 font-mono text-on-surface">{col.name}</td>
                            <td className="py-1.5 text-on-surface-variant font-mono text-xs">{col.type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {table.relationships?.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-outline/10">
                        <span className="text-xs font-semibold text-on-surface-variant">Relations: </span>
                        {table.relationships.map((r, k) => (
                          <span key={k} className="text-xs text-blue-500 font-mono ml-1">{r}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* API Endpoints */}
        {plan.apiEndpoints?.length > 0 && (
          <div className="glass-card rounded-3xl p-6">
            <h3 className="text-lg font-bold text-on-surface mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-sky-500">api</span>
              API Endpoints
            </h3>
            <div className="bg-surface-container/50 rounded-xl border border-outline/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-on-surface-variant text-xs uppercase border-b border-outline/10">
                    <th className="text-left px-4 py-2 font-semibold">Method</th>
                    <th className="text-left px-4 py-2 font-semibold">Path</th>
                    <th className="text-left px-4 py-2 font-semibold hidden sm:table-cell">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.apiEndpoints.map((ep, i) => (
                    <tr key={i} className="border-t border-outline/5">
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${METHOD_COLORS[ep.method] || 'bg-slate-500/10 text-slate-600'}`}>
                          {ep.method}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-on-surface text-xs">{ep.path}</td>
                      <td className="px-4 py-2 text-on-surface-variant hidden sm:table-cell">{ep.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Features */}
        {plan.features?.length > 0 && (
          <div className="glass-card rounded-3xl p-6">
            <h3 className="text-lg font-bold text-on-surface mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-purple-500">stars</span>
              Key Features
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {plan.features.map((f, i) => (
                <div key={i} className="flex items-start gap-3 bg-surface-container/50 rounded-xl p-3 border border-outline/10">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 mt-0.5 ${PRIORITY_COLORS[f.priority] || PRIORITY_COLORS.Low}`}>
                    {f.priority}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-on-surface">{f.name}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{f.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Step 2: Implementation Guide ──────────────────────────────────────────

  function renderImplementationStep() {
    if (!plan?.implementationSteps?.length) {
      return (
        <div className="max-w-3xl mx-auto glass-card rounded-3xl p-8 text-center">
          <p className="text-on-surface-variant">No implementation steps available.</p>
        </div>
      );
    }

    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="glass-card rounded-3xl p-6">
          <h2 className="text-2xl font-bold text-on-surface mb-1">Implementation Guide</h2>
          <p className="text-on-surface-variant mb-6">Step-by-step instructions for building {plan.name}</p>

          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-5 top-2 bottom-2 w-0.5 bg-outline/20" />

            <div className="space-y-6">
              {plan.implementationSteps.map((step) => (
                <div key={step.step} className="relative pl-12">
                  {/* Step circle */}
                  <div className="absolute left-2.5 top-1 w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                    {step.step}
                  </div>

                  <div className="bg-surface-container/50 rounded-xl p-4 border border-outline/10">
                    <h4 className="text-base font-bold text-on-surface">{step.title}</h4>
                    <p className="text-sm text-on-surface-variant mt-1">{step.description}</p>
                    {step.tasks?.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {step.tasks.map((task, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-on-surface-variant">
                            <span className="material-symbols-outlined text-emerald-500 shrink-0 mt-0.5" style={{ fontSize: '16px' }}>
                              task_alt
                            </span>
                            {task}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 3: README Preview ────────────────────────────────────────────────

  function renderReadmeStep() {
    if (readmeLoading) {
      return (
        <div className="max-w-3xl mx-auto glass-card rounded-3xl p-8 flex flex-col items-center justify-center min-h-[300px]">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
          <p className="text-on-surface-variant">Generating professional README...</p>
        </div>
      );
    }

    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="glass-card rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-500">description</span>
              README.md
            </h2>
            <button
              onClick={copyReadme}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-container/50 text-on-surface-variant border border-outline/20 hover:border-outline/40 transition-all"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="bg-surface-container/50 rounded-xl p-4 border border-outline/10 overflow-x-auto">
            <pre className="text-sm text-on-surface whitespace-pre-wrap font-mono leading-relaxed">{readme || 'No README generated yet.'}</pre>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={generateReadme}
              disabled={readmeLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-all disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              Regenerate
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 4: Deployment Guide ──────────────────────────────────────────────

  function renderDeployStep() {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="glass-card rounded-3xl p-6">
          <h2 className="text-2xl font-bold text-on-surface mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-500">rocket_launch</span>
            Deployment Guide
          </h2>

          {/* Platform Tabs */}
          <div className="flex gap-2 mb-6">
            {DEPLOY_PLATFORMS.map((p) => (
              <button
                key={p}
                onClick={() => generateDeployGuide(p)}
                disabled={deployLoading}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize ${
                  deployPlatform === p
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                    : 'bg-surface-container/50 text-on-surface-variant border border-outline/20 hover:border-outline/40'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {deployLoading ? (
            <div className="flex flex-col items-center justify-center min-h-[200px]">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
              <p className="text-on-surface-variant">Generating deployment guide for {deployPlatform}...</p>
            </div>
          ) : deployGuide ? (
            <div className="space-y-4">
              {/* Steps */}
              {deployGuide.steps?.map((s, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-blue-600/10 text-blue-600 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <div className="flex-1 bg-surface-container/50 rounded-xl p-3 border border-outline/10">
                    <h4 className="text-sm font-bold text-on-surface">{s.title}</h4>
                    <p className="text-xs text-on-surface-variant mt-0.5">{s.description}</p>
                    {s.command && (
                      <code className="block mt-2 bg-slate-900 text-emerald-400 text-xs px-3 py-2 rounded-lg font-mono">
                        $ {s.command}
                      </code>
                    )}
                  </div>
                </div>
              ))}

              {/* Notes */}
              {deployGuide.notes?.length > 0 && (
                <div className="bg-amber-500/5 rounded-xl p-4 border border-amber-500/20 mt-4">
                  <h4 className="text-sm font-bold text-amber-600 mb-2 flex items-center gap-1">
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>info</span>
                    Notes
                  </h4>
                  <ul className="space-y-1">
                    {deployGuide.notes.map((n, i) => (
                      <li key={i} className="text-xs text-on-surface-variant flex items-start gap-1.5">
                        <span className="text-amber-500 mt-0.5">-</span>
                        {n}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-on-surface-variant text-center py-8">Select a platform to generate a deployment guide.</p>
          )}
        </div>
      </div>
    );
  }

  // ── Main Render ───────────────────────────────────────────────────────────

  const stepRenderers = [renderDescribeStep, renderPlanStep, renderImplementationStep, renderReadmeStep, renderDeployStep];

  return (
    <div className="w-full py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Page Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-headline font-bold text-on-surface flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-blue-500 text-3xl">auto_awesome</span>
            AI Project Builder
          </h1>
          <p className="text-on-surface-variant mt-1">
            Scaffold your next project with AI-powered planning and guidance
          </p>
        </div>

        {renderStepIndicator()}

        {/* Step Content */}
        {stepRenderers[currentStep]()}

        {/* Navigation */}
        {plan && (
          <div className="flex justify-between mt-8 max-w-4xl mx-auto">
            <button
              onClick={() => goToStep(currentStep - 1)}
              disabled={currentStep === 0}
              className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium bg-surface-container/50 text-on-surface-variant border border-outline/20 hover:border-outline/40 disabled:opacity-30 transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <button
              onClick={() => goToStep(currentStep + 1)}
              disabled={currentStep === 4}
              className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-30 transition-all"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
