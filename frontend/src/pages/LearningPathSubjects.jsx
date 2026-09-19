import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Loader, BookOpen, ChevronRight, AlertCircle } from 'lucide-react';
import { api } from '../store/useAuthStore';

export default function LearningPathSubjects() {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.get('/learning-path/subjects')
      .then(({ data }) => {
        if (cancelled) return;
        setSubjects(data?.subjects || []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.response?.data?.error || 'Failed to load learning path subjects');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="w-full min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">Loading learning paths…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center glass-card rounded-3xl p-8">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Couldn't load subjects</h2>
          <p className="text-slate-600 dark:text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full py-12 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl mb-4">
            <BookOpen className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight mb-3">
            Learning Path
          </h1>
          <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Structured, tiered curricula to take you from fundamentals to job-ready — track your streak as you go.
          </p>
        </div>

        {subjects.length === 0 ? (
          <div className="glass-card rounded-3xl p-10 text-center max-w-lg mx-auto">
            <BookOpen className="w-10 h-10 text-slate-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No subjects available yet</h2>
            <p className="text-slate-600 dark:text-slate-400">
              Check back soon — new learning paths are added regularly.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {subjects.map((subject) => (
              <Link
                key={subject}
                to={`/learning-path/${encodeURIComponent(subject)}`}
                className="group glass-card rounded-3xl p-8 border border-white/50 dark:border-slate-700/50 hover:-translate-y-1 transition-all duration-300 hover:shadow-xl flex flex-col"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{subject}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Beginner → Intermediate → Job Tune tracks
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
