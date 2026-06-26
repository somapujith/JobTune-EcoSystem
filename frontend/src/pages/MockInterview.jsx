import React, { useState, useRef, useEffect } from 'react';
import { api } from '../store/useAuthStore';
import { useActivityTracker } from '../hooks/useActivityTracker';

const ROLES = ['Frontend Developer', 'Backend Developer', 'Full Stack Developer', 'Data Analyst', 'DevOps Engineer'];

const TypeBadge = ({ type }) => {
  const config = {
    technical: { bg: 'bg-blue-500/10 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400', icon: 'code' },
    behavioral: { bg: 'bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400', icon: 'psychology' },
    situational: { bg: 'bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400', icon: 'lightbulb' },
    feedback: { bg: 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400', icon: 'thumb_up' },
  };
  const c = config[type] || config.technical;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 ${c.bg} text-xs font-bold rounded-lg uppercase`}>
      <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 0" }}>{c.icon}</span>
      {type}
    </span>
  );
};

export default function MockInterview() {
  useActivityTracker('Interview Prep');
  const [stage, setStage] = useState('setup'); // setup | interview | complete
  const [selectedRole, setSelectedRole] = useState('Full Stack Developer');
  const [interviewId, setInterviewId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionType, setQuestionType] = useState('');
  const [tips, setTips] = useState([]);
  const [finalResult, setFinalResult] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startInterview = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/interview/start', { role: selectedRole });
      const res = data.data;
      setInterviewId(res.interviewId);
      setCurrentQuestion(res.question);
      setQuestionType(res.question_type);
      setTips(res.tips || []);
      setMessages([{ role: 'interviewer', content: res.question, type: res.question_type }]);
      setStage('interview');
    } catch (err) {
      console.error(err);
      alert('Failed to start interview. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const sendAnswer = async () => {
    if (!currentAnswer.trim() || loading) return;
    setLoading(true);

    const userMsg = { role: 'candidate', content: currentAnswer.trim() };
    setMessages(prev => [...prev, userMsg]);
    setCurrentAnswer('');

    try {
      const { data } = await api.post(`/interview/${interviewId}/respond`, { answer: userMsg.content });
      const res = data.data;

      const newMessages = [];
      if (res.feedback) {
        newMessages.push({ role: 'interviewer', content: res.feedback, type: 'feedback' });
      }
      if (res.question) {
        newMessages.push({ role: 'interviewer', content: res.question, type: res.question_type });
      }

      setMessages(prev => [...prev, ...newMessages]);
      setCurrentQuestion(res.question);
      setQuestionType(res.question_type);
      setTips(res.tips || []);

      if (res.is_complete) {
        setFinalResult(res);
        setStage('complete');
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'interviewer', content: 'Sorry, there was an error processing your response. Please try again.', type: 'feedback' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendAnswer();
    }
  };

  // ── Setup Screen ──────────────────────────────────────────────────────────
  if (stage === 'setup') {
    return (
      <div className="page-container max-w-4xl">
        <div className="page-header">
          <div className="flex items-center gap-4 mb-4">
            <div className="page-header-icon bg-violet-100 dark:bg-violet-500/20">
              <span className="material-symbols-outlined text-violet-600 dark:text-violet-400 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>record_voice_over</span>
            </div>
            <div>
              <h1 className="page-title">AI Mock Interview</h1>
              <p className="page-subtitle">
                Practice with an AI interviewer that adapts to your responses. Get real-time feedback and a readiness score.
              </p>
            </div>
          </div>
        </div>

        <div className="card p-8 rounded-2xl mb-6">
          <h3 className="section-title mb-6">Select Target Role</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ROLES.map(role => (
              <button
                key={role}
                onClick={() => setSelectedRole(role)}
                className={`p-4 rounded-2xl font-bold text-left transition-all duration-200 ${
                  selectedRole === role
                    ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/30'
                    : 'bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>
                    {selectedRole === role ? 'radio_button_checked' : 'radio_button_unchecked'}
                  </span>
                  {role}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="card border-violet-200 dark:border-violet-500/20 p-6 rounded-2xl mb-6">
          <h4 className="font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-violet-600 dark:text-violet-400 text-base" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
            How it works
          </h4>
          <ul className="space-y-2 text-slate-500 dark:text-slate-400 text-sm font-medium">
            <li className="flex items-start gap-2"><span className="text-violet-600 dark:text-violet-400 font-bold">1.</span> AI asks 5 tailored questions (technical + behavioral)</li>
            <li className="flex items-start gap-2"><span className="text-violet-600 dark:text-violet-400 font-bold">2.</span> You get instant feedback after each answer</li>
            <li className="flex items-start gap-2"><span className="text-violet-600 dark:text-violet-400 font-bold">3.</span> Receive a final readiness score with improvement areas</li>
          </ul>
        </div>

        <button
          onClick={startInterview}
          disabled={loading}
          className="btn-gradient bg-gradient-to-r from-violet-600 to-purple-600 w-full py-5 text-lg shadow-[0px_20px_40px_rgba(139,92,246,0.3)] hover:scale-[1.02] flex items-center justify-center gap-3"
        >
          {loading ? (
            <>
              <span className="material-symbols-outlined animate-spin text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>sync</span>
              Preparing Interview...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>mic</span>
              Start Mock Interview
            </>
          )}
        </button>
      </div>
    );
  }

  // ── Complete Screen ───────────────────────────────────────────────────────
  if (stage === 'complete' && finalResult) {
    return (
      <div className="page-container max-w-4xl">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-violet-600 to-purple-600 rounded-full mb-6">
            <span className="text-4xl font-extrabold text-white">{finalResult.final_score || 70}</span>
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white font-headline mb-2">Interview Complete!</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium">Your readiness score for {selectedRole}</p>
        </div>

        {finalResult.final_feedback && (
          <div className="card border-violet-200 dark:border-violet-500/20 p-6 rounded-2xl mb-8">
            <p className="text-slate-700 dark:text-slate-300 font-medium leading-relaxed">{finalResult.final_feedback}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="card p-8 rounded-2xl">
            <h3 className="section-title mb-4">
              <span className="material-symbols-outlined text-emerald-500 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>thumb_up</span>
              Strengths
            </h3>
            <ul className="space-y-3">
              {(finalResult.strengths || ['Clear communication']).map((s, i) => (
                <li key={i} className="text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 rounded-xl font-medium">{s}</li>
              ))}
            </ul>
          </div>
          <div className="card p-8 rounded-2xl">
            <h3 className="section-title mb-4">
              <span className="material-symbols-outlined text-amber-500 text-xl" style={{ fontVariationSettings: "'FILL' 0" }}>trending_up</span>
              Areas to Improve
            </h3>
            <ul className="space-y-3">
              {(finalResult.improvements || ['Add more technical depth']).map((s, i) => (
                <li key={i} className="text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 rounded-xl font-medium">{s}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex gap-4 justify-center">
          <button
            onClick={() => { setStage('setup'); setMessages([]); setFinalResult(null); }}
            className="btn-gradient bg-gradient-to-r from-violet-600 to-purple-600 px-8 py-4 shadow-lg hover:scale-105 flex items-center gap-3"
          >
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>replay</span>
            Try Another Role
          </button>
        </div>
      </div>
    );
  }

  // ── Interview Chat ────────────────────────────────────────────────────────
  return (
    <div className="page-container max-w-4xl flex flex-col !py-8" style={{ height: 'calc(100vh - 100px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white font-headline flex items-center gap-3">
            <span className="material-symbols-outlined text-violet-600 dark:text-violet-400 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>record_voice_over</span>
            Mock Interview
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">Role: {selectedRole}</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 font-bold">
          <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
          Live Session
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-6 pr-2">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'candidate' ? 'justify-end' : 'justify-start'} animate-[fadeIn_0.3s_ease-out]`}>
            <div className={`max-w-[80%] p-5 rounded-2xl ${
              msg.role === 'candidate'
                ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-br-lg'
                : msg.type === 'feedback'
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-slate-800 dark:text-slate-200 border border-emerald-200 dark:border-emerald-700 rounded-bl-lg'
                  : 'card text-slate-800 dark:text-slate-200 rounded-bl-lg'
            }`}>
              {msg.role === 'interviewer' && msg.type && msg.type !== 'feedback' && (
                <div className="mb-3"><TypeBadge type={msg.type} /></div>
              )}
              {msg.type === 'feedback' && (
                <div className="mb-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>lightbulb</span> Feedback
                </div>
              )}
              <p className="font-medium leading-relaxed whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="card p-5 rounded-2xl rounded-bl-lg">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 bg-slate-300 dark:bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2.5 h-2.5 bg-slate-300 dark:bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2.5 h-2.5 bg-slate-300 dark:bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Tips */}
      {tips.length > 0 && (
        <div className="mb-4 px-4 py-3 bg-amber-50 dark:bg-amber-500/10 rounded-2xl border border-amber-200 dark:border-amber-500/20">
          <p className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>tips_and_updates</span>
            Tip: {tips[0]}
          </p>
        </div>
      )}

      {/* Input */}
      <div className="flex gap-3">
        <textarea
          className="input-field flex-1 !rounded-2xl p-4 resize-none !w-auto"
          placeholder="Type your answer... (Enter to send, Shift+Enter for newline)"
          rows={3}
          value={currentAnswer}
          onChange={e => setCurrentAnswer(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button
          onClick={sendAnswer}
          disabled={loading || !currentAnswer.trim()}
          className="px-6 bg-gradient-to-b from-violet-600 to-purple-600 text-white rounded-2xl hover:from-violet-700 hover:to-purple-700 active:scale-95 transition-all disabled:opacity-40 disabled:hover:from-violet-600 shadow-lg"
        >
          <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
        </button>
      </div>
    </div>
  );
}
