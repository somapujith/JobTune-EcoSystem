import React, { useState, useRef } from 'react';
import { Search, Lightbulb, Code, BookOpen, ChevronRight, Loader, History, X, Copy, Check, HelpCircle } from 'lucide-react';
import { api } from '../store/useAuthStore';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DOUBT_CATEGORIES = [
  { id: 'explain', label: 'Explain this concept', icon: 'lightbulb', color: 'text-amber-400', bg: 'bg-amber-500/15' },
  { id: 'how', label: 'How does X work?', icon: 'settings', color: 'text-sky-400', bg: 'bg-sky-500/15' },
  { id: 'error', label: 'Why does this error occur?', icon: 'bug_report', color: 'text-rose-400', bg: 'bg-rose-500/15' },
  { id: 'debug', label: 'Debug this code', icon: 'code', color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
];

const EXAMPLE_DOUBTS = [
  { text: 'What is the difference between let, const, and var?', category: 'explain' },
  { text: 'How does the JavaScript event loop work?', category: 'how' },
  { text: 'Why am I getting "Cannot read properties of undefined"?', category: 'error' },
  { text: 'What are closures and why are they useful?', category: 'explain' },
  { text: 'How does React reconciliation work?', category: 'how' },
  { text: 'Explain the difference between SQL JOIN types', category: 'explain' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Code Block Component
// ─────────────────────────────────────────────────────────────────────────────

function CodeBlock({ content }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    // Strip markdown code fences for clipboard
    const cleaned = content.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
    navigator.clipboard.writeText(cleaned);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const lines = content.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
  const langMatch = content.match(/^```(\w+)/);
  const lang = langMatch ? langMatch[1] : '';

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 my-3">
      <div className="flex items-center justify-between px-4 py-2 bg-black/50 border-b border-slate-200 dark:border-white/10">
        <span className="text-xs text-sky-400 font-bold uppercase tracking-wide">{lang || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-on-surface transition-colors"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="bg-black/40 p-4 overflow-x-auto">
        <code className="text-sm text-emerald-300 font-mono leading-relaxed">{lines}</code>
      </pre>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Render text with code blocks
// ─────────────────────────────────────────────────────────────────────────────

function RichText({ text }) {
  if (!text) return null;
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          return <CodeBlock key={i} content={part} />;
        }
        // Handle inline bold
        const boldParts = part.split(/(\*\*.*?\*\*)/g);
        return (
          <span key={i}>
            {boldParts.map((bp, j) => {
              if (bp.startsWith('**') && bp.endsWith('**')) {
                return <strong key={j} className="font-bold text-on-surface">{bp.slice(2, -2)}</strong>;
              }
              // Handle inline code
              const codeParts = bp.split(/(`[^`]+`)/g);
              return codeParts.map((cp, k) => {
                if (cp.startsWith('`') && cp.endsWith('`')) {
                  return (
                    <code key={k} className="bg-white/10 text-sky-300 px-1.5 py-0.5 rounded text-sm font-mono">
                      {cp.slice(1, -1)}
                    </code>
                  );
                }
                return cp;
              });
            })}
          </span>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution Card
// ─────────────────────────────────────────────────────────────────────────────

function ResolutionCard({ result, onRelatedClick }) {
  const [expandedSection, setExpandedSection] = useState({ concept: true, explanation: true, example: true, practice: true });

  function toggleSection(key) {
    setExpandedSection(prev => ({ ...prev, [key]: !prev[key] }));
  }

  const sections = [
    {
      key: 'concept',
      title: 'Concept',
      icon: 'category',
      iconColor: 'text-sky-400',
      content: result.concept
    },
    {
      key: 'explanation',
      title: 'Explanation',
      icon: 'description',
      iconColor: 'text-emerald-400',
      content: result.explanation
    },
    {
      key: 'example',
      title: 'Code Example',
      icon: 'code',
      iconColor: 'text-amber-400',
      content: result.example
    },
    {
      key: 'practice',
      title: 'Practice Question',
      icon: 'quiz',
      iconColor: 'text-purple-400',
      content: result.practiceQuestion
    }
  ];

  return (
    <div className="space-y-4">
      {sections.map(section => (
        <div key={section.key} className="card rounded-2xl overflow-hidden">
          <button
            onClick={() => toggleSection(section.key)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className={`material-symbols-outlined text-lg ${section.iconColor}`} style={{ fontVariationSettings: "'FILL' 0" }}>
                {section.icon}
              </span>
              <h3 className="text-base font-bold text-on-surface">{section.title}</h3>
            </div>
            <span
              className="material-symbols-outlined text-on-surface-variant text-lg transition-transform duration-200"
              style={{ fontVariationSettings: "'FILL' 0", transform: expandedSection[section.key] ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              expand_more
            </span>
          </button>
          {expandedSection[section.key] && (
            <div className="px-6 pb-5 text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">
              <RichText text={section.content} />
            </div>
          )}
        </div>
      ))}

      {/* Related Topics */}
      {result.relatedTopics?.length > 0 && (
        <div className="card rounded-2xl p-6">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-sky-400" style={{ fontVariationSettings: "'FILL' 0" }}>
              explore
            </span>
            Explore Related Topics
          </h3>
          <div className="flex flex-wrap gap-2">
            {result.relatedTopics.map((topic, i) => (
              <button
                key={i}
                onClick={() => onRelatedClick(topic)}
                className="px-4 py-2 rounded-full border border-outline/20 text-sm text-on-surface-variant hover:text-on-surface hover:bg-slate-100 dark:hover:bg-white/10 transition-colors flex items-center gap-1.5"
              >
                <ChevronRight size={14} />
                {topic}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* AI Badge */}
      <div className="flex items-center justify-center gap-2 py-2">
        <span className="text-xs text-on-surface-variant">
          {result.ai_powered ? 'Powered by AI' : 'Generated from knowledge base'}
        </span>
        <span className={`w-2 h-2 rounded-full ${result.ai_powered ? 'bg-emerald-400' : 'bg-amber-400'}`} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AIDoubtSolver() {
  const [doubt, setDoubt] = useState('');
  const [codeSnippet, setCodeSnippet] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [showCode, setShowCode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const doubtRef = useRef(null);

  async function handleSubmit(overrideDoubt, overrideCategory) {
    const doubtText = overrideDoubt || doubt.trim();
    const category = overrideCategory || selectedCategory?.id || 'explain';

    if (!doubtText || isLoading) return;

    setIsLoading(true);
    setResult(null);

    try {
      const { data } = await api.post('/ai-tutor/doubt', {
        doubt: doubtText,
        codeSnippet: codeSnippet.trim() || undefined,
        category
      });

      const enrichedResult = { ...data, doubt: doubtText, category, timestamp: new Date().toLocaleString() };
      setResult(enrichedResult);

      // Add to history
      setHistory(prev => [
        { id: Date.now(), doubt: doubtText, concept: data.concept, timestamp: new Date().toLocaleString() },
        ...prev
      ].slice(0, 20)); // Keep last 20
    } catch (err) {
      console.error('Doubt resolution error:', err);
      setResult({
        concept: 'Error',
        explanation: 'Sorry, something went wrong. Please try again.',
        example: '',
        practiceQuestion: '',
        relatedTopics: [],
        ai_powered: false
      });
    } finally {
      setIsLoading(false);
    }
  }

  function handleRelatedClick(topic) {
    setDoubt(`Explain: ${topic}`);
    setCodeSnippet('');
    setSelectedCategory(DOUBT_CATEGORIES[0]); // "Explain this concept"
    handleSubmit(`Explain: ${topic}`, 'explain');
  }

  function handleHistoryClick(item) {
    setDoubt(item.doubt);
    handleSubmit(item.doubt);
  }

  function handleExampleClick(example) {
    setDoubt(example.text);
    const cat = DOUBT_CATEGORIES.find(c => c.id === example.category);
    if (cat) setSelectedCategory(cat);
    handleSubmit(example.text, example.category);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-purple-500/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-purple-400 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              help
            </span>
          </div>
          <h1 className="text-3xl font-extrabold text-on-surface dark:text-white font-headline page-title">Doubt Solver</h1>
        </div>
        <p className="text-on-surface-variant text-sm ml-[52px]">
          Paste code or describe a concept -- get a structured explanation with examples
        </p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar - History */}
        <div className={`${sidebarOpen ? 'w-64' : 'w-0'} transition-all duration-300 overflow-hidden flex-shrink-0 hidden lg:block`}>
          <div className="space-y-4">
            {/* Clear / Toggle */}
            <div className="flex items-center justify-between px-2">
              <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
                <History size={14} />
                Recent Doubts
              </h3>
              {history.length > 0 && (
                <button
                  onClick={() => setHistory([])}
                  className="text-xs text-on-surface-variant hover:text-rose-400 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="card rounded-2xl p-4 text-center">
                <span className="material-symbols-outlined text-3xl text-on-surface-variant mb-2 block" style={{ fontVariationSettings: "'FILL' 0" }}>
                  history
                </span>
                <p className="text-xs text-on-surface-variant">Your resolved doubts will appear here</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {history.map(item => (
                  <button
                    key={item.id}
                    onClick={() => handleHistoryClick(item)}
                    className="w-full text-left card rounded-xl px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors group"
                  >
                    <div className="text-xs font-medium text-on-surface truncate group-hover:text-sky-400 transition-colors">
                      {item.doubt}
                    </div>
                    <div className="text-xs text-on-surface-variant mt-0.5 flex items-center gap-1">
                      <Lightbulb size={10} />
                      {item.concept}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Category Selector */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {DOUBT_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(selectedCategory?.id === cat.id ? null : cat)}
                className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
                  selectedCategory?.id === cat.id
                    ? `${cat.bg} ${cat.color} ring-1 ring-current/30`
                    : 'card text-on-surface-variant dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'
                }`}
              >
                <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>
                  {cat.icon}
                </span>
                <span className="truncate">{cat.label}</span>
              </button>
            ))}
          </div>

          {/* Doubt Input */}
          <div className="card rounded-2xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <HelpCircle size={16} className="text-on-surface-variant" />
              <label className="text-sm font-bold text-on-surface">Describe your doubt</label>
            </div>
            <textarea
              ref={doubtRef}
              value={doubt}
              onChange={e => setDoubt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g., What is the difference between null and undefined in JavaScript?"
              className="w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant resize-none outline-none focus:border-sky-500/50 transition-colors"
              rows={3}
            />

            {/* Code Snippet Toggle */}
            <div className="mt-3">
              <button
                onClick={() => setShowCode(!showCode)}
                className="flex items-center gap-2 text-xs font-bold text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <Code size={14} />
                {showCode ? 'Hide code snippet' : 'Add code snippet (optional)'}
                <span
                  className="material-symbols-outlined text-sm transition-transform duration-200"
                  style={{ fontVariationSettings: "'FILL' 0", transform: showCode ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                  expand_more
                </span>
              </button>

              {showCode && (
                <textarea
                  value={codeSnippet}
                  onChange={e => setCodeSnippet(e.target.value)}
                  placeholder="Paste your code here..."
                  className="w-full mt-3 bg-black/30 border border-outline/20 rounded-xl px-4 py-3 text-sm text-emerald-300 placeholder:text-on-surface-variant resize-none outline-none focus:border-sky-500/50 transition-colors font-mono"
                  rows={6}
                />
              )}
            </div>

            {/* Submit */}
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-on-surface-variant">
                Press Ctrl+Enter to submit
              </span>
              <button
                onClick={() => handleSubmit()}
                disabled={!doubt.trim() || isLoading}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  doubt.trim() && !isLoading
                    ? 'bg-sky-500 text-white hover:bg-sky-600 shadow-lg shadow-sky-500/25'
                    : 'bg-surface-container/50 text-on-surface-variant cursor-not-allowed'
                }`}
              >
                {isLoading ? (
                  <>
                    <Loader size={16} className="animate-spin" />
                    Resolving...
                  </>
                ) : (
                  <>
                    <Search size={16} />
                    Resolve Doubt
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="card rounded-2xl p-10 text-center mb-4">
              <div className="inline-block w-10 h-10 rounded-full border-2 border-sky-500 border-t-transparent animate-spin mb-4" />
              <p className="text-on-surface font-bold text-sm">Analyzing your doubt...</p>
              <p className="text-on-surface-variant text-xs mt-1">Breaking it down into structured concepts</p>
            </div>
          )}

          {/* Result */}
          {result && !isLoading && (
            <ResolutionCard result={result} onRelatedClick={handleRelatedClick} />
          )}

          {/* Example Doubts - show when no result */}
          {!result && !isLoading && (
            <div className="mt-8">
              <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-4 px-1 flex items-center gap-2">
                <BookOpen size={14} />
                Try these example doubts
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {EXAMPLE_DOUBTS.map((example, i) => {
                  const cat = DOUBT_CATEGORIES.find(c => c.id === example.category);
                  return (
                    <button
                      key={i}
                      onClick={() => handleExampleClick(example)}
                      className="card rounded-2xl p-4 text-left hover:bg-slate-100 dark:hover:bg-white/10 transition-all group"
                    >
                      <div className="flex items-start gap-3">
                        <span className={`material-symbols-outlined text-lg ${cat?.color || 'text-sky-400'} flex-shrink-0 mt-0.5`} style={{ fontVariationSettings: "'FILL' 0" }}>
                          {cat?.icon || 'help'}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-on-surface group-hover:text-sky-400 transition-colors">
                            {example.text}
                          </p>
                          <p className="text-xs text-on-surface-variant mt-1">{cat?.label}</p>
                        </div>
                      </div>
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
