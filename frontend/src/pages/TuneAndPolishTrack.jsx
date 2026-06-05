import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Target, FileText, Mic, Sparkles, ChevronRight, CheckCircle2, FileCode2, Zap, Send, Loader2 } from 'lucide-react';
import { api } from '../store/useAuthStore';

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
      setError(err?.response?.data?.error || 'Failed to generate STAR stories.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card rounded-3xl p-8 border border-white/50 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
      
      <div className="flex items-center gap-4 mb-6">
        <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl">
          <Sparkles className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Interview Copilot</h2>
          <p className="text-slate-500">Generate perfect STAR behavioral stories for your next interview</p>
        </div>
      </div>

      <form onSubmit={handleGenerate} className="flex gap-3 mb-8">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. A time I faced a conflict, or Leadership experience"
          className="flex-1 bg-surface-container border border-outline/20 rounded-xl px-5 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={loading || !topic.trim()}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white font-bold rounded-xl hover:from-indigo-600 hover:to-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_10px_20px_rgba(79,70,229,0.2)] transition-all"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          Generate
        </button>
      </form>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl mb-6 text-sm">{error}</div>
      )}

      {stories.length > 0 ? (
        <div className="space-y-6 relative z-10">
          {stories.map((story, i) => (
            <div key={i} className="bg-white/60 backdrop-blur-md border border-slate-200/60 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
              <h3 className="font-bold text-lg text-slate-900 mb-4">{story.title}</h3>
              <div className="space-y-4 text-sm">
                <div><span className="font-bold text-indigo-700">Situation:</span> <span className="text-slate-700">{story.situation}</span></div>
                <div><span className="font-bold text-indigo-700">Task:</span> <span className="text-slate-700">{story.task}</span></div>
                <div><span className="font-bold text-indigo-700">Action:</span> <span className="text-slate-700">{story.action}</span></div>
                <div><span className="font-bold text-indigo-700">Result:</span> <span className="text-slate-700">{story.result}</span></div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 px-6 bg-slate-50/50 rounded-2xl border border-dashed border-slate-300">
          <Sparkles className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Enter a topic above to generate professional STAR stories.</p>
        </div>
      )}
    </div>
  );
}

export default function TuneAndPolishTrack() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-10">
        <div className="p-4 bg-blue-100 text-blue-600 rounded-2xl">
          <Target className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-900">Tune & Polish</h1>
          <p className="text-slate-500 mt-1 text-lg">Fine-tune your application and crush your interviews.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Quick Links */}
        <div className="lg:col-span-1 space-y-6">
          <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            Quick Actions
          </h3>

          <Link to="/ats-checker" className="block glass-card p-6 rounded-2xl hover:-translate-y-1 transition-all border border-white/50 group">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-teal-50 text-teal-600 rounded-xl">
                <FileCode2 className="w-6 h-6" />
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-teal-600 group-hover:translate-x-1 transition-all" />
            </div>
            <h4 className="font-bold text-slate-900 mb-1">ATS Scanner</h4>
            <p className="text-sm text-slate-500">Scan your resume against a job description to find missing keywords.</p>
          </Link>

          <Link to="/resume" className="block glass-card p-6 rounded-2xl hover:-translate-y-1 transition-all border border-white/50 group">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                <FileText className="w-6 h-6" />
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
            </div>
            <h4 className="font-bold text-slate-900 mb-1">Resume Optimizer</h4>
            <p className="text-sm text-slate-500">Rewrite your bullet points to sound more impactful and results-driven.</p>
          </Link>

          <Link to="/interview" className="block glass-card p-6 rounded-2xl hover:-translate-y-1 transition-all border border-white/50 group">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                <Mic className="w-6 h-6" />
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all" />
            </div>
            <h4 className="font-bold text-slate-900 mb-1">Mock Interviews</h4>
            <p className="text-sm text-slate-500">Practice live technical and behavioral questions with an AI interviewer.</p>
          </Link>
        </div>

        {/* Right Column: Main Tool (STAR Copilot) */}
        <div className="lg:col-span-2">
          <STARGenerator />
        </div>

      </div>
    </div>
  );
}
