import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Wrench, Plus, Loader2, Code2, ArrowRight, X, Terminal, FileCode2,
  CheckCircle2, Circle, BookOpen, Zap, Trophy, Star, ChevronDown, ChevronUp,
  ExternalLink, Target, Layers, Clock, BarChart2,
} from 'lucide-react';
import { api } from '../store/useAuthStore';
import { useUserProgress } from '../hooks/useUserProgress';

const LEARNING_PATHS = [
  {
    id: 'web-basics',
    title: 'Web Fundamentals',
    description: 'HTML, CSS, JavaScript — the building blocks of every website',
    icon: '🌐',
    color: 'bg-orange-100 text-orange-700',
    accentBg: 'bg-orange-50',
    accentBorder: 'border-orange-200',
    skills: ['HTML Structure & Semantics', 'CSS Layouts & Flexbox', 'CSS Grid', 'JavaScript Basics', 'DOM Manipulation', 'Fetch API & AJAX', 'Git & GitHub'],
    resources: [
      { label: 'freeCodeCamp Web Dev', url: 'https://www.freecodecamp.org/learn/responsive-web-design/' },
      { label: 'The Odin Project', url: 'https://www.theodinproject.com/' },
      { label: 'MDN Web Docs', url: 'https://developer.mozilla.org/en-US/' },
    ],
    estimatedWeeks: 8,
    projects: ['Personal Portfolio', 'Landing Page Clone', 'Interactive Quiz App'],
  },
  {
    id: 'react-dev',
    title: 'React Developer',
    description: 'Build modern, component-based UIs with React & ecosystem',
    icon: '⚛️',
    color: 'bg-cyan-100 text-cyan-700',
    accentBg: 'bg-cyan-50',
    accentBorder: 'border-cyan-200',
    skills: ['React Components & JSX', 'Props & State', 'Hooks (useState, useEffect)', 'React Router', 'Context API', 'API Integration', 'Tailwind CSS'],
    resources: [
      { label: 'React Official Docs', url: 'https://react.dev/' },
      { label: 'Scrimba React Course', url: 'https://scrimba.com/learn/learnreact' },
      { label: 'React Tutorial', url: 'https://www.reacttutorial.dev/' },
    ],
    estimatedWeeks: 10,
    projects: ['Task Manager App', 'Weather Dashboard', 'E-commerce UI'],
  },
  {
    id: 'python-backend',
    title: 'Python & Backend',
    description: 'Server-side programming with Python, APIs, and databases',
    icon: '🐍',
    color: 'bg-yellow-100 text-yellow-700',
    accentBg: 'bg-yellow-50',
    accentBorder: 'border-yellow-200',
    skills: ['Python Syntax & OOP', 'File I/O', 'Flask / FastAPI', 'REST API Design', 'SQL & PostgreSQL', 'Authentication & JWT', 'Docker Basics'],
    resources: [
      { label: 'Python.org Tutorial', url: 'https://docs.python.org/3/tutorial/' },
      { label: 'FastAPI Tutorial', url: 'https://fastapi.tiangolo.com/tutorial/' },
      { label: 'SQLZoo', url: 'https://sqlzoo.net/' },
    ],
    estimatedWeeks: 12,
    projects: ['REST API Service', 'Blog Backend', 'URL Shortener'],
  },
  {
    id: 'dsa',
    title: 'Data Structures & Algorithms',
    description: 'Core CS concepts essential for technical interviews',
    icon: '🧩',
    color: 'bg-purple-100 text-purple-700',
    accentBg: 'bg-purple-50',
    accentBorder: 'border-purple-200',
    skills: ['Arrays & Strings', 'Linked Lists', 'Stacks & Queues', 'Trees & Graphs', 'Hash Maps', 'Sorting Algorithms', 'Dynamic Programming'],
    resources: [
      { label: 'NeetCode 150', url: 'https://neetcode.io/practice' },
      { label: 'LeetCode Patterns', url: 'https://leetcode.com/' },
      { label: 'Visualgo', url: 'https://visualgo.net/' },
    ],
    estimatedWeeks: 14,
    projects: ['Implement a Graph traversal', 'Build a LRU Cache', 'Solve 50 LeetCode problems'],
  },
];

const DEFAULTS = {
  selectedPath: null,
  skillsChecked: {},
  targetRole: '',
  currentSkills: '',
  projectIdeas: [],
  tasks: [],
};

function SkillChecklist({ path, checked, onToggle }) {
  return (
    <div className="space-y-2">
      {path.skills.map((skill) => {
        const done = !!checked[`${path.id}__${skill}`];
        return (
          <button
            key={skill}
            onClick={() => onToggle(`${path.id}__${skill}`)}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
              done
                ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-orange-300'
            }`}
          >
            {done
              ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              : <Circle className="w-4 h-4 text-slate-300 shrink-0" />}
            <span className={`text-sm font-medium ${done ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-200'}`}>
              {skill}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PathCard({ path, isSelected, progress, onSelect }) {
  const total = path.skills.length;
  const done = path.skills.filter(s => progress[`${path.id}__${s}`]).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <button
      onClick={() => onSelect(path.id)}
      className={`w-full text-left p-5 rounded-2xl border-2 transition-all hover:-translate-y-0.5 ${
        isSelected
          ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-orange-200'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{path.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-900 dark:text-white text-sm">{path.title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">{path.description}</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-orange-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{done}/{total}</span>
          </div>
        </div>
        {pct === 100 && <Trophy className="w-4 h-4 text-amber-500 shrink-0" />}
      </div>
    </button>
  );
}

export default function LearnAndBuildTrack() {
  const { data: progress, updateProgress, isLoading: progressLoading, isSaving } = useUserProgress(
    'learn-and-build',
    DEFAULTS
  );

  const [expandedPath, setExpandedPath] = useState(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [activeBlueprint, setActiveBlueprint] = useState(null);

  const selectedPathId = progress.selectedPath;
  const skillsChecked = progress.skillsChecked || {};
  const projectIdeas = progress.projectIdeas || [];
  const tasks = progress.tasks || [];
  const targetRole = progress.targetRole || '';
  const currentSkills = progress.currentSkills || '';

  const activePath = LEARNING_PATHS.find(p => p.id === selectedPathId);

  const handleToggleSkill = useCallback((key) => {
    const updated = { ...skillsChecked, [key]: !skillsChecked[key] };
    updateProgress({ skillsChecked: updated });
  }, [skillsChecked, updateProgress]);

  const handleSelectPath = (pathId) => {
    updateProgress({ selectedPath: pathId });
    setExpandedPath(pathId);
  };

  const handleGenerateProjects = async (e) => {
    e.preventDefault();
    if (!targetRole.trim()) return;
    setLoadingProjects(true);
    try {
      const res = await api.post('/job-prep/projects', { role: targetRole, skills: currentSkills });
      updateProgress({ projectIdeas: res.data.data.projects });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleGenerateBlueprint = async (project) => {
    setActiveBlueprint({ title: project.title, loading: true });
    try {
      const res = await api.post('/job-prep/project-blueprint', { projectTitle: project.title });
      setActiveBlueprint({ title: project.title, loading: false, blueprint: res.data.data.blueprint });
      if (!tasks.find(t => t.title === project.title)) {
        updateProgress({ tasks: [...tasks, { id: Date.now().toString(), title: project.title, status: 'todo' }] });
      }
    } catch {
      setActiveBlueprint(null);
    }
  };

  const handleDrop = (e, status) => {
    const id = e.dataTransfer.getData('taskId');
    updateProgress({ tasks: tasks.map(t => t.id === id ? { ...t, status } : t) });
  };

  if (progressLoading) {
    return (
      <div className="page-container py-24 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
      </div>
    );
  }

  return (
    <div className="page-container space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-4 bg-orange-100 text-orange-600 rounded-2xl">
          <Wrench className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">
            Learn & Build Track
            {isSaving && <span className="ml-3 text-orange-600 text-sm font-semibold">Saving…</span>}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Choose a learning path, check off skills as you learn, and build projects for your portfolio.
          </p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            icon: BookOpen, label: 'Active Path',
            value: activePath?.title || 'None selected',
            color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/30',
          },
          {
            icon: CheckCircle2, label: 'Skills Checked',
            value: Object.values(skillsChecked).filter(Boolean).length,
            color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30',
          },
          {
            icon: Target, label: 'Projects',
            value: projectIdeas.length,
            color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30',
          },
          {
            icon: Trophy, label: 'Paths Completed',
            value: LEARNING_PATHS.filter(p =>
              p.skills.every(s => skillsChecked[`${p.id}__${s}`])
            ).length,
            color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30',
          },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="card rounded-2xl p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${bg}`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
              <p className="text-base font-extrabold text-slate-900 dark:text-white truncate max-w-[120px]">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left: Learning Paths */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
            <Layers className="w-5 h-5 text-orange-500" />
            Learning Paths
          </h2>
          {LEARNING_PATHS.map(path => (
            <PathCard
              key={path.id}
              path={path}
              isSelected={selectedPathId === path.id}
              progress={skillsChecked}
              onSelect={handleSelectPath}
            />
          ))}
        </div>

        {/* Right: Active Path Details or Project Generator */}
        <div className="lg:col-span-2 space-y-6">
          {activePath ? (
            <>
              {/* Active Path Header */}
              <div className={`card rounded-2xl p-6 border ${activePath.accentBorder} ${activePath.accentBg} dark:bg-transparent`}>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{activePath.icon}</span>
                    <div>
                      <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">{activePath.title}</h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{activePath.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-500 font-medium">~{activePath.estimatedWeeks} weeks</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>Skills Progress</span>
                  <span>
                    {activePath.skills.filter(s => skillsChecked[`${activePath.id}__${s}`]).length} / {activePath.skills.length}
                  </span>
                </div>
                <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-4">
                  <div
                    className="h-full bg-gradient-to-r from-orange-400 to-amber-400 rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.round(
                        (activePath.skills.filter(s => skillsChecked[`${activePath.id}__${s}`]).length / activePath.skills.length) * 100
                      )}%`
                    }}
                  />
                </div>

                {/* Resources */}
                <div className="flex flex-wrap gap-2">
                  {activePath.resources.map(r => (
                    <a
                      key={r.label}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-slate-700 dark:text-slate-300 hover:border-orange-400 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {r.label}
                    </a>
                  ))}
                </div>
              </div>

              {/* Skill Checklist */}
              <div className="card rounded-2xl p-6">
                <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  Skill Checklist
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">Check off topics as you learn them</span>
                </h3>
                <SkillChecklist path={activePath} checked={skillsChecked} onToggle={handleToggleSkill} />
              </div>

              {/* Suggested Projects */}
              <div className="card rounded-2xl p-6">
                <h3 className="font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                  <Star className="w-5 h-5 text-amber-500" />
                  Project Ideas for This Path
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Build these to cement your skills and impress employers.</p>
                <div className="space-y-2">
                  {activePath.projects.map((proj, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                      <div className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold shrink-0">
                        {i + 1}
                      </div>
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{proj}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="card rounded-2xl p-12 text-center">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="font-bold text-slate-700 dark:text-slate-300 mb-2">Choose a Learning Path</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Select a path from the left to see your skill checklist, resources, and project ideas.</p>
            </div>
          )}

          {/* Project Generator */}
          <div className="card rounded-2xl p-6">
            <h3 className="font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <Code2 className="w-5 h-5 text-orange-500" />
              AI Project Generator
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Get custom project ideas tailored to your target role and skills.</p>
            <form onSubmit={handleGenerateProjects} className="flex flex-col sm:flex-row gap-3 mb-4">
              <input
                type="text"
                value={targetRole}
                onChange={e => updateProgress({ targetRole: e.target.value })}
                placeholder="Target role (e.g. React Developer)"
                className="input-field flex-1"
              />
              <input
                type="text"
                value={currentSkills}
                onChange={e => updateProgress({ currentSkills: e.target.value })}
                placeholder="Skills you know (optional)"
                className="input-field flex-1"
              />
              <button
                type="submit"
                disabled={loadingProjects || !targetRole.trim()}
                className="btn-primary flex items-center gap-2 whitespace-nowrap"
              >
                {loadingProjects ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Generate
              </button>
            </form>

            {projectIdeas.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {projectIdeas.map((proj, i) => (
                  <div key={i} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm mb-1">{proj.title}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">{proj.description}</p>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {proj.skills_gained?.slice(0, 3).map((s, j) => (
                        <span key={j} className="text-xs font-bold px-2 py-0.5 bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-400 rounded-md uppercase">
                          {s}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => handleGenerateBlueprint(proj)}
                      className="w-full py-2 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    >
                      Blueprint <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Kanban */}
          {tasks.length > 0 && (
            <div className="card rounded-2xl p-6">
              <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-orange-500" />
                Project Board
                <span className="text-xs font-normal text-slate-400 dark:text-slate-500">Drag & drop to update status</span>
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {['todo', 'in-progress', 'done'].map((col) => {
                  const labels = { 'todo': 'To Do', 'in-progress': 'In Progress', 'done': 'Done' };
                  const colTasks = tasks.filter(t => t.status === col);
                  const colColors = {
                    'todo': 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700',
                    'in-progress': 'bg-orange-50/50 dark:bg-orange-950/20 border-orange-100 dark:border-orange-900/50',
                    'done': 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/50',
                  };
                  const labelColors = {
                    'todo': 'text-slate-700 dark:text-slate-300',
                    'in-progress': 'text-orange-800 dark:text-orange-400',
                    'done': 'text-emerald-800 dark:text-emerald-400',
                  };
                  const badgeColors = {
                    'todo': 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
                    'in-progress': 'bg-orange-200 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400',
                    'done': 'bg-emerald-200 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400',
                  };
                  return (
                    <div
                      key={col}
                      className={`rounded-xl p-3 border min-h-[120px] ${colColors[col]}`}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => handleDrop(e, col)}
                    >
                      <p className={`text-xs font-bold mb-3 flex items-center justify-between ${labelColors[col]}`}>
                        {labels[col]}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badgeColors[col]}`}>{colTasks.length}</span>
                      </p>
                      <div className="space-y-2">
                        {colTasks.map(task => (
                          <div
                            key={task.id}
                            draggable
                            onDragStart={e => e.dataTransfer.setData('taskId', task.id)}
                            className="bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm cursor-grab active:cursor-grabbing text-xs font-medium text-slate-800 dark:text-slate-200"
                          >
                            {task.title}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Links */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { to: '/courses', icon: BookOpen, label: 'Course Library', desc: 'Browse structured courses', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' },
              { to: '/coding-practice', icon: Code2, label: 'Coding Practice', desc: 'Sharpen your problem-solving', color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950/30' },
              { to: '/zero-to-hero', icon: Zap, label: 'Zero to Hero', desc: 'Full structured roadmap', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/30' },
            ].map(({ to, icon: Icon, label, desc, color, bg }) => (
              <Link key={to} to={to} className="card rounded-2xl p-4 flex items-center gap-3 hover:-translate-y-0.5 transition-all group">
                <div className={`p-2.5 rounded-xl ${bg}`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-900 dark:text-white">{label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{desc}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 ml-auto" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Blueprint Modal */}
      {activeBlueprint && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileCode2 className="w-5 h-5 text-orange-500" />
                Blueprint: {activeBlueprint.title}
              </h2>
              <button onClick={() => setActiveBlueprint(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {activeBlueprint.loading ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                  <Loader2 className="w-10 h-10 animate-spin text-orange-500 mb-4" />
                  <p className="text-sm">Architecting your solution...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {activeBlueprint.blueprint?.architecture && (
                    <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Architecture & Stack</h3>
                      <p className="text-slate-800 dark:text-slate-200 bg-orange-50 dark:bg-orange-950/30 p-4 rounded-xl border border-orange-100 dark:border-orange-900/50 text-sm">
                        {activeBlueprint.blueprint.architecture}
                      </p>
                    </div>
                  )}
                  {activeBlueprint.blueprint?.setup_commands?.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Setup Commands</h3>
                      <div className="bg-slate-900 rounded-xl p-4 font-mono text-sm text-green-400 space-y-1.5 overflow-x-auto">
                        {activeBlueprint.blueprint.setup_commands.map((cmd, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Terminal className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                            <span>{cmd}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {activeBlueprint.blueprint?.steps?.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Implementation Steps</h3>
                      <ul className="space-y-2">
                        {activeBlueprint.blueprint.steps.map((step, i) => (
                          <li key={i} className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl">
                            <div className="w-5 h-5 rounded-full bg-orange-100 dark:bg-orange-950/50 text-orange-600 flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">
                              {i + 1}
                            </div>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {activeBlueprint.blueprint?.readme_draft && (
                    <div>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">README Draft</h3>
                      <pre className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono overflow-x-auto">
                        {activeBlueprint.blueprint.readme_draft}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
            {!activeBlueprint.loading && (
              <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button onClick={() => setActiveBlueprint(null)} className="btn-primary">
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
