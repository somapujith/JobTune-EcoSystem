import { useState, useRef } from 'react';
import { BookOpen, Copy, Download, Trash2, ChevronRight, RefreshCw, Sparkles } from 'lucide-react';
import { api } from '../store/useAuthStore';

// ─────────────────────────────────────────────────────────────────────────────
// Suggested topics
// ─────────────────────────────────────────────────────────────────────────────

const TOPIC_SUGGESTIONS = [
  { label: 'JavaScript Closures', icon: 'code' },
  { label: 'React Hooks', icon: 'webhook' },
  { label: 'REST API Design', icon: 'api' },
  { label: 'SQL Joins', icon: 'database' },
  { label: 'Data Structures', icon: 'account_tree' },
  { label: 'System Design Basics', icon: 'architecture' },
  { label: 'Git & Version Control', icon: 'merge_type' },
  { label: 'CSS Flexbox & Grid', icon: 'grid_view' },
  { label: 'Python OOP', icon: 'terminal' },
  { label: 'Docker Containers', icon: 'deployed_code' },
  { label: 'Agile & Scrum', icon: 'sprint' },
  { label: 'Machine Learning Basics', icon: 'model_training' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function notesToText(notes) {
  if (!notes) return '';
  const lines = [];
  lines.push(`# ${notes.title || 'Study Notes'}\n`);

  if (notes.type === 'mindmap') {
    lines.push(notes.content || '');
    return lines.join('\n');
  }

  if (notes.keyConcepts) {
    lines.push('## Key Concepts\n');
    if (Array.isArray(notes.keyConcepts)) {
      notes.keyConcepts.forEach(c => {
        if (typeof c === 'string') lines.push(`- ${c}`);
        else lines.push(`- **${c.term}**: ${c.description}`);
      });
    }
    lines.push('');
  }

  if (notes.detailedExplanation) {
    lines.push('## Detailed Explanation\n');
    lines.push(notes.detailedExplanation);
    lines.push('');
  }

  if (notes.codeExamples && notes.codeExamples.length > 0) {
    lines.push('## Code Examples\n');
    notes.codeExamples.forEach(ex => {
      if (ex.description) lines.push(`### ${ex.description}\n`);
      lines.push(`\`\`\`${ex.language || ''}`);
      lines.push(ex.code);
      lines.push('```\n');
    });
  }

  if (notes.summary) {
    lines.push('## Summary\n');
    lines.push(notes.summary);
    lines.push('');
  }

  if (notes.keyTakeaways) {
    lines.push('## Key Takeaways\n');
    notes.keyTakeaways.forEach(t => lines.push(`- ${t}`));
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AINotesGenerator() {
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingType, setLoadingType] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jt_notes_history') || '[]'); }
    catch { return []; }
  });
  const [showSidebar, setShowSidebar] = useState(true);
  const inputRef = useRef(null);

  function saveHistory(newNotes) {
    const entry = { id: Date.now(), topic: newNotes.title || topic, type: newNotes.type, createdAt: new Date().toISOString() };
    const updated = [entry, ...history].slice(0, 20);
    setHistory(updated);
    localStorage.setItem('jt_notes_history', JSON.stringify(updated));
  }

  async function generateNotes(type = 'detailed', topicOverride) {
    const t = (topicOverride || topic).trim();
    if (!t) { setError('Please enter a topic'); return; }
    setError('');
    setLoading(true);
    setLoadingType(type);
    try {
      const { data } = await api.post('/study-tools/notes/generate', { topic: t, type });
      if (data.success && data.data) {
        setNotes(data.data);
        saveHistory(data.data);
      } else {
        setError('Failed to generate notes. Please try again.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate notes');
    } finally {
      setLoading(false);
      setLoadingType(null);
    }
  }

  function handleCopy() {
    const text = notesToText(notes);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleExport() {
    const text = notesToText(notes);
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(notes?.title || 'notes').replace(/[^a-zA-Z0-9]/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleSave() {
    const saved = JSON.parse(localStorage.getItem('jt_saved_notes') || '[]');
    saved.unshift({ ...notes, savedAt: new Date().toISOString() });
    localStorage.setItem('jt_saved_notes', JSON.stringify(saved.slice(0, 50)));
  }

  function handleTopicClick(t) {
    setTopic(t);
    generateNotes('detailed', t);
  }

  function clearHistory() {
    setHistory([]);
    localStorage.removeItem('jt_notes_history');
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-3xl text-blue-500">auto_stories</span>
          <h1 className="font-headline text-2xl md:text-3xl text-on-surface font-bold">AI Notes Generator</h1>
        </div>
        <p className="text-on-surface-variant text-sm md:text-base">Generate comprehensive study notes, revision summaries, and mind maps on any topic.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Input area */}
          <div className="glass-card rounded-2xl p-6 mb-6">
            <label className="text-on-surface font-semibold text-sm mb-2 block">Enter a topic or paste content</label>
            <div className="flex gap-3">
              <input
                ref={inputRef}
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && generateNotes('detailed')}
                placeholder="e.g., JavaScript Promises, Binary Search Trees, REST API Design..."
                className="flex-1 bg-surface-container border border-outline/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all"
              />
              <button
                onClick={() => generateNotes('detailed')}
                disabled={loading}
                className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
              >
                {loading && loadingType === 'detailed' ? (
                  <><span className="material-symbols-outlined text-lg animate-spin">sync</span> Generating...</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> Generate Notes</>
                )}
              </button>
            </div>

            {/* Quick actions */}
            <div className="flex flex-wrap gap-2 mt-4">
              <button
                onClick={() => generateNotes('revision')}
                disabled={loading || !topic.trim()}
                className="px-3 py-1.5 rounded-lg bg-surface-container/50 border border-outline/20 text-on-surface-variant text-xs font-medium hover:bg-surface-container transition-all disabled:opacity-40 flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {loading && loadingType === 'revision' ? 'Generating...' : 'Revision Notes'}
              </button>
              <button
                onClick={() => generateNotes('mindmap')}
                disabled={loading || !topic.trim()}
                className="px-3 py-1.5 rounded-lg bg-surface-container/50 border border-outline/20 text-on-surface-variant text-xs font-medium hover:bg-surface-container transition-all disabled:opacity-40 flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">account_tree</span>
                {loading && loadingType === 'mindmap' ? 'Generating...' : 'Mind Map'}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="glass-card rounded-2xl p-4 mb-6 border-l-4 border-red-500">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="glass-card rounded-2xl p-12 mb-6 flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full border-3 border-blue-500 border-t-transparent animate-spin mb-4" />
              <p className="text-on-surface font-semibold">
                {loadingType === 'mindmap' ? 'Generating mind map...' : loadingType === 'revision' ? 'Creating revision notes...' : 'Generating detailed notes...'}
              </p>
              <p className="text-on-surface-variant text-sm mt-1">This may take a moment</p>
            </div>
          )}

          {/* Notes display */}
          {notes && !loading && (
            <div className="glass-card rounded-2xl overflow-hidden">
              {/* Notes header */}
              <div className="p-6 border-b border-outline/10">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        notes.type === 'mindmap' ? 'bg-purple-500/20 text-purple-400' :
                        notes.type === 'revision' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {notes.type === 'mindmap' ? 'Mind Map' : notes.type === 'revision' ? 'Revision' : 'Detailed'}
                      </span>
                    </div>
                    <h2 className="text-on-surface font-bold text-xl">{notes.title}</h2>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={handleCopy} className="p-2 rounded-lg hover:bg-surface-container/50 text-on-surface-variant transition-all" title="Copy">
                      <Copy className="w-4 h-4" />
                    </button>
                    <button onClick={handleExport} className="p-2 rounded-lg hover:bg-surface-container/50 text-on-surface-variant transition-all" title="Export">
                      <Download className="w-4 h-4" />
                    </button>
                    <button onClick={handleSave} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-all flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" /> Save
                    </button>
                  </div>
                </div>
                {copied && <p className="text-emerald-400 text-xs mt-2">Copied to clipboard!</p>}
              </div>

              {/* Notes body */}
              <div className="p-6 space-y-6">
                {/* Mind map */}
                {notes.type === 'mindmap' && notes.content && (
                  <pre className="bg-surface-container/50 rounded-xl p-5 text-on-surface text-sm font-mono whitespace-pre-wrap overflow-x-auto border border-outline/10">
                    {notes.content}
                  </pre>
                )}

                {/* Key Concepts */}
                {notes.keyConcepts && (
                  <div>
                    <h3 className="text-on-surface font-semibold text-lg mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-blue-500">lightbulb</span> Key Concepts
                    </h3>
                    <div className="grid gap-3">
                      {notes.keyConcepts.map((c, i) => (
                        <div key={i} className="bg-surface-container/50 rounded-xl p-4 border border-outline/10">
                          {typeof c === 'string' ? (
                            <p className="text-on-surface text-sm">{c}</p>
                          ) : (
                            <>
                              <p className="text-on-surface font-semibold text-sm">{c.term}</p>
                              <p className="text-on-surface-variant text-sm mt-1">{c.description}</p>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Detailed Explanation */}
                {notes.detailedExplanation && (
                  <div>
                    <h3 className="text-on-surface font-semibold text-lg mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-indigo-500">description</span> Detailed Explanation
                    </h3>
                    <div className="bg-surface-container/50 rounded-xl p-5 border border-outline/10">
                      {notes.detailedExplanation.split('\n').map((para, i) => (
                        <p key={i} className="text-on-surface text-sm leading-relaxed mb-3 last:mb-0">{para}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Code Examples */}
                {notes.codeExamples && notes.codeExamples.length > 0 && (
                  <div>
                    <h3 className="text-on-surface font-semibold text-lg mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-emerald-500">code</span> Code Examples
                    </h3>
                    {notes.codeExamples.map((ex, i) => (
                      <div key={i} className="mb-4 last:mb-0">
                        {ex.description && <p className="text-on-surface-variant text-sm mb-2">{ex.description}</p>}
                        <pre className="bg-gray-900 rounded-xl p-4 text-emerald-300 text-sm font-mono overflow-x-auto">
                          <code>{ex.code}</code>
                        </pre>
                      </div>
                    ))}
                  </div>
                )}

                {/* Summary */}
                {notes.summary && (
                  <div>
                    <h3 className="text-on-surface font-semibold text-lg mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-amber-500">summarize</span> Summary
                    </h3>
                    <div className="bg-surface-container/50 rounded-xl p-5 border border-outline/10">
                      <p className="text-on-surface text-sm leading-relaxed">{notes.summary}</p>
                    </div>
                  </div>
                )}

                {/* Key Takeaways */}
                {notes.keyTakeaways && (
                  <div>
                    <h3 className="text-on-surface font-semibold text-lg mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-rose-500">star</span> Key Takeaways
                    </h3>
                    <ul className="space-y-2">
                      {notes.keyTakeaways.map((t, i) => (
                        <li key={i} className="flex items-start gap-3 bg-surface-container/50 rounded-xl p-3 border border-outline/10">
                          <span className="material-symbols-outlined text-emerald-500 text-lg mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                          <span className="text-on-surface text-sm">{t}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!notes && !loading && !error && (
            <div className="glass-card rounded-2xl p-12 flex flex-col items-center justify-center text-center">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-4">auto_stories</span>
              <h3 className="text-on-surface font-semibold text-lg mb-2">Ready to generate notes</h3>
              <p className="text-on-surface-variant text-sm max-w-md">
                Enter any topic above and click Generate Notes. You can also create revision summaries or mind maps.
              </p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className={`lg:w-72 shrink-0 ${showSidebar ? '' : 'hidden lg:block'}`}>
          {/* Topic Suggestions */}
          <div className="glass-card rounded-2xl p-5 mb-4">
            <h3 className="text-on-surface font-semibold text-sm mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-500 text-lg">tips_and_updates</span> Topic Ideas
            </h3>
            <div className="space-y-1.5">
              {TOPIC_SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleTopicClick(s.label)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-container/50 text-on-surface-variant text-sm transition-all flex items-center gap-2 group"
                >
                  <span className="material-symbols-outlined text-base text-on-surface-variant/50 group-hover:text-blue-500 transition-colors">{s.icon}</span>
                  <span className="group-hover:text-on-surface transition-colors">{s.label}</span>
                  <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>

          {/* History */}
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-on-surface font-semibold text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-500 text-lg">history</span> History
              </h3>
              {history.length > 0 && (
                <button onClick={clearHistory} className="text-on-surface-variant/50 hover:text-red-400 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <p className="text-on-surface-variant/50 text-xs">No notes generated yet</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {history.map(h => (
                  <button
                    key={h.id}
                    onClick={() => handleTopicClick(h.topic)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-container/50 transition-all"
                  >
                    <p className="text-on-surface text-sm truncate">{h.topic}</p>
                    <p className="text-on-surface-variant/50 text-xs mt-0.5">
                      {h.type} &middot; {new Date(h.createdAt).toLocaleDateString()}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setShowSidebar(s => !s)}
        className="fixed bottom-6 right-6 lg:hidden w-12 h-12 rounded-full bg-blue-600 text-white shadow-lg flex items-center justify-center z-50"
      >
        <span className="material-symbols-outlined">{showSidebar ? 'close' : 'menu'}</span>
      </button>
    </div>
  );
}
