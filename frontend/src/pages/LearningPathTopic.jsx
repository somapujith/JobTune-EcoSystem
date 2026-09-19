import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import mermaid from 'mermaid';
import {
  Loader, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, Circle, Flame,
} from 'lucide-react';
import { api } from '../store/useAuthStore';
import { useDarkMode } from '../hooks/useDarkMode';

const TIER_LABELS = {
  Beginner: 'Beginner',
  Intermediate: 'Intermediate',
  Job_Tune: 'Job Tune',
};

let mermaidInitializedTheme = null;
function ensureMermaidInitialized(isDark) {
  const theme = isDark ? 'dark' : 'neutral';
  if (mermaidInitializedTheme === theme) return;
  mermaid.initialize({ startOnLoad: false, theme, securityLevel: 'strict' });
  mermaidInitializedTheme = theme;
}

let mermaidDiagramCounter = 0;

function MermaidDiagram({ code }) {
  const containerRef = useRef(null);
  const [error, setError] = useState('');
  const idRef = useRef(`learning-path-mermaid-${++mermaidDiagramCounter}`);
  const [isDark] = useDarkMode();

  useEffect(() => {
    let cancelled = false;
    ensureMermaidInitialized(isDark);
    setError('');

    mermaid.render(idRef.current, code)
      .then(({ svg }) => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = svg;
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Failed to render diagram');
      });

    return () => { cancelled = true; };
  }, [code, isDark]);

  if (error) {
    return (
      <div className="my-4 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
        Couldn't render diagram: {error}
      </div>
    );
  }

  return (
    <div
      className="my-6 p-4 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 overflow-x-auto flex justify-center"
      role="img"
      aria-label="Diagram"
    >
      <div ref={containerRef} />
    </div>
  );
}

function CodeBlock({ inline, className, children, ...props }) {
  const languageMatch = /language-(\w+)/.exec(className || '');
  const language = languageMatch?.[1];
  const raw = String(children).replace(/\n$/, '');

  if (!inline && language === 'mermaid') {
    return <MermaidDiagram code={raw} />;
  }

  if (inline) {
    return (
      <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-rose-600 dark:text-rose-400 text-[0.85em] font-mono" {...props}>
        {children}
      </code>
    );
  }

  return (
    <pre className="my-4 p-4 rounded-xl bg-slate-900 text-slate-100 overflow-x-auto text-sm font-mono leading-relaxed">
      <code className={className} {...props}>{children}</code>
    </pre>
  );
}

const markdownComponents = {
  code: CodeBlock,
  h1: (props) => <h1 className="text-3xl font-black text-slate-900 dark:text-white mt-8 mb-4" {...props} />,
  h2: (props) => <h2 className="text-2xl font-bold text-slate-900 dark:text-white mt-8 mb-3" {...props} />,
  h3: (props) => <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-6 mb-2" {...props} />,
  h4: (props) => <h4 className="text-lg font-bold text-slate-900 dark:text-white mt-4 mb-2" {...props} />,
  p: (props) => <p className="text-slate-700 dark:text-slate-300 leading-relaxed mb-4" {...props} />,
  ul: (props) => <ul className="list-disc list-outside pl-6 mb-4 space-y-1 text-slate-700 dark:text-slate-300" {...props} />,
  ol: (props) => <ol className="list-decimal list-outside pl-6 mb-4 space-y-1 text-slate-700 dark:text-slate-300" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  a: (props) => <a className="text-blue-600 dark:text-blue-400 hover:underline font-medium" target="_blank" rel="noopener noreferrer" {...props} />,
  blockquote: (props) => (
    <blockquote className="border-l-4 border-blue-300 dark:border-blue-700 pl-4 italic text-slate-600 dark:text-slate-400 my-4" {...props} />
  ),
  strong: (props) => <strong className="font-bold text-slate-900 dark:text-white" {...props} />,
  hr: () => <hr className="my-8 border-slate-200 dark:border-slate-700" />,
  table: (props) => (
    <div className="overflow-x-auto my-4">
      <table className="min-w-full border border-slate-200 dark:border-slate-700 rounded-lg" {...props} />
    </div>
  ),
  thead: (props) => <thead className="bg-slate-100 dark:bg-slate-800" {...props} />,
  th: (props) => <th className="px-4 py-2 text-left text-sm font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700" {...props} />,
  td: (props) => <td className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800" {...props} />,
};

export default function LearningPathTopic() {
  const { subject, tier, slug } = useParams();
  const navigate = useNavigate();

  const [topic, setTopic] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [siblingTopics, setSiblingTopics] = useState(null);

  const [completing, setCompleting] = useState(false);
  const [completeMessage, setCompleteMessage] = useState('');
  const [latestStreak, setLatestStreak] = useState(null);

  const tierLabel = TIER_LABELS[tier] || tier;

  const fetchTopic = useCallback(() => {
    setLoading(true);
    setError('');
    api.get(`/learning-path/${encodeURIComponent(subject)}/${tier}/${encodeURIComponent(slug)}`)
      .then(({ data }) => {
        setTopic(data);
      })
      .catch((err) => {
        setError(err.response?.data?.error || 'Failed to load topic');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [subject, tier, slug]);

  useEffect(() => {
    fetchTopic();
    setCompleteMessage('');
    setLatestStreak(null);
  }, [fetchTopic]);

  // Fetch sibling list for prev/next navigation
  useEffect(() => {
    let cancelled = false;
    api.get(`/learning-path/${encodeURIComponent(subject)}/${tier}`)
      .then(({ data }) => {
        if (!cancelled) setSiblingTopics(data?.topics || []);
      })
      .catch(() => {
        if (!cancelled) setSiblingTopics([]);
      });
    return () => { cancelled = true; };
  }, [subject, tier]);

  const { prevTopic, nextTopic } = useMemo(() => {
    if (!siblingTopics || siblingTopics.length === 0) return { prevTopic: null, nextTopic: null };
    const sorted = [...siblingTopics].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((t) => t.slug === slug);
    if (idx === -1) return { prevTopic: null, nextTopic: null };
    return {
      prevTopic: idx > 0 ? sorted[idx - 1] : null,
      nextTopic: idx < sorted.length - 1 ? sorted[idx + 1] : null,
    };
  }, [siblingTopics, slug]);

  const handleToggleComplete = async () => {
    if (!topic || completing) return;
    setCompleting(true);
    setCompleteMessage('');
    const wasCompleted = topic.completed;

    // Optimistic update
    setTopic((prev) => ({ ...prev, completed: !wasCompleted }));

    try {
      const method = wasCompleted ? 'delete' : 'post';
      const { data } = await api[method](`/learning-path/${encodeURIComponent(subject)}/${tier}/${encodeURIComponent(slug)}/complete`);
      setTopic((prev) => ({ ...prev, completed: data.completed, completedAt: data.completed ? new Date().toISOString() : null }));
      setLatestStreak(data.streak || null);
      setCompleteMessage(data.completed ? 'Marked as complete!' : 'Marked as incomplete');
      setSiblingTopics((prev) => prev?.map((t) => (t.slug === slug ? { ...t, completed: data.completed } : t)) ?? prev);
    } catch (err) {
      // Revert optimistic update on failure
      setTopic((prev) => ({ ...prev, completed: wasCompleted }));
      setCompleteMessage(err.response?.data?.error || 'Failed to update completion status');
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">Loading topic…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center glass-card rounded-3xl p-8">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Couldn't load topic</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">{error}</p>
          <Link
            to={`/learning-path/${encodeURIComponent(subject)}`}
            className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline"
          >
            <ChevronLeft className="w-4 h-4" /> Back to {subject}
          </Link>
        </div>
      </div>
    );
  }

  if (!topic) return null;

  return (
    <div className="w-full py-10 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <Link
          to={`/learning-path/${encodeURIComponent(subject)}`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors mb-6"
        >
          <ChevronLeft className="w-4 h-4" /> {subject} / {tierLabel}
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
              {tierLabel}
            </span>
            {topic.order != null && (
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                Topic {topic.order}
              </span>
            )}
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            {topic.title}
          </h1>
        </div>

        {/* Markdown content */}
        <div className="glass-card rounded-3xl p-6 sm:p-8 mb-8 border border-white/50 dark:border-slate-700/50">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={markdownComponents}>
            {topic.contentMd || ''}
          </ReactMarkdown>
        </div>

        {/* Complete toggle */}
        <div className="glass-card rounded-2xl p-5 mb-8 border border-white/50 dark:border-slate-700/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <button
            onClick={handleToggleComplete}
            disabled={completing}
            className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-60 ${
              topic.completed
                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg'
            }`}
          >
            {completing ? (
              <Loader className="w-5 h-5 animate-spin" />
            ) : topic.completed ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <Circle className="w-5 h-5" />
            )}
            {topic.completed ? 'Completed' : 'Mark as complete'}
          </button>

          <div className="flex items-center gap-4 flex-wrap">
            {completeMessage && (
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">{completeMessage}</span>
            )}
            {latestStreak && (
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-orange-600 dark:text-orange-400">
                <Flame className="w-4 h-4" /> {latestStreak.currentStreak} day streak
              </span>
            )}
          </div>
        </div>

        {/* Prev / Next navigation */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => prevTopic && navigate(`/learning-path/${encodeURIComponent(subject)}/${tier}/${encodeURIComponent(prevTopic.slug)}`)}
            disabled={!prevTopic}
            className="glass-card rounded-2xl p-4 border border-white/50 dark:border-slate-700/50 flex items-center gap-3 text-left disabled:opacity-40 disabled:cursor-not-allowed hover:-translate-y-0.5 transition-all duration-200 enabled:hover:shadow-md"
          >
            <ChevronLeft className="w-5 h-5 text-slate-400 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Previous</div>
              <div className="font-semibold text-slate-900 dark:text-white truncate">
                {prevTopic ? prevTopic.title : 'None'}
              </div>
            </div>
          </button>

          <button
            onClick={() => nextTopic && navigate(`/learning-path/${encodeURIComponent(subject)}/${tier}/${encodeURIComponent(nextTopic.slug)}`)}
            disabled={!nextTopic}
            className="glass-card rounded-2xl p-4 border border-white/50 dark:border-slate-700/50 flex items-center justify-end gap-3 text-right disabled:opacity-40 disabled:cursor-not-allowed hover:-translate-y-0.5 transition-all duration-200 enabled:hover:shadow-md"
          >
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Next</div>
              <div className="font-semibold text-slate-900 dark:text-white truncate">
                {nextTopic ? nextTopic.title : 'None'}
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
}
