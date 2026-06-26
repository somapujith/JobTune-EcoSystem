import React, { useState, useEffect } from 'react';
import { api } from '../store/useAuthStore';
import { Users, Plus, ArrowUp, ArrowDown, MessageSquare, Eye, Calendar, Trophy, Star, Loader2, X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function InitialsAvatar({ name, size = 'md', color }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const sizeClasses = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-12 h-12 text-lg' : 'w-10 h-10 text-sm';
  const bg = color || '#6366f1';
  return (
    <div className={`${sizeClasses} rounded-full flex items-center justify-center font-bold text-white shrink-0`} style={{ background: bg }}>
      {initials}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback Data
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'general', name: 'General', icon: 'forum', color: '#6366f1', threadCount: 24 },
  { id: 'frontend', name: 'Frontend', icon: 'web', color: '#3b82f6', threadCount: 18 },
  { id: 'backend', name: 'Backend', icon: 'dns', color: '#10b981', threadCount: 15 },
  { id: 'dsa', name: 'DSA', icon: 'data_object', color: '#f59e0b', threadCount: 31 },
  { id: 'placements', name: 'Placements', icon: 'work', color: '#ef4444', threadCount: 22 },
  { id: 'projects', name: 'Projects', icon: 'rocket_launch', color: '#8b5cf6', threadCount: 12 },
  { id: 'career-advice', name: 'Career Advice', icon: 'lightbulb', color: '#ec4899', threadCount: 9 },
];

const FALLBACK_THREADS = [
  { id: 1, title: 'Best resources for learning React hooks in 2026?', author: 'Arjun Mehta', category: 'frontend', tags: ['react', 'hooks', 'learning'], replies: 14, views: 230, votes: 23, createdAt: '2026-06-25T10:30:00Z', body: 'I have been trying to master React hooks but find useReducer and custom hooks confusing. What resources helped you the most?' },
  { id: 2, title: 'How I cleared Amazon SDE-1 in 3 months', author: 'Priya Sharma', category: 'placements', tags: ['amazon', 'interview', 'tips'], replies: 28, views: 892, votes: 67, createdAt: '2026-06-24T08:15:00Z', body: 'Sharing my complete preparation strategy including resources, timeline, and daily schedule that helped me crack the Amazon interview.' },
  { id: 3, title: 'System Design basics for freshers - where to start?', author: 'Rahul Gupta', category: 'backend', tags: ['system-design', 'freshers'], replies: 9, views: 156, votes: 15, createdAt: '2026-06-23T14:00:00Z', body: 'As a final year student, I feel overwhelmed by system design. Where should I begin without jumping to advanced topics?' },
  { id: 4, title: 'Dynamic Programming roadmap for competitive programming', author: 'Sneha Patel', category: 'dsa', tags: ['dp', 'competitive', 'roadmap'], replies: 21, views: 445, votes: 38, createdAt: '2026-06-22T19:45:00Z', body: 'Here is my curated roadmap for mastering DP problems, organized from easy to hard with specific LeetCode problem numbers.' },
  { id: 5, title: 'Should I learn Next.js or Remix for my portfolio?', author: 'Karan Singh', category: 'frontend', tags: ['nextjs', 'remix', 'portfolio'], replies: 11, views: 178, votes: 12, createdAt: '2026-06-21T11:20:00Z', body: 'Building my portfolio website and confused between Next.js and Remix. Which one looks better to recruiters?' },
  { id: 6, title: 'Freelancing while in college - tips and legalities', author: 'Meera Iyer', category: 'career-advice', tags: ['freelancing', 'income', 'college'], replies: 7, views: 134, votes: 19, createdAt: '2026-06-20T16:30:00Z', body: 'I want to start freelancing on Upwork while in my 3rd year. Any tips on managing time and handling payments?' },
  { id: 7, title: 'Open source contribution guide for beginners', author: 'Vikram Joshi', category: 'projects', tags: ['open-source', 'github', 'beginners'], replies: 16, views: 312, votes: 42, createdAt: '2026-06-19T09:00:00Z', body: 'A step-by-step guide on how to find, contribute to, and maintain open source projects as a college student.' },
];

const FALLBACK_REPLIES = [
  { id: 1, author: 'Nisha Kumar', body: 'I highly recommend the official React docs - they revamped them completely and the new interactive tutorials are excellent.', votes: 8, createdAt: '2026-06-25T11:00:00Z' },
  { id: 2, author: 'Dev Patel', body: 'Check out Jack Herrington\'s YouTube channel. His advanced React patterns series covers hooks in depth with real-world examples.', votes: 12, createdAt: '2026-06-25T12:30:00Z' },
  { id: 3, author: 'Ananya Roy', body: 'Build a small project using only hooks - that is how I learned. I made a task manager with useReducer and useContext.', votes: 5, createdAt: '2026-06-25T14:15:00Z' },
];

const FALLBACK_GROUPS = [
  { id: 1, name: 'DSA Daily Grind', topic: 'Data Structures & Algorithms', members: 48, maxMembers: 50, active: true, color: '#f59e0b', description: 'Solve 2 problems daily, discuss approaches every evening at 8 PM.' },
  { id: 2, name: 'Full Stack Builders', topic: 'MERN Stack Projects', members: 32, maxMembers: 40, active: true, color: '#3b82f6', description: 'Build full-stack projects together. Currently working on an e-commerce platform.' },
  { id: 3, name: 'Placement Prep 2026', topic: 'Campus Placements', members: 65, maxMembers: 100, active: true, color: '#ef4444', description: 'Mock interviews, resume reviews, and placement tips for the upcoming season.' },
  { id: 4, name: 'ML/AI Explorers', topic: 'Machine Learning', members: 27, maxMembers: 30, active: false, color: '#8b5cf6', description: 'Learn ML fundamentals together. Weekend study sessions with hands-on projects.' },
];

const FALLBACK_EVENTS = [
  { id: 1, title: 'CodeSprint 2026 - National Hackathon', date: '2026-07-15', type: 'Hackathon', participants: 342, color: '#ef4444', description: '48-hour hackathon with prizes worth 5L. Teams of 2-4.' },
  { id: 2, title: 'Weekly DSA Contest #47', date: '2026-06-29', type: 'Contest', participants: 128, color: '#f59e0b', description: '90-minute timed contest with 4 problems of increasing difficulty.' },
  { id: 3, title: 'Resume Building Workshop by Google Engineer', date: '2026-07-05', type: 'Workshop', participants: 89, color: '#3b82f6', description: 'Learn how to craft ATS-friendly resumes from a senior Google recruiter.' },
];

const FALLBACK_LEADERBOARD = [
  { rank: 1, name: 'Priya Sharma', points: 2840, badges: 12, streak: 45, color: '#f59e0b' },
  { rank: 2, name: 'Arjun Mehta', points: 2650, badges: 10, streak: 38, color: '#6366f1' },
  { rank: 3, name: 'Sneha Patel', points: 2490, badges: 11, streak: 32, color: '#10b981' },
  { rank: 4, name: 'Vikram Joshi', points: 2210, badges: 9, streak: 28, color: '#3b82f6' },
  { rank: 5, name: 'Meera Iyer', points: 1980, badges: 8, streak: 21, color: '#8b5cf6' },
  { rank: 6, name: 'Rahul Gupta', points: 1870, badges: 7, streak: 19, color: '#ec4899' },
  { rank: 7, name: 'Karan Singh', points: 1650, badges: 6, streak: 15, color: '#ef4444' },
  { rank: 8, name: 'Nisha Kumar', points: 1520, badges: 6, streak: 12, color: '#14b8a6' },
  { rank: 9, name: 'Dev Patel', points: 1340, badges: 5, streak: 10, color: '#f97316' },
  { rank: 10, name: 'Ananya Roy', points: 1180, badges: 4, streak: 8, color: '#6366f1' },
];

const FALLBACK_BADGES = [
  { id: 1, name: 'First Post', icon: 'edit_note', description: 'Created your first forum thread', earned: true, color: '#3b82f6' },
  { id: 2, name: 'Helpful Hand', icon: 'volunteer_activism', description: 'Received 10 upvotes on replies', earned: true, color: '#10b981' },
  { id: 3, name: 'Streak Master', icon: 'local_fire_department', description: 'Maintained a 7-day activity streak', earned: true, color: '#f59e0b' },
  { id: 4, name: 'Team Player', icon: 'groups', description: 'Joined 3 or more study groups', earned: true, color: '#8b5cf6' },
  { id: 5, name: 'Problem Solver', icon: 'psychology', description: 'Answered 25 forum questions', earned: false, color: '#ef4444' },
  { id: 6, name: 'Event Regular', icon: 'event_available', description: 'Attended 5 community events', earned: false, color: '#ec4899' },
  { id: 7, name: 'Code Reviewer', icon: 'rate_review', description: 'Reviewed 10 peer projects', earned: false, color: '#14b8a6' },
  { id: 8, name: 'Mentor', icon: 'school', description: 'Helped 50 community members', earned: false, color: '#f97316' },
];

const TABS = [
  { id: 'forums', label: 'Forums', icon: 'forum' },
  { id: 'groups', label: 'Study Groups', icon: 'groups' },
  { id: 'events', label: 'Events', icon: 'event' },
  { id: 'leaderboard', label: 'Leaderboard', icon: 'leaderboard' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function Community() {
  const [activeTab, setActiveTab] = useState('forums');
  const [threads, setThreads] = useState(FALLBACK_THREADS);
  const [groups, setGroups] = useState(FALLBACK_GROUPS);
  const [events, setEvents] = useState(FALLBACK_EVENTS);
  const [leaderboard, setLeaderboard] = useState(FALLBACK_LEADERBOARD);
  const [badges, setBadges] = useState(FALLBACK_BADGES);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedThread, setSelectedThread] = useState(null);
  const [replies, setReplies] = useState(FALLBACK_REPLIES);
  const [showNewThread, setShowNewThread] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newThread, setNewThread] = useState({ title: '', body: '', category: 'general', tags: '' });
  const [newGroup, setNewGroup] = useState({ name: '', topic: '', description: '', maxMembers: 30 });
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch data on mount
  useEffect(() => {
    api.get('/community/forums').then(({ data }) => {
      if (data?.categories) { /* merge with categories */ }
    }).catch(() => {});
    api.get('/community/groups').then(({ data }) => {
      if (Array.isArray(data?.groups) && data.groups.length) setGroups(data.groups);
    }).catch(() => {});
    api.get('/community/events').then(({ data }) => {
      if (Array.isArray(data?.events) && data.events.length) setEvents(data.events);
    }).catch(() => {});
    api.get('/community/leaderboard').then(({ data }) => {
      if (Array.isArray(data?.leaderboard) && data.leaderboard.length) setLeaderboard(data.leaderboard);
    }).catch(() => {});
  }, []);

  const filteredThreads = selectedCategory
    ? threads.filter(t => t.category === selectedCategory)
    : threads;

  const handleCreateThread = async () => {
    if (!newThread.title.trim() || !newThread.body.trim()) return;
    setLoading(true);
    try {
      const res = await api.post('/community/forums/thread', {
        title: newThread.title,
        body: newThread.body,
        category: newThread.category,
        tags: newThread.tags.split(',').map(t => t.trim()).filter(Boolean),
      });
      if (res.data?.thread) {
        setThreads(prev => [res.data.thread, ...prev]);
      }
    } catch {
      // Keep local state
      const fakeThread = {
        id: Date.now(),
        title: newThread.title,
        body: newThread.body,
        author: 'You',
        category: newThread.category,
        tags: newThread.tags.split(',').map(t => t.trim()).filter(Boolean),
        replies: 0, views: 0, votes: 0,
        createdAt: new Date().toISOString(),
      };
      setThreads(prev => [fakeThread, ...prev]);
    } finally {
      setShowNewThread(false);
      setNewThread({ title: '', body: '', category: 'general', tags: '' });
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroup.name.trim() || !newGroup.topic.trim()) return;
    setLoading(true);
    try {
      const res = await api.post('/community/groups', newGroup);
      if (res.data?.group) setGroups(prev => [res.data.group, ...prev]);
    } catch {
      const fakeGroup = {
        id: Date.now(), ...newGroup, members: 1, active: true,
        color: ['#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444'][Math.floor(Math.random()*5)],
      };
      setGroups(prev => [fakeGroup, ...prev]);
    } finally {
      setShowNewGroup(false);
      setNewGroup({ name: '', topic: '', description: '', maxMembers: 30 });
      setLoading(false);
    }
  };

  const handleVote = async (threadId, direction) => {
    try {
      await api.post(`/community/forums/thread/${threadId}/vote`, { direction });
    } catch { /* ignore */ }
    setThreads(prev => prev.map(t =>
      t.id === threadId ? { ...t, votes: t.votes + (direction === 'up' ? 1 : -1) } : t
    ));
    if (selectedThread?.id === threadId) {
      setSelectedThread(prev => ({ ...prev, votes: prev.votes + (direction === 'up' ? 1 : -1) }));
    }
  };

  const handleReply = async () => {
    if (!replyText.trim() || !selectedThread) return;
    setLoading(true);
    try {
      await api.post(`/community/forums/thread/${selectedThread.id}/reply`, { body: replyText });
    } catch { /* ignore */ }
    setReplies(prev => [...prev, { id: Date.now(), author: 'You', body: replyText, votes: 0, createdAt: new Date().toISOString() }]);
    setReplyText('');
    setLoading(false);
  };

  const openThread = async (thread) => {
    setSelectedThread(thread);
    try {
      const res = await api.get(`/community/forums/thread/${thread.id}`);
      if (res.data?.replies) setReplies(res.data.replies);
    } catch {
      setReplies(FALLBACK_REPLIES);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Forums
  // ─────────────────────────────────────────────────────────────────────────

  const renderForums = () => {
    if (selectedThread) {
      return (
        <div className="space-y-6">
          <button onClick={() => { setSelectedThread(null); setReplies(FALLBACK_REPLIES); }} className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-colors font-medium">
            <span className="material-symbols-outlined text-lg">arrow_back</span> Back to threads
          </button>

          <div className="glass-card rounded-3xl p-8">
            <div className="flex items-start gap-4 mb-6">
              <div className="flex flex-col items-center gap-1">
                <button onClick={() => handleVote(selectedThread.id, 'up')} className="p-1 hover:bg-emerald-500/10 rounded-lg transition-colors">
                  <ArrowUp className="w-5 h-5 text-emerald-500" />
                </button>
                <span className="font-bold text-on-surface text-lg">{selectedThread.votes}</span>
                <button onClick={() => handleVote(selectedThread.id, 'down')} className="p-1 hover:bg-rose-500/10 rounded-lg transition-colors">
                  <ArrowDown className="w-5 h-5 text-rose-400" />
                </button>
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-black text-on-surface mb-2">{selectedThread.title}</h2>
                <div className="flex items-center gap-3 mb-4">
                  <InitialsAvatar name={selectedThread.author} size="sm" />
                  <span className="font-semibold text-on-surface text-sm">{selectedThread.author}</span>
                  <span className="text-on-surface-variant text-xs">{timeAgo(selectedThread.createdAt)}</span>
                </div>
                <p className="text-on-surface-variant leading-relaxed">{selectedThread.body}</p>
                <div className="flex gap-2 mt-4">
                  {selectedThread.tags?.map(tag => (
                    <span key={tag} className="px-3 py-1 bg-surface-container/50 border border-outline/20 rounded-xl text-xs font-semibold text-on-surface-variant">#{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
            <MessageSquare className="w-5 h-5" /> {replies.length} Replies
          </h3>

          <div className="space-y-4">
            {replies.map(reply => (
              <div key={reply.id} className="glass-card rounded-2xl p-6 ml-8 border-l-2 border-outline/20">
                <div className="flex items-center gap-3 mb-3">
                  <InitialsAvatar name={reply.author} size="sm" color="#10b981" />
                  <span className="font-semibold text-on-surface text-sm">{reply.author}</span>
                  <span className="text-on-surface-variant text-xs">{timeAgo(reply.createdAt)}</span>
                </div>
                <p className="text-on-surface-variant leading-relaxed">{reply.body}</p>
              </div>
            ))}
          </div>

          <div className="glass-card rounded-2xl p-6">
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="Write your reply..."
              rows={3}
              className="w-full bg-surface-container/50 border border-outline/20 rounded-xl p-4 text-on-surface placeholder:text-outline resize-none focus:ring-2 focus:ring-indigo-500/20 outline-none"
            />
            <div className="flex justify-end mt-3">
              <button onClick={handleReply} disabled={loading || !replyText.trim()} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reply'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-8">
        {/* Category chips */}
        <div className="flex gap-3 overflow-x-auto pb-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-5 py-2.5 rounded-2xl font-bold whitespace-nowrap transition-all text-sm ${!selectedCategory ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'glass-card hover:bg-white/40 text-on-surface'}`}
          >
            All Topics
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-5 py-2.5 rounded-2xl font-bold whitespace-nowrap transition-all text-sm flex items-center gap-2 ${selectedCategory === cat.id ? 'text-white shadow-lg' : 'glass-card hover:bg-white/40 text-on-surface'}`}
              style={selectedCategory === cat.id ? { background: cat.color, boxShadow: `0 8px 20px ${cat.color}40` } : {}}
            >
              <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 0" }}>{cat.icon}</span>
              {cat.name}
              <span className="text-xs opacity-80">({cat.threadCount})</span>
            </button>
          ))}
        </div>

        {/* New Thread button */}
        <div className="flex justify-end">
          <button onClick={() => setShowNewThread(true)} className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20">
            <Plus className="w-4 h-4" /> New Discussion
          </button>
        </div>

        {/* Thread list */}
        <div className="space-y-4">
          {filteredThreads.map(thread => {
            const cat = CATEGORIES.find(c => c.id === thread.category);
            return (
              <div key={thread.id} onClick={() => openThread(thread)} className="glass-card rounded-2xl p-5 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group">
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <button onClick={e => { e.stopPropagation(); handleVote(thread.id, 'up'); }} className="p-0.5 hover:bg-emerald-500/10 rounded transition-colors">
                      <ArrowUp className="w-4 h-4 text-emerald-500" />
                    </button>
                    <span className="font-bold text-on-surface text-sm">{thread.votes}</span>
                    <button onClick={e => { e.stopPropagation(); handleVote(thread.id, 'down'); }} className="p-0.5 hover:bg-rose-500/10 rounded transition-colors">
                      <ArrowDown className="w-4 h-4 text-rose-400" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      {cat && (
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold text-white" style={{ background: cat.color }}>{cat.name}</span>
                      )}
                      <h3 className="text-on-surface font-bold group-hover:text-indigo-600 transition-colors truncate">{thread.title}</h3>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-on-surface-variant">
                      <span className="flex items-center gap-1.5">
                        <InitialsAvatar name={thread.author} size="sm" color={cat?.color} />
                        <span className="font-medium">{thread.author}</span>
                      </span>
                      <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {thread.replies}</span>
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {thread.views}</span>
                      <span>{timeAgo(thread.createdAt)}</span>
                    </div>
                    <div className="flex gap-1.5 mt-2">
                      {thread.tags?.slice(0, 3).map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-surface-container/50 border border-outline/10 rounded-lg text-[10px] font-semibold text-on-surface-variant">#{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Study Groups
  // ─────────────────────────────────────────────────────────────────────────

  const renderGroups = () => (
    <div className="space-y-8">
      <div className="flex justify-end">
        <button onClick={() => setShowNewGroup(true)} className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20">
          <Plus className="w-4 h-4" /> Create Study Group
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {groups.map(group => (
          <div key={group.id} className="glass-card rounded-3xl p-6 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `linear-gradient(90deg, ${group.color}, ${group.color}80)` }} />
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: group.color + '20' }}>
                  <Users className="w-6 h-6" style={{ color: group.color }} />
                </div>
                <div>
                  <h3 className="font-bold text-on-surface text-lg">{group.name}</h3>
                  <p className="text-on-surface-variant text-sm">{group.topic}</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${group.active ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-500/10 text-slate-500'}`}>
                {group.active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="text-on-surface-variant text-sm mb-4 leading-relaxed">{group.description}</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 0" }}>group</span>
                <span className="font-semibold">{group.members}/{group.maxMembers}</span> members
              </div>
              <button className="px-5 py-2 rounded-xl font-bold text-sm transition-colors hover:opacity-90 text-white" style={{ background: group.color }}>
                {group.members >= group.maxMembers ? 'Full' : 'Join'}
              </button>
            </div>
            <div className="w-full bg-surface-container/50 rounded-full h-1.5 mt-3">
              <div className="h-full rounded-full transition-all" style={{ width: `${(group.members / group.maxMembers) * 100}%`, background: group.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Events
  // ─────────────────────────────────────────────────────────────────────────

  const renderEvents = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {events.map(event => {
        const d = new Date(event.date);
        const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
        const day = d.getDate();
        return (
          <div key={event.id} className="glass-card rounded-3xl p-6 hover:-translate-y-1 transition-all duration-300 group relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `linear-gradient(90deg, ${event.color}, ${event.color}80)` }} />
            <div className="flex items-start gap-4 mb-4">
              <div className="flex flex-col items-center justify-center w-16 h-16 rounded-2xl border-2 border-outline/20 bg-surface-container/50 shrink-0">
                <span className="text-[10px] font-bold text-on-surface-variant tracking-wider">{month}</span>
                <span className="text-2xl font-black text-on-surface leading-none">{day}</span>
              </div>
              <div className="flex-1 min-w-0">
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold text-white mb-2 inline-block" style={{ background: event.color }}>{event.type}</span>
                <h3 className="font-bold text-on-surface text-base leading-snug">{event.title}</h3>
              </div>
            </div>
            <p className="text-on-surface-variant text-sm mb-4 leading-relaxed">{event.description}</p>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 0" }}>group</span>
                <span className="font-semibold">{event.participants}</span> registered
              </span>
              <button className="px-5 py-2 rounded-xl font-bold text-sm text-white hover:opacity-90 transition-colors" style={{ background: event.color }}>
                Register
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Leaderboard
  // ─────────────────────────────────────────────────────────────────────────

  const renderLeaderboard = () => (
    <div className="space-y-8">
      {/* Top 3 podium */}
      <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
        {leaderboard.slice(0, 3).map((user, i) => {
          const medals = ['#f59e0b', '#94a3b8', '#cd7f32'];
          const heights = ['h-32', 'h-24', 'h-20'];
          const order = [1, 0, 2];
          const u = leaderboard[order[i]];
          return (
            <div key={u.rank} className="flex flex-col items-center">
              <InitialsAvatar name={u.name} size="lg" color={medals[order[i]]} />
              <p className="font-bold text-on-surface text-sm mt-2 text-center">{u.name}</p>
              <p className="text-on-surface-variant text-xs font-semibold">{u.points} pts</p>
              <div className={`w-full ${heights[order[i]]} rounded-t-2xl mt-2 flex items-end justify-center pb-2`} style={{ background: `${medals[order[i]]}20`, borderTop: `3px solid ${medals[order[i]]}` }}>
                <span className="text-2xl font-black" style={{ color: medals[order[i]] }}>#{u.rank}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Full table */}
      <div className="glass-card rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-outline/20">
                <th className="text-left py-4 px-6 text-on-surface-variant text-xs font-bold uppercase tracking-wider">Rank</th>
                <th className="text-left py-4 px-6 text-on-surface-variant text-xs font-bold uppercase tracking-wider">Student</th>
                <th className="text-left py-4 px-6 text-on-surface-variant text-xs font-bold uppercase tracking-wider">Points</th>
                <th className="text-left py-4 px-6 text-on-surface-variant text-xs font-bold uppercase tracking-wider">Badges</th>
                <th className="text-left py-4 px-6 text-on-surface-variant text-xs font-bold uppercase tracking-wider">Streak</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map(user => (
                <tr key={user.rank} className="border-b border-outline/10 hover:bg-surface-container/30 transition-colors">
                  <td className="py-4 px-6">
                    <span className={`font-black text-lg ${user.rank <= 3 ? 'text-amber-500' : 'text-on-surface-variant'}`}>#{user.rank}</span>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <InitialsAvatar name={user.name} size="sm" color={user.color} />
                      <span className="font-semibold text-on-surface">{user.name}</span>
                    </div>
                  </td>
                  <td className="py-4 px-6 font-bold text-on-surface">{user.points.toLocaleString()}</td>
                  <td className="py-4 px-6">
                    <span className="flex items-center gap-1">
                      <Trophy className="w-4 h-4 text-amber-500" />
                      <span className="font-semibold text-on-surface">{user.badges}</span>
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-orange-500 text-base" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
                      <span className="font-semibold text-on-surface">{user.streak}d</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Badge showcase */}
      <div>
        <h3 className="text-xl font-black text-on-surface mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>military_tech</span>
          Badge Showcase
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {badges.map(badge => (
            <div key={badge.id} className={`glass-card rounded-2xl p-5 text-center transition-all duration-200 ${badge.earned ? 'hover:-translate-y-1' : 'opacity-50 grayscale'}`}>
              <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-3" style={{ background: badge.color + '20' }}>
                <span className="material-symbols-outlined text-2xl" style={{ color: badge.color, fontVariationSettings: "'FILL' 1" }}>{badge.icon}</span>
              </div>
              <p className="font-bold text-on-surface text-sm mb-1">{badge.name}</p>
              <p className="text-on-surface-variant text-xs leading-snug">{badge.description}</p>
              {badge.earned && (
                <span className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-emerald-600">
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span> Earned
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Modals
  // ─────────────────────────────────────────────────────────────────────────

  const renderNewThreadModal = () => {
    if (!showNewThread) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="glass-card rounded-3xl p-8 w-full max-w-lg shadow-2xl relative">
          <button onClick={() => setShowNewThread(false)} className="absolute top-4 right-4 p-2 hover:bg-surface-container/50 rounded-xl transition-colors">
            <X className="w-5 h-5 text-on-surface-variant" />
          </button>
          <h2 className="text-xl font-black text-on-surface mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-500" style={{ fontVariationSettings: "'FILL' 0" }}>add_circle</span>
            New Discussion
          </h2>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Thread title..."
              value={newThread.title}
              onChange={e => setNewThread(prev => ({ ...prev, title: e.target.value }))}
              className="w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-outline focus:ring-2 focus:ring-indigo-500/20 outline-none font-medium"
            />
            <select
              value={newThread.category}
              onChange={e => setNewThread(prev => ({ ...prev, category: e.target.value }))}
              className="w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-3 text-on-surface focus:ring-2 focus:ring-indigo-500/20 outline-none font-medium"
            >
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <textarea
              placeholder="Write your post..."
              value={newThread.body}
              onChange={e => setNewThread(prev => ({ ...prev, body: e.target.value }))}
              rows={5}
              className="w-full bg-surface-container/50 border border-outline/20 rounded-xl p-4 text-on-surface placeholder:text-outline resize-none focus:ring-2 focus:ring-indigo-500/20 outline-none"
            />
            <input
              type="text"
              placeholder="Tags (comma separated)..."
              value={newThread.tags}
              onChange={e => setNewThread(prev => ({ ...prev, tags: e.target.value }))}
              className="w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-outline focus:ring-2 focus:ring-indigo-500/20 outline-none font-medium"
            />
            <button onClick={handleCreateThread} disabled={loading || !newThread.title.trim() || !newThread.body.trim()} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Post Discussion'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderNewGroupModal = () => {
    if (!showNewGroup) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="glass-card rounded-3xl p-8 w-full max-w-lg shadow-2xl relative">
          <button onClick={() => setShowNewGroup(false)} className="absolute top-4 right-4 p-2 hover:bg-surface-container/50 rounded-xl transition-colors">
            <X className="w-5 h-5 text-on-surface-variant" />
          </button>
          <h2 className="text-xl font-black text-on-surface mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-500" style={{ fontVariationSettings: "'FILL' 0" }}>group_add</span>
            Create Study Group
          </h2>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Group name..."
              value={newGroup.name}
              onChange={e => setNewGroup(prev => ({ ...prev, name: e.target.value }))}
              className="w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-outline focus:ring-2 focus:ring-indigo-500/20 outline-none font-medium"
            />
            <input
              type="text"
              placeholder="Topic (e.g., MERN Stack, DSA)..."
              value={newGroup.topic}
              onChange={e => setNewGroup(prev => ({ ...prev, topic: e.target.value }))}
              className="w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-outline focus:ring-2 focus:ring-indigo-500/20 outline-none font-medium"
            />
            <textarea
              placeholder="Description..."
              value={newGroup.description}
              onChange={e => setNewGroup(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              className="w-full bg-surface-container/50 border border-outline/20 rounded-xl p-4 text-on-surface placeholder:text-outline resize-none focus:ring-2 focus:ring-indigo-500/20 outline-none"
            />
            <input
              type="number"
              placeholder="Max members..."
              value={newGroup.maxMembers}
              onChange={e => setNewGroup(prev => ({ ...prev, maxMembers: parseInt(e.target.value) || 30 }))}
              className="w-full bg-surface-container/50 border border-outline/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-outline focus:ring-2 focus:ring-indigo-500/20 outline-none font-medium"
            />
            <button onClick={handleCreateGroup} disabled={loading || !newGroup.name.trim() || !newGroup.topic.trim()} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Group'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Main Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-7xl mx-auto py-16 px-4 sm:px-6">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-4xl font-black text-on-surface font-headline mb-3 flex items-center gap-4">
          <span className="material-symbols-outlined text-indigo-500 text-4xl" style={{ fontVariationSettings: "'FILL' 0" }}>diversity_3</span>
          Community Hub
        </h1>
        <p className="text-lg text-on-surface-variant font-medium max-w-lg">
          Connect with fellow students, join study groups, participate in events, and climb the leaderboard together.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-8">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSelectedThread(null); }}
            className={`px-6 py-3 rounded-2xl font-bold whitespace-nowrap transition-all duration-200 flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'glass-card hover:bg-white/40 text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'forums' && renderForums()}
      {activeTab === 'groups' && renderGroups()}
      {activeTab === 'events' && renderEvents()}
      {activeTab === 'leaderboard' && renderLeaderboard()}

      {/* Modals */}
      {renderNewThreadModal()}
      {renderNewGroupModal()}
    </div>
  );
}
