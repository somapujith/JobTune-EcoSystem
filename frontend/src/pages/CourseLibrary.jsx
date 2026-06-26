import { useState, useEffect } from 'react';
import { Search, BookOpen, Clock, Users, Star, ChevronRight, X, Play, CheckCircle, Filter } from 'lucide-react';
import { api } from '../store/useAuthStore';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIES = ['All', 'Frontend', 'Backend', 'AI/ML', 'Data Science', 'DevOps', 'Cloud', 'Mobile'];
const DIFFICULTIES = ['All', 'Beginner', 'Intermediate', 'Advanced'];
const DURATIONS = ['All', '< 10 hrs', '10-20 hrs', '> 20 hrs'];

const CATEGORY_ICONS = {
  Frontend: 'web', Backend: 'dns', 'AI/ML': 'psychology', 'Data Science': 'monitoring',
  DevOps: 'cloud_sync', Cloud: 'cloud', Mobile: 'smartphone',
};

const DIFFICULTY_COLORS = {
  Beginner: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  Intermediate: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  Advanced: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400',
};

const THUMBNAIL_GRADIENTS = {
  Frontend: 'from-blue-500 to-indigo-600',
  Backend: 'from-emerald-500 to-teal-600',
  'AI/ML': 'from-purple-500 to-fuchsia-600',
  'Data Science': 'from-orange-500 to-red-500',
  DevOps: 'from-cyan-500 to-blue-600',
  Cloud: 'from-sky-400 to-blue-600',
  Mobile: 'from-pink-500 to-rose-600',
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StarRating({ rating }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className="inline-flex items-center gap-0.5">
      {[...Array(5)].map((_, i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i < full ? 'fill-amber-400 text-amber-400' : i === full && half ? 'fill-amber-400/50 text-amber-400' : 'text-slate-300 dark:text-slate-600'}`}
        />
      ))}
      <span className="ml-1 text-xs font-semibold text-on-surface-variant">{rating}</span>
    </span>
  );
}

function ProgressBar({ value, className = '' }) {
  return (
    <div className={`w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500"
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

function CourseThumbnail({ course, size = 'normal' }) {
  const gradient = THUMBNAIL_GRADIENTS[course.category] || 'from-slate-500 to-slate-700';
  const icon = CATEGORY_ICONS[course.category] || 'school';
  const h = size === 'small' ? 'h-28' : 'h-40';
  return (
    <div className={`${h} w-full bg-gradient-to-br ${gradient} rounded-t-2xl flex items-center justify-center relative overflow-hidden`}>
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-2 right-2 w-24 h-24 rounded-full border-2 border-white/30" />
        <div className="absolute bottom-3 left-3 w-16 h-16 rounded-full border-2 border-white/20" />
      </div>
      <span className="material-symbols-outlined text-white/90 text-5xl" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>
        {icon}
      </span>
    </div>
  );
}

function CourseCard({ course, onSelect, isEnrolled, progress }) {
  return (
    <button
      onClick={() => onSelect(course)}
      className="glass-card rounded-2xl overflow-hidden text-left hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group w-full"
    >
      <CourseThumbnail course={course} />
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold text-on-surface leading-tight line-clamp-2 group-hover:text-amber-600 transition-colors">
            {course.title}
          </h3>
          <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${DIFFICULTY_COLORS[course.difficulty] || ''}`}>
            {course.difficulty}
          </span>
        </div>

        <p className="text-xs text-on-surface-variant font-medium">{course.instructor}</p>

        <div className="flex items-center gap-3 text-[11px] text-on-surface-variant">
          <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{course.duration_hrs}h</span>
          <span className="inline-flex items-center gap-1"><BookOpen className="w-3 h-3" />{course.lesson_count} lessons</span>
          <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{(course.enrolled || 0).toLocaleString()}</span>
        </div>

        <StarRating rating={course.rating} />

        {isEnrolled && (
          <div className="pt-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-amber-600">{progress}% complete</span>
            </div>
            <ProgressBar value={progress} />
          </div>
        )}
      </div>
    </button>
  );
}

function ContinueLearningCard({ course, onSelect }) {
  return (
    <button
      onClick={() => onSelect(course)}
      className="glass-card rounded-2xl p-4 flex items-center gap-4 hover:shadow-lg transition-all duration-200 min-w-[320px] shrink-0 text-left group"
    >
      <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${THUMBNAIL_GRADIENTS[course.category] || 'from-slate-500 to-slate-700'} flex items-center justify-center shrink-0`}>
        <span className="material-symbols-outlined text-white text-2xl" style={{ fontVariationSettings: "'FILL' 0" }}>
          {CATEGORY_ICONS[course.category] || 'school'}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-bold text-on-surface truncate group-hover:text-amber-600 transition-colors">{course.title}</h4>
        <p className="text-xs text-on-surface-variant mt-0.5">{course.instructor}</p>
        <div className="mt-2">
          <ProgressBar value={course.progress} />
          <span className="text-[10px] font-semibold text-amber-600 mt-1 block">{course.progress}% complete</span>
        </div>
      </div>
      <ChevronRight className="w-5 h-5 text-on-surface-variant shrink-0 group-hover:text-amber-500 transition-colors" />
    </button>
  );
}

function CourseDetailPanel({ course, onClose, onEnroll, isEnrolled, completedLessons, onToggleLesson }) {
  const gradient = THUMBNAIL_GRADIENTS[course.category] || 'from-slate-500 to-slate-700';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl h-full bg-white dark:bg-slate-900 shadow-2xl overflow-y-auto animate-slide-in-right">
        {/* Header */}
        <div className={`h-48 bg-gradient-to-br ${gradient} relative flex items-end p-6`}>
          <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-black/20 hover:bg-black/40 text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-4 right-8 w-32 h-32 rounded-full border-2 border-white/30" />
          </div>
          <div>
            <span className={`text-[11px] font-bold px-3 py-1 rounded-full bg-white/20 text-white`}>
              {course.difficulty}
            </span>
            <h2 className="text-2xl font-black text-white mt-3 leading-tight">{course.title}</h2>
            <p className="text-white/80 text-sm mt-1">{course.instructor}</p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Stats Row */}
          <div className="flex items-center gap-4 text-sm text-on-surface-variant flex-wrap">
            <span className="inline-flex items-center gap-1.5"><Clock className="w-4 h-4" />{course.duration_hrs} hours</span>
            <span className="inline-flex items-center gap-1.5"><BookOpen className="w-4 h-4" />{course.lesson_count} lessons</span>
            <span className="inline-flex items-center gap-1.5"><Users className="w-4 h-4" />{(course.enrolled || 0).toLocaleString()} enrolled</span>
            <StarRating rating={course.rating} />
          </div>

          {/* Description */}
          <p className="text-sm text-on-surface-variant leading-relaxed">{course.description}</p>

          {/* Enroll / Progress */}
          {!isEnrolled ? (
            <button
              onClick={() => onEnroll(course.id)}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm hover:shadow-lg hover:shadow-amber-500/30 transition-all"
            >
              Enroll Now - Free
            </button>
          ) : (
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-on-surface">Your Progress</span>
                <span className="text-sm font-bold text-amber-600">
                  {Math.round((completedLessons.length / (course.syllabus?.length || 1)) * 100)}%
                </span>
              </div>
              <ProgressBar value={(completedLessons.length / (course.syllabus?.length || 1)) * 100} />
            </div>
          )}

          {/* Skills */}
          {course.skills && course.skills.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-on-surface mb-3">Skills You Will Learn</h3>
              <div className="flex flex-wrap gap-2">
                {course.skills.map((skill, i) => (
                  <span key={i} className="px-3 py-1 rounded-full bg-surface-container/50 border border-outline/20 text-xs font-semibold text-on-surface-variant">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Learning Outcomes */}
          {course.outcomes && course.outcomes.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-on-surface mb-3">Learning Outcomes</h3>
              <ul className="space-y-2">
                {course.outcomes.map((outcome, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-on-surface-variant">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    {outcome}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Syllabus */}
          {course.syllabus && course.syllabus.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-on-surface mb-3">Syllabus</h3>
              <div className="space-y-1">
                {course.syllabus.map((lesson, i) => {
                  const done = completedLessons.includes(lesson.id);
                  return (
                    <button
                      key={lesson.id}
                      onClick={() => isEnrolled && onToggleLesson(course.id, lesson.id, !done)}
                      disabled={!isEnrolled}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                        isEnrolled ? 'hover:bg-surface-container/50 cursor-pointer' : 'cursor-default'
                      } ${done ? 'opacity-70' : ''}`}
                    >
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                        done ? 'bg-emerald-500 text-white' : 'bg-surface-container/50 border border-outline/20 text-on-surface-variant'
                      }`}>
                        {done ? <CheckCircle className="w-4 h-4" /> : i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${done ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
                          {lesson.title}
                        </p>
                      </div>
                      <span className="text-[11px] text-on-surface-variant shrink-0">{lesson.duration}</span>
                      {isEnrolled && (
                        <Play className={`w-4 h-4 shrink-0 ${done ? 'text-emerald-500' : 'text-on-surface-variant'}`} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CourseLibrary() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [difficulty, setDifficulty] = useState('All');
  const [duration, setDuration] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [activeCourses, setActiveCourses] = useState([]);
  const [enrolledIds, setEnrolledIds] = useState(new Set());
  const [completedLessonsMap, setCompletedLessonsMap] = useState({});
  const [recommended, setRecommended] = useState([]);

  // Fetch courses and user progress
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [coursesRes, progressRes] = await Promise.allSettled([
        api.get('/courses', { params: { page: 1 } }),
        api.get('/courses/progress'),
      ]);

      if (coursesRes.status === 'fulfilled') {
        setCourses(coursesRes.value.data.data || []);
      }

      if (progressRes.status === 'fulfilled') {
        const prog = progressRes.value.data.data;
        setActiveCourses(prog.activeCourses || []);
        const ids = new Set((prog.activeCourses || []).map(c => c.id));
        setEnrolledIds(ids);
      }

      // Build recommended list from courses not yet enrolled
      if (coursesRes.status === 'fulfilled') {
        const all = coursesRes.value.data.data || [];
        const progressData = progressRes.status === 'fulfilled' ? progressRes.value.data.data : null;
        const enrolledSet = new Set((progressData?.activeCourses || []).map(c => c.id));
        const recs = all.filter(c => !enrolledSet.has(c.id)).sort((a, b) => b.rating - a.rating).slice(0, 4);
        setRecommended(recs);
      }
    } catch {
      // keep empty state
    } finally {
      setLoading(false);
    }
  }

  async function handleEnroll(courseId) {
    try {
      await api.post(`/courses/${courseId}/enroll`);
      setEnrolledIds(prev => new Set([...prev, courseId]));
      loadData();
    } catch (err) {
      console.error('Enroll failed:', err);
    }
  }

  async function handleToggleLesson(courseId, lessonId, completed) {
    try {
      const { data } = await api.post(`/courses/${courseId}/progress`, { lessonId, completed });
      setCompletedLessonsMap(prev => ({ ...prev, [courseId]: data.data.completedLessons }));
      // Refresh active courses to reflect progress
      loadData();
    } catch (err) {
      console.error('Progress update failed:', err);
    }
  }

  // Filter courses locally
  const filtered = courses.filter(c => {
    if (category !== 'All' && c.category !== category) return false;
    if (difficulty !== 'All' && c.difficulty !== difficulty) return false;
    if (duration !== 'All') {
      if (duration === '< 10 hrs' && c.duration_hrs >= 10) return false;
      if (duration === '10-20 hrs' && (c.duration_hrs < 10 || c.duration_hrs > 20)) return false;
      if (duration === '> 20 hrs' && c.duration_hrs <= 20) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        c.title.toLowerCase().includes(q) ||
        c.instructor.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        (c.skills || []).some(s => s.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // ─── Loading State ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="w-full max-w-7xl mx-auto py-24 flex justify-center">
        <div className="text-center">
          <div className="inline-block w-10 h-10 rounded-full border-2 border-amber-500 border-t-transparent animate-spin mb-4" />
          <p className="text-on-surface-variant font-semibold">Loading courses...</p>
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
              local_library
            </span>
            Course Library
          </h1>
          <p className="text-lg text-on-surface-variant font-medium max-w-lg">
            Browse courses, enroll, and track your learning progress across categories.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto">
          <div className="relative flex-1 lg:flex-none">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
            <input
              type="text"
              placeholder="Search courses..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full lg:w-72 pl-11 pr-4 py-3 bg-surface-container/50 border border-outline/20 rounded-2xl focus:ring-2 focus:ring-amber-500/20 outline-none font-medium text-sm text-on-surface placeholder:text-outline"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-3 rounded-2xl border transition-all ${showFilters ? 'bg-amber-500 text-white border-amber-500' : 'glass-card border-outline/20 text-on-surface-variant hover:bg-surface-container/50'}`}
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      {showFilters && (
        <div className="glass-card rounded-2xl p-5 mb-8 space-y-4">
          <div>
            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-2 block">Difficulty</label>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTIES.map(d => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    difficulty === d ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-surface-container/50 text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-2 block">Duration</label>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map(d => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    duration === d ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-surface-container/50 text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Category Chips ──────────────────────────────────────────────────── */}
      <div className="flex gap-3 overflow-x-auto pb-4 mb-8 scrollbar-hide">
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-5 py-2.5 rounded-2xl font-bold whitespace-nowrap text-sm transition-all duration-200 ${
              category === c
                ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
                : 'glass-card hover:bg-white/40 text-on-surface'
            }`}
          >
            {c !== 'All' && (
              <span className="material-symbols-outlined text-sm mr-1.5 align-middle" style={{ fontVariationSettings: "'FILL' 0" }}>
                {CATEGORY_ICONS[c] || 'school'}
              </span>
            )}
            {c}
          </button>
        ))}
      </div>

      {/* ── Continue Learning ───────────────────────────────────────────────── */}
      {activeCourses.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-black text-on-surface mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
            Continue Learning
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide">
            {activeCourses.map(course => (
              <ContinueLearningCard
                key={course.id}
                course={course}
                onSelect={setSelectedCourse}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Recommended For You ─────────────────────────────────────────────── */}
      {recommended.length > 0 && category === 'All' && !search && (
        <section className="mb-10">
          <h2 className="text-xl font-black text-on-surface mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-purple-500" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
            Recommended For You
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {recommended.map(course => (
              <CourseCard
                key={course.id}
                course={course}
                onSelect={setSelectedCourse}
                isEnrolled={enrolledIds.has(course.id)}
                progress={activeCourses.find(c => c.id === course.id)?.progress || 0}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── All Courses Grid ────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black text-on-surface">
            {category === 'All' ? 'All Courses' : category}
            <span className="ml-2 text-base font-medium text-on-surface-variant">({filtered.length})</span>
          </h2>
        </div>

        {filtered.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center">
            <span className="material-symbols-outlined text-5xl text-outline mb-3 block" style={{ fontVariationSettings: "'FILL' 0" }}>
              search_off
            </span>
            <p className="text-on-surface-variant font-semibold">No courses match your filters.</p>
            <p className="text-sm text-on-surface-variant mt-1">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map(course => (
              <CourseCard
                key={course.id}
                course={course}
                onSelect={setSelectedCourse}
                isEnrolled={enrolledIds.has(course.id)}
                progress={activeCourses.find(c => c.id === course.id)?.progress || 0}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Course Detail Panel ─────────────────────────────────────────────── */}
      {selectedCourse && (
        <CourseDetailPanel
          course={selectedCourse}
          onClose={() => setSelectedCourse(null)}
          onEnroll={handleEnroll}
          isEnrolled={enrolledIds.has(selectedCourse.id)}
          completedLessons={completedLessonsMap[selectedCourse.id] || []}
          onToggleLesson={handleToggleLesson}
        />
      )}
    </div>
  );
}
