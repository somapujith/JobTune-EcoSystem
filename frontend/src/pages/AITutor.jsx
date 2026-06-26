import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, ChevronRight, BookOpen, MessageSquare, X } from 'lucide-react';
import { api } from '../store/useAuthStore';
import { useActivityTracker } from '../hooks/useActivityTracker';

// ─────────────────────────────────────────────────────────────────────────────
// Topic Data
// ─────────────────────────────────────────────────────────────────────────────

const TOPIC_ICONS = {
  frontend: 'web',
  backend: 'dns',
  dsa: 'account_tree',
  dbms: 'storage',
  os: 'memory',
  networks: 'lan',
  'system-design': 'architecture',
  devops: 'cloud',
};

const QUICK_TOPICS = [
  { label: 'Explain React hooks', topic: 'frontend' },
  { label: 'How does TCP handshake work?', topic: 'networks' },
  { label: 'What is dynamic programming?', topic: 'dsa' },
  { label: 'Explain database indexing', topic: 'dbms' },
  { label: 'How does Docker work?', topic: 'devops' },
  { label: 'What is a deadlock?', topic: 'os' },
  { label: 'REST vs GraphQL', topic: 'backend' },
  { label: 'CAP theorem explained', topic: 'system-design' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Message Bubble
// ─────────────────────────────────────────────────────────────────────────────

function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  // Simple markdown-like rendering for code blocks
  function renderContent(text) {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith('```')) {
        const lines = part.slice(3, -3).split('\n');
        const lang = lines[0].trim();
        const code = lang ? lines.slice(1).join('\n') : lines.join('\n');
        return (
          <pre key={i} className="bg-black/40 rounded-xl p-4 my-3 overflow-x-auto border border-white/10">
            {lang && (
              <div className="text-xs text-sky-400 font-bold mb-2 uppercase tracking-wide">{lang}</div>
            )}
            <code className="text-sm text-emerald-300 font-mono leading-relaxed">{code}</code>
          </pre>
        );
      }
      // Handle inline bold (**text**)
      const boldParts = part.split(/(\*\*.*?\*\*)/g);
      return (
        <span key={i}>
          {boldParts.map((bp, j) => {
            if (bp.startsWith('**') && bp.endsWith('**')) {
              return <strong key={j} className="font-bold text-on-surface">{bp.slice(2, -2)}</strong>;
            }
            // Handle inline code (`text`)
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
    });
  }

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} mb-6`}>
      <div className={`flex-shrink-0 w-9 h-9 rounded-2xl flex items-center justify-center ${
        isUser
          ? 'bg-sky-500/20 text-sky-400'
          : 'bg-emerald-500/20 text-emerald-400'
      }`}>
        {isUser ? <User size={18} /> : <Bot size={18} />}
      </div>
      <div className={`max-w-[80%] ${isUser ? 'text-right' : ''}`}>
        <div className={`rounded-2xl px-5 py-3.5 ${
          isUser
            ? 'bg-sky-500/15 border border-sky-500/20 text-on-surface'
            : 'glass-card text-on-surface'
        }`}>
          <div className="text-sm leading-relaxed whitespace-pre-wrap">
            {renderContent(message.content)}
          </div>
        </div>
        <div className="text-xs text-on-surface-variant mt-1.5 px-2">
          {message.timestamp}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Typing Indicator
// ─────────────────────────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex gap-3 mb-6">
      <div className="flex-shrink-0 w-9 h-9 rounded-2xl flex items-center justify-center bg-emerald-500/20 text-emerald-400">
        <Bot size={18} />
      </div>
      <div className="glass-card rounded-2xl px-5 py-4">
        <div className="flex gap-1.5">
          <span className="w-2 h-2 rounded-full bg-on-surface-variant animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-on-surface-variant animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-on-surface-variant animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AITutor() {
  useActivityTracker('AI Tutor');
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedTopics, setSuggestedTopics] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatSessions, setChatSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(0);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Fetch available topics on mount
  useEffect(() => {
    fetchTopics();
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  async function fetchTopics() {
    try {
      const { data } = await api.get('/ai-tutor/topics');
      setTopics(data.topics || []);
    } catch (err) {
      console.error('Failed to fetch topics:', err);
      // Use fallback topics
      setTopics([
        { id: 'frontend', name: 'Frontend Development', icon: 'web', subtopics: ['React.js', 'JavaScript ES6+', 'CSS Frameworks'] },
        { id: 'backend', name: 'Backend Development', icon: 'dns', subtopics: ['Node.js & Express', 'REST API Design', 'Authentication'] },
        { id: 'dsa', name: 'Data Structures & Algorithms', icon: 'account_tree', subtopics: ['Arrays & Strings', 'Trees & Graphs', 'Dynamic Programming'] },
        { id: 'dbms', name: 'Database Management', icon: 'storage', subtopics: ['SQL Fundamentals', 'Normalization', 'Indexing'] },
        { id: 'os', name: 'Operating Systems', icon: 'memory', subtopics: ['Process Management', 'Memory Management', 'Deadlocks'] },
        { id: 'networks', name: 'Computer Networks', icon: 'lan', subtopics: ['TCP/IP', 'HTTP & HTTPS', 'DNS'] },
        { id: 'system-design', name: 'System Design', icon: 'architecture', subtopics: ['Scalability', 'Caching', 'Microservices'] },
        { id: 'devops', name: 'DevOps & Cloud', icon: 'cloud', subtopics: ['Docker', 'CI/CD', 'AWS Fundamentals'] },
      ]);
    }
  }

  function getTimestamp() {
    return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  function startNewSession() {
    if (messages.length > 0) {
      setChatSessions(prev => [
        ...prev,
        {
          id: activeSessionId,
          topic: selectedTopic?.name || 'General',
          preview: messages[0]?.content?.slice(0, 50) + '...',
          messageCount: messages.length,
          timestamp: new Date().toLocaleString()
        }
      ]);
    }
    setMessages([]);
    setSuggestedTopics([]);
    setActiveSessionId(prev => prev + 1);
    inputRef.current?.focus();
  }

  function selectTopic(topic) {
    setSelectedTopic(topic);
    if (messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: `Great choice! I'm ready to help you with **${topic.name}**. You can ask me anything about:\n\n${topic.subtopics.map(s => `- ${s}`).join('\n')}\n\nWhat would you like to learn about?`,
        timestamp: getTimestamp()
      }]);
      setSuggestedTopics(topic.subtopics.slice(0, 4));
    }
  }

  async function handleSend(overrideMessage) {
    const text = overrideMessage || inputValue.trim();
    if (!text || isLoading) return;

    const userMessage = {
      role: 'user',
      content: text,
      timestamp: getTimestamp()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const history = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content
      }));

      const { data } = await api.post('/ai-tutor/chat', {
        topic: selectedTopic?.id || 'general',
        message: text,
        history: history.slice(-8)
      });

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply,
        timestamp: getTimestamp()
      }]);

      if (data.suggestedTopics?.length > 0) {
        setSuggestedTopics(data.suggestedTopics);
      }
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again in a moment.',
        timestamp: getTimestamp()
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const hasStarted = messages.length > 0;

  return (
    <div className="page-container">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-emerald-400 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              school
            </span>
          </div>
          <h1 className="text-3xl font-extrabold text-on-surface dark:text-white font-headline page-title">AI Tutor</h1>
        </div>
        <p className="text-on-surface-variant text-sm ml-[52px]">
          Your personal AI tutor for CS concepts, coding, and interview prep
        </p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className={`${sidebarOpen ? 'w-72' : 'w-0'} transition-all duration-300 overflow-hidden flex-shrink-0 hidden lg:block`}>
          <div className="space-y-4">
            {/* New Chat Button */}
            <button
              onClick={startNewSession}
              className="w-full flex items-center gap-2 px-4 py-3 card rounded-2xl hover:bg-white/10 transition-colors text-on-surface dark:text-white font-bold text-sm"
            >
              <span className="material-symbols-outlined text-sky-400 text-lg">add</span>
              New Conversation
            </button>

            {/* Topics */}
            <div>
              <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider px-2 mb-3">Topics</h3>
              <div className="space-y-1">
                {topics.map(topic => (
                  <button
                    key={topic.id}
                    onClick={() => selectTopic(topic)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors text-left ${
                      selectedTopic?.id === topic.id
                        ? 'bg-sky-500/15 text-sky-400 font-bold'
                        : 'text-on-surface-variant hover:bg-white/5 hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>
                      {TOPIC_ICONS[topic.id] || 'category'}
                    </span>
                    <span className="truncate">{topic.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Recent Sessions */}
            {chatSessions.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider px-2 mb-3">Recent Chats</h3>
                <div className="space-y-1">
                  {chatSessions.slice(-5).reverse().map(session => (
                    <div
                      key={session.id}
                      className="px-3 py-2.5 rounded-xl text-sm text-on-surface-variant hover:bg-white/5 transition-colors cursor-default"
                    >
                      <div className="flex items-center gap-2">
                        <MessageSquare size={14} className="text-on-surface-variant flex-shrink-0" />
                        <span className="truncate text-on-surface text-xs font-medium">{session.preview}</span>
                      </div>
                      <div className="text-xs text-on-surface-variant mt-1 pl-[22px]">
                        {session.topic} &middot; {session.messageCount} msgs
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {!hasStarted ? (
            /* Welcome Screen */
            <div className="flex-1 flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-6">
                <Sparkles size={32} className="text-emerald-400" />
              </div>
              <h2 className="text-2xl font-black text-on-surface font-headline mb-2">What would you like to learn?</h2>
              <p className="text-on-surface-variant text-sm mb-8 text-center max-w-md">
                Choose a topic below or ask any CS question. I'll explain concepts, give examples, and help you practice.
              </p>

              {/* Topic Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10 w-full max-w-2xl">
                {topics.slice(0, 8).map(topic => (
                  <button
                    key={topic.id}
                    onClick={() => selectTopic(topic)}
                    className="glass-card rounded-2xl p-4 hover:bg-white/10 transition-all group text-left"
                  >
                    <span className="material-symbols-outlined text-2xl text-sky-400 group-hover:text-sky-300 mb-2 block" style={{ fontVariationSettings: "'FILL' 0" }}>
                      {TOPIC_ICONS[topic.id] || 'category'}
                    </span>
                    <span className="text-sm font-bold text-on-surface block truncate">{topic.name}</span>
                    <span className="text-xs text-on-surface-variant">{topic.subtopics?.length || 0} subtopics</span>
                  </button>
                ))}
              </div>

              {/* Quick Topics */}
              <div className="w-full max-w-2xl">
                <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3 px-1">Quick Questions</h3>
                <div className="flex flex-wrap gap-2">
                  {QUICK_TOPICS.map((qt, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        const topic = topics.find(t => t.id === qt.topic);
                        if (topic) setSelectedTopic(topic);
                        handleSend(qt.label);
                      }}
                      className="px-4 py-2 glass-card rounded-full text-sm text-on-surface-variant hover:text-on-surface hover:bg-white/10 transition-colors flex items-center gap-1.5"
                    >
                      <BookOpen size={14} />
                      {qt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Chat Messages */
            <div className="flex-1 overflow-y-auto rounded-3xl glass-card p-6 mb-4" style={{ maxHeight: 'calc(100vh - 320px)', minHeight: '400px' }}>
              {/* Topic Badge */}
              {selectedTopic && (
                <div className="flex items-center justify-center mb-6">
                  <div className="flex items-center gap-2 px-4 py-1.5 bg-surface-container/50 rounded-full">
                    <span className="material-symbols-outlined text-sm text-sky-400" style={{ fontVariationSettings: "'FILL' 0" }}>
                      {TOPIC_ICONS[selectedTopic.id] || 'category'}
                    </span>
                    <span className="text-xs font-bold text-on-surface-variant">{selectedTopic.name}</span>
                    <button
                      onClick={() => { setSelectedTopic(null); }}
                      className="text-on-surface-variant hover:text-on-surface ml-1"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <MessageBubble key={i} message={msg} />
              ))}

              {isLoading && <TypingIndicator />}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Suggested Topics Chips */}
          {suggestedTopics.length > 0 && !isLoading && hasStarted && (
            <div className="flex flex-wrap gap-2 mb-3 px-1">
              {suggestedTopics.map((st, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(st)}
                  className="px-3 py-1.5 text-xs font-bold rounded-full border border-outline/20 text-on-surface-variant hover:text-on-surface hover:bg-white/10 transition-colors flex items-center gap-1.5"
                >
                  <ChevronRight size={12} />
                  {st}
                </button>
              ))}
            </div>
          )}

          {/* Input Area */}
          <div className="glass-card rounded-2xl p-3 flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={selectedTopic ? `Ask about ${selectedTopic.name}...` : 'Ask me anything about CS...'}
                className="w-full bg-transparent text-on-surface text-sm placeholder:text-on-surface-variant resize-none outline-none px-3 py-2.5 min-h-[44px] max-h-[120px]"
                rows={1}
                style={{ height: 'auto' }}
                onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
              />
            </div>
            <button
              onClick={() => handleSend()}
              disabled={!inputValue.trim() || isLoading}
              className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                inputValue.trim() && !isLoading
                  ? 'bg-sky-500 text-white hover:bg-sky-600 shadow-lg shadow-sky-500/25'
                  : 'bg-surface-container/50 text-on-surface-variant cursor-not-allowed'
              }`}
            >
              <Send size={18} />
            </button>
          </div>

          {/* Mobile Topic Selector */}
          <div className="lg:hidden mt-4">
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none">
              {topics.slice(0, 6).map(topic => (
                <button
                  key={topic.id}
                  onClick={() => selectTopic(topic)}
                  className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                    selectedTopic?.id === topic.id
                      ? 'bg-sky-500/15 text-sky-400'
                      : 'bg-surface-container/50 text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 0" }}>
                    {TOPIC_ICONS[topic.id] || 'category'}
                  </span>
                  {topic.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
