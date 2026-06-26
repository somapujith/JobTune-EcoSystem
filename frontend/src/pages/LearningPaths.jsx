import { useState, useEffect } from 'react';
import { ChevronRight, Clock, BookOpen, Plus, X, Check, Flame, Target, Trophy, Lock, PlayCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../store/useAuthStore';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PATH_GRADIENTS = {
  'Frontend Developer':     'from-blue-500 to-indigo-600',
  'Backend Developer':      'from-emerald-500 to-teal-600',
  'Full Stack Engineer':    'from-violet-500 to-purple-600',
  'AI/ML Engineer':         'from-fuchsia-500 to-pink-600',
  'Data Analyst':           'from-orange-500 to-amber-600',
  'DevOps Engineer':        'from-cyan-500 to-blue-600',
  'Cloud Architect':        'from-sky-400 to-indigo-500',
  'Cybersecurity Analyst':  'from-red-500 to-rose-600',
};

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ProgressRing({ value, size = 56, stroke = 5, className = '' }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  return (
    <svg width={size} height={size} className={className}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-slate-200 dark:text-slate-700" />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke="url(#progress-grad)" strokeWidth={stroke}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-all duration-700"
      />
      <defs>
        <linearGradient id="progress-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
      </defs>
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-on-surface text-xs font-black">
        {value}%
      </text>
    </svg>
  );
}

function ProgressBar({ value }) {
  return (
    <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500"
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

function PathCard({ path, onSelect }) {
  const gradient = PATH_GRADIENTS[path.title] || 'from-slate-500 to-slate-700';
  return (
    <button
      onClick={() => onSelect(path)}
      className="glass-card rounded-2xl overflow-hidden text-left hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group w-full"
    >
      <div className={`h-32 bg-gradient-to-br ${gradient} relative flex items-center justify-center overflow-hidden`}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-4 -right-4 w-28 h-28 rounded-full border-2 border-white/40" />
          <div className="absolute bottom-2 left-4 w-16 h-16 rounded-full border-2 border-white/20" />
        </div>
        <span className="material-symbols-outlined text-white/90 text-5xl" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>
          {path.icon || 'route'}
        </span>
        {path.progress > 0 && (
          <div className="absolute top-3 right-3">
            <ProgressRing value={path.progress} size={44} stroke={4} />
          </div>
        )}
      </div>

      <div className="p-5 space-y-3">
        <h3 className="text-base font-bold text-on-surface group-hover:text-amber-600 transition-colors">
          {path.title}
        </h3>
        <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-2">{path.description}</p>

        <div className="flex items-center gap-3 text-[11px] text-on-surface-variant">
          <span className="inline-flex items-center gap-1"><BookOpen className="w-3 h-3" />{path.total_courses} courses</span>
          <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{path.estimated_weeks} weeks</span>
          <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{path.total_hours}h total</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(path.skill_tags || []).slice(0, 4).map((tag, i) => (
            <span key={i} className="px-2 py-0.5 rounded-full bg-surface-container/50 border border-outline/10 text-[10px] font-semibold text-on-surface-variant">
              {tag}
            </span>
          ))}
          {(path.skill_tags || []).length > 4 && (
            <span className="px-2 py-0.5 text-[10px] font-semibold text-on-surface-variant">
              +{path.skill_tags.length - 4}
            </span>
          )}
        </div>

        {path.progress > 0 && (
          <div className="pt-1">
            <ProgressBar value={path.progress} />
            <span className="text-[10px] font-bold text-amber-600 mt-1 block">{path.progress}% complete</span>
          </div>
        )}
      </div>
    </button>
  );
}

function PathTimeline({ path, onClose }) {
  const gradient = PATH_GRADIENTS[path.title] || 'from-slate-500 to-slate-700';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl h-full bg-white dark:bg-slate-900 shadow-2xl overflow-y-auto animate-slide-in-right">
        {/* Header */}
        <div className={`h-44 bg-gradient-to-br ${gradient} relative flex items-end p-6`}>
          <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-black/20 hover:bg-black/40 text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-4 right-8 w-32 h-32 rounded-full border-2 border-white/30" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white leading-tight">{path.title}</h2>
            <p className="text-white/80 text-sm mt-1">{path.description}</p>
            <div className="flex items-center gap-4 mt-3 text-white/70 text-xs">
              <span className="inline-flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />{path.total_courses} courses</span>
              <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{path.total_hours}h total</span>
              <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />~{path.estimated_weeks} weeks</span>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Overall Progress */}
          <div className="glass-card rounded-xl p-4 flex items-center gap-4">
            <ProgressRing value={path.progress || 0} size={64} stroke={5} />
            <div>
              <p className="text-sm font-bold text-on-surface">Overall Progress</p>
              <p className="text-xs text-on-surface-variant mt-0.5">
                {path.courses?.filter(c => c.status === 'completed').length || 0} of {path.total_courses} courses completed
              </p>
            </div>
          </div>

          {/* Skills */}
          <div>
            <h3 className="text-sm font-bold text-on-surface mb-3">Skills You Will Gain</h3>
            <div className="flex flex-wrap gap-2">
              {(path.skill_tags || []).map((tag, i) => (
                <span key={i} className="px-3 py-1.5 rounded-full bg-surface-container/50 border border-outline/20 text-xs font-semibold text-on-surface-variant">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Timeline / Stepper */}
          <div>
            <h3 className="text-sm font-bold text-on-surface mb-4">Course Timeline</h3>
            <div className="space-y-0">
              {(path.courses || []).map((course, idx) => {
                const isLast = idx === (path.courses || []).length - 1;
                const statusIcon = course.status === 'completed'
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  : course.status === 'available'
                    ? <PlayCircle className="w-5 h-5 text-amber-500" />
                    : <Lock className="w-5 h-5 text-slate-400 dark:text-slate-600" />;

                const statusBg = course.status === 'completed'
                  ? 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700'
                  : course.status === 'available'
                    ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700';

                return (
                  <div key={course.id} className="flex gap-4">
                    {/* Stepper line + dot */}
                    <div className="flex flex-col items-center">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 shrink-0 ${
                        course.status === 'completed' ? 'bg-emerald-500 border-emerald-500' :
                        course.status === 'available' ? 'bg-amber-500 border-amber-500' :
                        'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600'
                      }`}>
                        <span className="text-white text-xs font-bold">
                          {course.status === 'completed' ? <Check className="w-4 h-4" /> : idx + 1}
                        </span>
                      </div>
                      {!isLast && (
                        <div className={`w-0.5 flex-1 min-h-[24px] ${
                          course.status === 'completed' ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-slate-200 dark:bg-slate-700'
                        }`} />
                      )}
                    </div>

                    {/* Course info */}
                    <div className={`flex-1 rounded-xl border p-4 mb-3 ${statusBg}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h4 className={`text-sm font-bold ${course.status === 'locked' ? 'text-slate-400 dark:text-slate-500' : 'text-on-surface'}`}>
                            {course.title}
                          </h4>
                          <p className="text-xs text-on-surface-variant mt-0.5">{course.instructor}</p>
                          <div className="flex items-center gap-3 mt-2 text-[11px] text-on-surface-variant">
                            <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{course.duration_hrs}h</span>
                            <span className="inline-flex items-center gap-1"><BookOpen className="w-3 h-3" />{course.lesson_count} lessons</span>
                          </div>
                        </div>
                        {statusIcon}
                      </div>

                      {course.status !== 'locked' && course.progress > 0 && course.progress < 100 && (
                        <div className="mt-3">
                          <ProgressBar value={course.progress} />
                          <span className="text-[10px] font-bold text-amber-600 mt-1 block">{course.progress}% complete</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WeeklyPlanSidebar({ streak, activeCourses }) {
  const today = new Date();
  const dayOfWeek = (today.getDay() + 6) % 7; // Mon=0
  const todayLabel = WEEKDAY_LABELS[dayOfWeek];

  // Build daily tasks from active courses
  const todayTasks = activeCourses.slice(0, 3).map(c => ({
    id: c.id,
    title: `Continue "${c.title}"`,
    type: 'course',
    progress: c.progress || 0,
  }));

  return (
    <div className="space-y-6">
      {/* Streak Card */}
      <div className="glass-card rounded-2xl p-5">
        <h3 className="text-sm font-bold text-on-surface mb-4 flex items-center gap-2">
          <Flame className="w-4 h-4 text-orange-500" />
          Learning Streak
        </h3>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-3xl font-black text-amber-500">{streak.current}</p>
            <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wide">Current</p>
          </div>
          <div className="w-px h-10 bg-outline/20" />
          <div className="text-center">
            <p className="text-3xl font-black text-on-surface">{streak.longest}</p>
            <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wide">Best</p>
          </div>
        </div>

        {/* Week activity dots */}
        <div className="flex items-center gap-2 mt-4">
          {WEEKDAY_LABELS.map((label, i) => (
            <div key={label} className="flex-1 text-center">
              <div className={`w-6 h-6 mx-auto rounded-full flex items-center justify-center text-[9px] font-bold ${
                i < dayOfWeek ? 'bg-emerald-500 text-white' :
                i === dayOfWeek ? 'bg-amber-500 text-white ring-2 ring-amber-300' :
                'bg-slate-200 dark:bg-slate-700 text-on-surface-variant'
              }`}>
                {i < dayOfWeek ? <Check className="w-3 h-3" /> : label[0]}
              </div>
              <p className={`text-[9px] mt-1 ${i === dayOfWeek ? 'font-bold text-amber-600' : 'text-on-surface-variant'}`}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Daily Goal */}
      <div className="glass-card rounded-2xl p-5">
        <h3 className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
          <Target className="w-4 h-4 text-blue-500" />
          Daily Goal
        </h3>
        <div className="flex items-center gap-3">
          <ProgressRing value={Math.min(100, Math.round((todayTasks.length / 3) * 100))} size={48} stroke={4} />
          <div>
            <p className="text-sm font-bold text-on-surface">{streak.daily_goal || 30} min / day</p>
            <p className="text-xs text-on-surface-variant">Keep going to maintain your streak!</p>
          </div>
        </div>
      </div>

      {/* Today's Tasks */}
      <div className="glass-card rounded-2xl p-5">
        <h3 className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-purple-500 text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
            today
          </span>
          Today - {todayLabel}
        </h3>
        {todayTasks.length === 0 ? (
          <p className="text-xs text-on-surface-variant">No active courses. Enroll in a path to get started!</p>
        ) : (
          <div className="space-y-2">
            {todayTasks.map(task => (
              <div key={task.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-container/30 border border-outline/10">
                <PlayCircle className="w-4 h-4 text-amber-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-on-surface truncate">{task.title}</p>
                  <ProgressBar value={task.progress} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateCustomPathModal({ allCourses, onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());

  function toggle(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-outline/10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-on-surface">Create Custom Path</h2>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-container/50 text-on-surface-variant transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <input
            type="text"
            placeholder="Path name (e.g., My Full-Stack Journey)"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full mt-4 px-4 py-3 bg-surface-container/50 border border-outline/20 rounded-xl text-sm font-medium text-on-surface placeholder:text-outline outline-none focus:ring-2 focus:ring-amber-500/20"
          />
        </div>

        <div className="p-6 max-h-[50vh] overflow-y-auto space-y-2">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-3">Select Courses</p>
          {allCourses.map(course => (
            <button
              key={course.id}
              onClick={() => toggle(course.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border ${
                selectedIds.has(course.id)
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                  : 'border-outline/10 hover:bg-surface-container/50'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                selectedIds.has(course.id) ? 'bg-amber-500 text-white' : 'bg-surface-container/50 border border-outline/20'
              }`}>
                {selectedIds.has(course.id) && <Check className="w-3.5 h-3.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-on-surface truncate">{course.title}</p>
                <p className="text-[11px] text-on-surface-variant">{course.category} - {course.difficulty} - {course.duration_hrs}h</p>
              </div>
            </button>
          ))}
        </div>

        <div className="p-6 border-t border-outline/10 flex items-center justify-between">
          <span className="text-xs text-on-surface-variant font-semibold">{selectedIds.size} courses selected</span>
          <button
            onClick={() => {
              if (title.trim() && selectedIds.size > 0) {
                onSave({ title: title.trim(), courseIds: [...selectedIds] });
              }
            }}
            disabled={!title.trim() || selectedIds.size === 0}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-amber-500/30 transition-all"
          >
            Create Path
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function LearningPaths() {
  const [paths, setPaths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [allCourses, setAllCourses] = useState([]);
  const [streak, setStreak] = useState({ current: 0, longest: 0, daily_goal: 30 });
  const [activeCourses, setActiveCourses] = useState([]);
  const [stats, setStats] = useState({ completedCount: 0, totalMinutesLearned: 0, enrollmentCount: 0 });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [pathsRes, progressRes, coursesRes] = await Promise.allSettled([
        api.get('/courses/paths'),
        api.get('/courses/progress'),
        api.get('/courses', { params: { page: 1 } }),
      ]);

      if (pathsRes.status === 'fulfilled') {
        setPaths(pathsRes.value.data.data || []);
      }

      if (progressRes.status === 'fulfilled') {
        const prog = progressRes.value.data.data;
        setStreak(prog.streak || { current: 0, longest: 0, daily_goal: 30 });
        setActiveCourses(prog.activeCourses || []);
        setStats({
          completedCount: prog.completedCount || 0,
          totalMinutesLearned: prog.totalMinutesLearned || 0,
          enrollmentCount: prog.enrollmentCount || 0,
        });
      }

      if (coursesRes.status === 'fulfilled') {
        setAllCourses(coursesRes.value.data.data || []);
      }
    } catch {
      // keep empty state
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectPath(path) {
    try {
      const { data } = await api.get(`/courses/paths/${path.id}`);
      setSelectedPath(data.data);
    } catch {
      setSelectedPath(path);
    }
  }

  function handleSaveCustomPath(customPath) {
    // Add to local paths for now (no backend persistence for custom paths yet)
    const selected = allCourses.filter(c => customPath.courseIds.includes(c.id));
    const newPath = {
      id: `custom-${Date.now()}`,
      title: customPath.title,
      description: 'Your custom learning path.',
      icon: 'auto_awesome',
      estimated_weeks: Math.ceil(selected.reduce((s, c) => s + c.duration_hrs, 0) / 5),
      skill_tags: [...new Set(selected.flatMap(c => c.skills || []))].slice(0, 6),
      course_ids: customPath.courseIds,
      courses: selected.map((c, i) => ({ ...c, status: i === 0 ? 'available' : 'locked', progress: 0 })),
      total_courses: selected.length,
      total_hours: selected.reduce((s, c) => s + c.duration_hrs, 0),
      progress: 0,
    };
    setPaths(prev => [...prev, newPath]);
    setShowCreate(false);
  }

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="w-full max-w-7xl mx-auto py-24 flex justify-center">
        <div className="text-center">
          <div className="inline-block w-10 h-10 rounded-full border-2 border-amber-500 border-t-transparent animate-spin mb-4" />
          <p className="text-on-surface-variant font-semibold">Loading learning paths...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto py-12 px-4 sm:px-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
        <div>
          <h1 className="text-4xl font-black text-on-surface font-headline mb-2 flex items-center gap-3">
            <span className="material-symbols-outlined text-amber-500 text-4xl" style={{ fontVariationSettings: "'FILL' 0" }}>
              route
            </span>
            Learning Paths
          </h1>
          <p className="text-lg text-on-surface-variant font-medium max-w-lg">
            Follow structured paths to master a career track, or build your own custom journey.
          </p>
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm hover:shadow-lg hover:shadow-amber-500/30 transition-all"
        >
          <Plus className="w-4 h-4" />
          Create Custom Path
        </button>
      </div>

      {/* ── Progress Dashboard ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <div className="glass-card rounded-2xl p-5 text-center">
          <Trophy className="w-6 h-6 text-amber-500 mx-auto mb-2" />
          <p className="text-2xl font-black text-on-surface">{stats.completedCount}</p>
          <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">Completed</p>
        </div>
        <div className="glass-card rounded-2xl p-5 text-center">
          <BookOpen className="w-6 h-6 text-blue-500 mx-auto mb-2" />
          <p className="text-2xl font-black text-on-surface">{stats.enrollmentCount}</p>
          <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">Enrolled</p>
        </div>
        <div className="glass-card rounded-2xl p-5 text-center">
          <Clock className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
          <p className="text-2xl font-black text-on-surface">{Math.round(stats.totalMinutesLearned / 60)}h</p>
          <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">Hours Learned</p>
        </div>
        <div className="glass-card rounded-2xl p-5 text-center">
          <Flame className="w-6 h-6 text-orange-500 mx-auto mb-2" />
          <p className="text-2xl font-black text-on-surface">{streak.current}</p>
          <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">Day Streak</p>
        </div>
      </div>

      {/* ── Main Layout: Paths + Sidebar ────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Paths Grid */}
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-black text-on-surface mb-5 flex items-center gap-2">
            <span className="material-symbols-outlined text-purple-500" style={{ fontVariationSettings: "'FILL' 1" }}>
              school
            </span>
            Career Paths
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {paths.map(path => (
              <PathCard key={path.id} path={path} onSelect={handleSelectPath} />
            ))}
          </div>

          {paths.length === 0 && (
            <div className="glass-card rounded-2xl p-12 text-center">
              <span className="material-symbols-outlined text-5xl text-outline mb-3 block" style={{ fontVariationSettings: "'FILL' 0" }}>
                route
              </span>
              <p className="text-on-surface-variant font-semibold">No learning paths available yet.</p>
            </div>
          )}
        </div>

        {/* Weekly Plan Sidebar */}
        <div className="w-full lg:w-80 shrink-0">
          <h2 className="text-xl font-black text-on-surface mb-5 flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-500" style={{ fontVariationSettings: "'FILL' 1" }}>
              calendar_today
            </span>
            Weekly Plan
          </h2>
          <WeeklyPlanSidebar streak={streak} activeCourses={activeCourses} />
        </div>
      </div>

      {/* ── Path Timeline Panel ─────────────────────────────────────────────── */}
      {selectedPath && (
        <PathTimeline
          path={selectedPath}
          onClose={() => setSelectedPath(null)}
        />
      )}

      {/* ── Create Custom Path Modal ────────────────────────────────────────── */}
      {showCreate && (
        <CreateCustomPathModal
          allCourses={allCourses}
          onClose={() => setShowCreate(false)}
          onSave={handleSaveCustomPath}
        />
      )}
    </div>
  );
}
