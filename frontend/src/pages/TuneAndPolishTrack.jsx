import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Target, FileText, Mic, Sparkles, ChevronRight, CheckCircle2, FileCode2,
  Zap, Send, Loader2, Circle, BarChart2, Trophy, ArrowRight, Brain,
  Star, TrendingUp, Briefcase, LinkedinIcon, Github, MessageSquare,
} from 'lucide-react';
import { api } from '../store/useAuthStore';
import { useUserProgress } from '../hooks/useUserProgress';

const READINESS_CHECKLIST = [
  {
    category: 'Resume & Portfolio',
    icon: FileText,
    color: 'text-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    items: [
      { id: 'resume-updated', label: 'Resume updated and polished', link: '/resume' },
      { id: 'ats-scanned', label: 'ATS score checked (≥80%)', link: '/ats-checker' },
      { id: 'resume-consistent', label: 'Resume consistency verified', link: '/resume-consistency' },
      { id: 'achievements-enhanced', label: 'Bullet points impact-enhanced', link: '/achievement-enhancer' },
    ],
  },
  {
    category: 'Online Presence',
    icon: TrendingUp,
    color: 'text-purple-600',
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    items: [
      { id: 'linkedin-optimized', label: 'LinkedIn profile optimized', link: '/linkedin' },
      { id: 'github-optimized', label: 'GitHub profile optimized', link: '/github' },
      { id: 'portfolio-built', label: 'Portfolio site published', link: '/portfolio' },
      { id: 'recruiter-visible', label: 'Recruiter visibility checked', link: '/recruiter-visibility' },
    ],
  },
  {
    category: 'Interview Preparation',
    icon: Mic,
    color: 'text-teal-600',
    bg: 'bg-teal-50 dark:bg-teal-950/30',
    items: [
      { id: 'mock-interview-done', label: 'Completed 3+ mock interviews', link: '/interview' },
      { id: 'star-stories', label: 'Prepared 5+ STAR stories', link: null },
      { id: 'cover-letter-ready', label: 'Cover letter template ready', link: '/cover-letter' },
      { id: 'communication-trained', label: 'Communication skills practiced', link: '/communication-skills' },
    ],
  },
  {
    category: 'Applications',
    icon: Briefcase,
    color: 'text-amber-600',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    items: [
      { id: 'jobs-tracked', label: 'Job applications tracked', link: '/jobs' },
      { id: 'job-analyzer-used', label: 'Used Job Analyzer on target roles', link: '/job-analyzer' },
      { id: 'job-fit-checked', label: 'Job fit analysis done', link: '/job-fit' },
      { id: 'applied-5-jobs', label: 'Applied to 5+ relevant positions', link: null },
    ],
  },
];

const QUICK_TOOLS = [
  { to: '/ats-checker', icon: FileCode2, label: 'ATS Checker', desc: 'Score your resume vs job descriptions', color: 'text-teal-600', bg: 'bg-teal-50 dark:bg-teal-950/30', tier: 'Tune & Polish' },
  { to: '/resume', icon: FileText, label: 'Resume Optimizer', desc: 'AI-powered bullet point rewriting', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30', tier: 'Tune & Polish' },
  { to: '/interview', icon: Mic, label: 'Mock Interview', desc: 'AI interviewer with instant feedback', color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950/30', tier: 'Tune & Polish' },
  { to: '/linkedin', icon: TrendingUp, label: 'LinkedIn Optimizer', desc: 'Profile scoring & improvement tips', color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/30', tier: 'Tune & Polish' },
  { to: '/github', icon: TrendingUp, label: 'GitHub Optimizer', desc: 'Showcase your coding contributions', color: 'text-slate-600', bg: 'bg-slate-100 dark:bg-slate-800', tier: 'Tune & Polish' },
  { to: '/achievement-enhancer', icon: Star, label: 'Achievement Enhancer', desc: 'Make resume bullets more impactful', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30', tier: 'Tune & Polish' },
];

const DEFAULTS = {
  checkedItems: {},
  starStories: [],
};

function STARGenerator() {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [stories, setStories] = useState([]);
  const [error, setError] = useState('');

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!topic.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/job-prep/star-stories', { topic });
      setStories(res.data.data.stories);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to generate STAR stories. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card rounded-2xl p-6 border border-white/50 dark:border-slate-700/50">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 rounded-xl">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white">Interview Copilot</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Generate STAR behavioral stories for any topic</p>
        </div>
      </div>

      <form onSubmit={handleGenerate} className="flex gap-2 mb-4">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. A time I led a team, or Conflict resolution"
          className="flex-1 input-field"
        />
        <button
          type="submit"
          disabled={loading || !topic.trim()}
          className="btn-primary flex items-center gap-2 whitespace-nowrap"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Generate
        </button>
      </form>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-3 rounded-xl mb-4">
          {error}
        </div>
      )}

      {stories.length > 0 ? (
        <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
          {stories.map((story, i) => (
            <div key={i} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4 rounded-xl">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-3">{story.title}</h4>
              <div className="space-y-2 text-sm">
                {['situation', 'task', 'action', 'result'].map(field => (
                  <div key={field} className="flex gap-2">
                    <span className="font-bold text-indigo-700 dark:text-indigo-400 capitalize shrink-0 min-w-[60px]">{field}:</span>
                    <span className="text-slate-700 dark:text-slate-300">{story[field]}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
          <Sparkles className="w-7 h-7 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Enter a topic to generate structured STAR stories</p>
        </div>
      )}
    </div>
  );
}

function ReadinessScore({ total, done }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const color = pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-600';
  const barColor = pct >= 75 ? 'from-emerald-400 to-teal-500' : pct >= 50 ? 'from-amber-400 to-orange-500' : 'from-rose-400 to-pink-500';
  const label = pct >= 75 ? 'Job Ready!' : pct >= 50 ? 'Getting There' : 'Keep Going';

  return (
    <div className="card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-indigo-500" />
          Job Readiness Score
        </h3>
        <span className={`text-2xl font-extrabold ${color}`}>{pct}%</span>
      </div>
      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-2">
        <div className={`h-full bg-gradient-to-r ${barColor} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{done} of {total} items complete</span>
        <span className={`font-bold ${color}`}>{label}</span>
      </div>
      {pct >= 75 && (
        <div className="mt-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 rounded-xl">
          <Trophy className="w-4 h-4 shrink-0" />
          You're ready to apply! Start sending out applications now.
        </div>
      )}
    </div>
  );
}

export default function TuneAndPolishTrack() {
  const { data: progress, updateProgress, isLoading: progressLoading, isSaving } = useUserProgress(
    'tune-and-polish',
    DEFAULTS
  );

  const checkedItems = progress.checkedItems || {};

  const allItems = READINESS_CHECKLIST.flatMap(c => c.items);
  const totalItems = allItems.length;
  const doneItems = allItems.filter(item => checkedItems[item.id]).length;

  const handleToggle = useCallback((id) => {
    updateProgress({ checkedItems: { ...checkedItems, [id]: !checkedItems[id] } });
  }, [checkedItems, updateProgress]);

  if (progressLoading) {
    return (
      <div className="page-container py-24 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="page-container space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-4 bg-blue-100 text-blue-600 rounded-2xl">
          <Target className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">
            Tune & Polish
            {isSaving && <span className="ml-3 text-blue-600 text-sm font-semibold">Saving…</span>}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Fine-tune everything and become job-application ready.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left: Readiness Checklist */}
        <div className="lg:col-span-1 space-y-4">
          <ReadinessScore total={totalItems} done={doneItems} />

          {READINESS_CHECKLIST.map(category => {
            const catDone = category.items.filter(item => checkedItems[item.id]).length;
            return (
              <div key={category.category} className="card rounded-2xl p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className={`p-2 rounded-xl ${category.bg}`}>
                    <category.icon className={`w-4 h-4 ${category.color}`} />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-sm text-slate-900 dark:text-white">{category.category}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{catDone}/{category.items.length} done</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {category.items.map(item => {
                    const done = !!checkedItems[item.id];
                    return (
                      <div key={item.id} className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggle(item.id)}
                          className={`flex-1 flex items-center gap-2 p-2 rounded-lg text-left transition-all text-xs ${
                            done
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-slate-400 dark:text-slate-500'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {done
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            : <Circle className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
                          <span className={done ? 'line-through' : ''}>{item.label}</span>
                        </button>
                        {item.link && (
                          <Link
                            to={item.link}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                          >
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Tools + STAR Generator */}
        <div className="lg:col-span-2 space-y-6">

          {/* Quick Tools Grid */}
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white text-lg mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              Your Toolkit
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {QUICK_TOOLS.map(({ to, icon: Icon, label, desc, color, bg }) => (
                <Link
                  key={to}
                  to={to}
                  className="card p-4 rounded-2xl flex items-center gap-3 hover:-translate-y-0.5 transition-all group border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                >
                  <div className={`p-2.5 rounded-xl ${bg} shrink-0`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-900 dark:text-white">{label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{desc}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 dark:group-hover:text-slate-400 shrink-0 transition-all group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </div>

          {/* STAR Story Generator */}
          <STARGenerator />

          {/* Interview Tips Banner */}
          <div className="card rounded-2xl p-5 border border-blue-100 dark:border-blue-900/50 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-950/50 text-blue-600 rounded-xl shrink-0">
                <Brain className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white mb-1">Interview Strategy Tips</h3>
                <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold mt-0.5">•</span>
                    Research the company's recent news, products, and culture before each interview.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold mt-0.5">•</span>
                    Prepare 3 thoughtful questions to ask the interviewer at the end.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold mt-0.5">•</span>
                    Practice out loud — not just in your head. Use the Mock Interview tool regularly.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold mt-0.5">•</span>
                    Follow up with a thank-you email within 24 hours after every interview.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Application Tracker CTA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link to="/jobs" className="card rounded-2xl p-5 hover:-translate-y-0.5 transition-all group">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 rounded-xl">
                  <Briefcase className="w-5 h-5 text-amber-600" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white">Job Tracker</h3>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Track all your applications, follow-ups, and interview stages in one place.</p>
              <div className="mt-3 flex items-center gap-1 text-amber-600 text-xs font-semibold">
                Open Tracker <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>
            <Link to="/cover-letter" className="card rounded-2xl p-5 hover:-translate-y-0.5 transition-all group">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-teal-50 dark:bg-teal-950/30 rounded-xl">
                  <MessageSquare className="w-5 h-5 text-teal-600" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white">Cover Letter Generator</h3>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Generate compelling, tailored cover letters for each job application in seconds.</p>
              <div className="mt-3 flex items-center gap-1 text-teal-600 text-xs font-semibold">
                Generate Now <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
