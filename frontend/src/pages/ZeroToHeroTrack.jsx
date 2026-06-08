import { useState, useEffect, useRef } from 'react';
import { Rocket, Loader2, CheckCircle, ChevronDown, ChevronUp, Bot, Send, Info, User, Play, Briefcase, GraduationCap } from 'lucide-react';
import { api } from '../store/useAuthStore';
import { useUserProgress } from '../hooks/useUserProgress';

const DEFAULT_TUTOR_MESSAGE = {
  role: 'assistant',
  content: "Hi! I'm your AI Tutor. Ask me to explain any concept from your roadmap!",
};

const ZERO_TO_HERO_DEFAULTS = {
  step: 'intro',
  collectedData: {},
  wizardCurrentQIndex: 0,
  wizardMessages: [],
  expandedPhases: {},
  messages: [DEFAULT_TUTOR_MESSAGE],
  targetRole: '',
};

// --- Chat Wizard Configuration ---
const WIZARD_QUESTIONS = [
  { 
    id: 'role', 
    text: "What specific IT area or role would you like to focus on?", 
    type: "options",
    options: [
      "AI & ML", "Data Science", "Software Development", 
      "Cloud & DevOps", "Cybersecurity", "Product Management", 
      "UI/UX Design", "Business Analysis", "Internships", 
      "Freshers Jobs", "Remote Jobs"
    ]
  },
  { 
    id: 'interests', 
    text: "What best describes your interests within this area?",
    type: "options",
    options: ["Building Products", "Research & Analysis", "Problem Solving", "Design & Creativity", "Teaching & Mentoring", "Automation & Optimization"]
  },
  { 
    id: 'experience', 
    text: "How much prior experience do you have in this field?",
    type: "options",
    options: ["None at all", "Less than 6 months", "6 months – 1 year", "1–2 years", "2+ years"]
  },
  { id: 'projects', text: "Have you built any projects previously? Briefly describe them (or say \"None\" if you haven't).", type: "text" },
  { 
    id: 'knowledge', 
    text: "How would you honestly rate your current knowledge level?",
    type: "options", 
    options: ["🌱 Complete Beginner", "📚 Intermediate", "🚀 Advanced / Professional"] 
  },
  { 
    id: 'timePerDay', 
    text: "How much time can you realistically dedicate to preparation each day?",
    type: "options",
    options: ["Less than 1 hour", "1–2 hours", "3–4 hours", "5+ hours"]
  },
  { 
    id: 'monthsToPrepare', 
    text: "How many months do you have to prepare before you want to be interview-ready?",
    type: "options",
    options: ["1 month", "2–3 months", "4–6 months", "6–12 months", "More than a year"]
  }
];


export default function ZeroToHeroTrack() {
  const { data: progress, updateProgress, isLoading: progressLoading, isSaving } = useUserProgress(
    'zero-to-hero',
    ZERO_TO_HERO_DEFAULTS
  );

  const step = progress.step;
  const collectedData = progress.collectedData;
  const wizardCurrentQIndex = progress.wizardCurrentQIndex;
  const wizardMessages = progress.wizardMessages;
  const expandedPhases = progress.expandedPhases;
  const messages = progress.messages;
  const targetRole = progress.targetRole;

  const [roadmap, setRoadmap] = useState(null);
  const [loading, setLoading] = useState(false);
  const [wizardInput, setWizardInput] = useState('');
  const [isBotTyping, setIsBotTyping] = useState(false);
  const chatEndRef = useRef(null);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    loadSavedRoadmap();
  }, []);

  useEffect(() => {
    if (step === 'chat-wizard' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [wizardMessages, isBotTyping, step]);

  if (progressLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  async function loadSavedRoadmap() {
    try {
      const { data } = await api.get('/career/roadmap');
      if (data && (data.roadmap || data.phases)) {
        setRoadmap(data.roadmap || data);
        // We do NOT set step to 'display' here automatically anymore,
        // so the user always sees the intro and can choose to continue or restart.
      }
    } catch (err) {
      // It's okay if they don't have one
    }
  }

  // --- Intro Handlers ---
  const startWizard = () => {
    updateProgress({
      step: 'chat-wizard',
      wizardCurrentQIndex: 0,
      collectedData: {},
      wizardMessages: [],
      targetRole: '',
    });
    setIsBotTyping(true);
    setTimeout(() => {
      setIsBotTyping(false);
      updateProgress((p) => ({
        ...p,
        wizardMessages: [{ role: 'bot', text: "Welcome to your personal career prep journey! Let's build a roadmap tailored just for you." }],
      }));

      setIsBotTyping(true);
      setTimeout(() => {
        setIsBotTyping(false);
        updateProgress((p) => ({
          ...p,
          wizardMessages: [...p.wizardMessages, { role: 'bot', text: WIZARD_QUESTIONS[0].text }],
        }));
      }, 1000);
    }, 1500);
  };

  // --- Chat Wizard Handlers ---
  const handleWizardSubmit = (e, val = null) => {
    if (e) e.preventDefault();
    const answer = val !== null ? val : wizardInput;
    if (!answer.trim()) return;

    updateProgress((p) => ({
      ...p,
      wizardMessages: [...p.wizardMessages, { role: 'user', text: answer }],
    }));
    setWizardInput('');

    const currentQ = WIZARD_QUESTIONS[wizardCurrentQIndex];
    const newData = { ...collectedData, [currentQ.id]: answer };
    const roleUpdate = currentQ.id === 'role' ? { targetRole: answer } : {};

    const nextIndex = wizardCurrentQIndex + 1;
    if (nextIndex < WIZARD_QUESTIONS.length) {
      updateProgress((p) => ({
        ...p,
        collectedData: newData,
        wizardCurrentQIndex: nextIndex,
        ...roleUpdate,
      }));
      setIsBotTyping(true);
      setTimeout(() => {
        setIsBotTyping(false);
        updateProgress((p) => ({
          ...p,
          wizardMessages: [...p.wizardMessages, { role: 'bot', text: WIZARD_QUESTIONS[nextIndex].text }],
        }));
      }, 1000);
    } else {
      updateProgress((p) => ({
        ...p,
        collectedData: newData,
        ...roleUpdate,
      }));
      setIsBotTyping(true);
      setTimeout(() => {
        setIsBotTyping(false);
        updateProgress((p) => ({
          ...p,
          wizardMessages: [...p.wizardMessages, { role: 'bot', text: "Perfect! I have all the details I need. Generating your custom roadmap..." }],
        }));

        setTimeout(() => {
          generateRoadmap(newData);
        }, 1500);
      }, 1000);
    }
  };

  const generateRoadmap = async (data) => {
    setLoading(true);
    updateProgress({ step: 'generating' });

    try {
      const res = await api.post('/career/roadmap', {
        currentRole: data.knowledge || 'Beginner',
        targetRole: data.role || 'IT Professional',
        currentSkills: [],
        timeframe: data.monthsToPrepare ? `${data.monthsToPrepare} months` : '6 months',
      });
      setRoadmap(res.data);
      updateProgress({ step: 'display', expandedPhases: {} });
    } catch (err) {
      console.error(err);
      updateProgress({ step: 'intro' });
    } finally {
      setLoading(false);
    }
  };

  const handleSendTutorMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = { role: 'user', content: chatInput };
    const historyWithUser = [...messages, userMsg];
    updateProgress({ messages: historyWithUser });
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await api.post('/job-prep/tutor', {
        message: userMsg.content,
        history: messages,
      });
      updateProgress({
        messages: [...historyWithUser, { role: 'assistant', content: res.data.data.reply }],
      });
    } catch (err) {
      updateProgress({
        messages: [...historyWithUser, { role: 'assistant', content: "Sorry, I couldn't process that right now." }],
      });
    } finally {
      setChatLoading(false);
    }
  };

  const togglePhase = (idx) => {
    updateProgress({
      expandedPhases: { ...expandedPhases, [idx]: !expandedPhases[idx] },
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="p-4 bg-emerald-100 text-emerald-600 rounded-2xl shadow-inner shadow-emerald-200/50">
          <Rocket className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Zero to Hero Track</h1>
          <p className="text-slate-500 mt-1 text-lg">
            Your complete guided journey from beginner to hired.
            {isSaving && <span className="ml-2 text-emerald-600 text-sm">Saving…</span>}
          </p>
        </div>
      </div>

      {/* --- INTRO STATE --- */}
      {step === 'intro' && (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          
          <div className="glass-card rounded-3xl p-10 border border-white/50 relative overflow-hidden group bg-white shadow-xl shadow-slate-200/50">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 opacity-10 blur-3xl group-hover:opacity-20 transition-opacity duration-700" />
            
            <div className="relative z-10 flex flex-col md:flex-row gap-10 items-center">
              <div className="flex-1 space-y-6">
                <div className="inline-flex items-center px-4 py-2 bg-indigo-50 text-indigo-700 rounded-full font-bold text-sm tracking-wide">
                  <Info className="w-4 h-4 mr-2" />
                  Currently Optimized for IT Sector
                </div>
                
                <h2 className="text-4xl font-black text-slate-900 leading-tight">
                  Start Building Your Career <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-600">From Scratch</span>
                </h2>
                
                <p className="text-slate-600 text-lg leading-relaxed">
                  The Zero to Hero page is designed to guide you step-by-step. We will help you identify your interests, build a hyper-targeted project roadmap, and provide you with an interactive AI tutor to answer all your technical questions along the way.
                </p>

                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl mt-1">
                      <Briefcase className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900">Create Impactful Projects</h4>
                      <p className="text-slate-500 text-sm">Build real-world applications that recruiters actually want to see.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-xl mt-1">
                      <GraduationCap className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900">Explore Components</h4>
                      <p className="text-slate-500 text-sm">Learn the 'why' and 'how' of modern tech stacks with our integrated AI tutor.</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 mt-6">
                  {roadmap && (
                    <button 
                      onClick={() => updateProgress({ step: 'display' })}
                      className="flex items-center justify-center gap-2 px-8 py-4 bg-emerald-600 text-white rounded-2xl font-bold text-lg hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-emerald-900/20"
                    >
                      <Play className="w-5 h-5 fill-current" />
                      Continue Saved Journey
                    </button>
                  )}
                  <button 
                    onClick={startWizard}
                    className={`flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-bold text-lg hover:scale-[1.02] active:scale-[0.98] transition-all ${
                      roadmap 
                        ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200' 
                        : 'bg-slate-900 text-white hover:bg-slate-800 shadow-xl shadow-slate-900/20'
                    }`}
                  >
                    {!roadmap && <Play className="w-5 h-5 fill-current" />}
                    {roadmap ? 'Start A New Path' : 'Start My Journey'}
                  </button>
                </div>
              </div>
              
              <div className="flex-1 w-full flex justify-center">
                {/* Mock illustration / aesthetic block */}
                <div className="relative w-full max-w-sm aspect-square bg-gradient-to-br from-slate-50 to-slate-100 rounded-full border-8 border-white shadow-2xl flex items-center justify-center">
                  <div className="absolute inset-0 bg-emerald-500/10 rounded-full animate-pulse" />
                  <Rocket className="w-32 h-32 text-emerald-500 drop-shadow-2xl" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- CHAT WIZARD STATE --- */}
      {step === 'chat-wizard' && (
        <div className="max-w-3xl mx-auto h-[600px] flex flex-col bg-slate-50 rounded-3xl shadow-2xl shadow-indigo-100 border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-500">
          {/* Header */}
          <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Career Architect AI</h2>
              <p className="text-sm text-slate-500">Online • Helping you build your path</p>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {wizardMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-4 fade-in duration-300`}>
                <div className="flex items-end gap-2 max-w-[80%]">
                  {msg.role === 'bot' && (
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mb-1">
                      <Bot className="w-4 h-4 text-emerald-600" />
                    </div>
                  )}
                  <div className={`px-5 py-3.5 rounded-2xl text-[15px] leading-relaxed shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-slate-900 text-white rounded-br-sm' 
                      : 'bg-white text-slate-800 border border-slate-200 rounded-bl-sm'
                  }`}>
                    {msg.text}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0 mb-1">
                      <User className="w-4 h-4 text-slate-600" />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing Indicator */}
            {isBotTyping && (
              <div className="flex justify-start animate-in fade-in duration-300">
                <div className="flex items-end gap-2 max-w-[80%]">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mb-1">
                    <Bot className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="px-5 py-4 bg-white border border-slate-200 rounded-2xl rounded-bl-sm shadow-sm flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input / Quick Replies */}
          <div className="bg-white border-t border-slate-200 p-4">
            {!isBotTyping && WIZARD_QUESTIONS[wizardCurrentQIndex]?.type === 'options' ? (
              <div className="flex flex-wrap gap-2 justify-center">
                {WIZARD_QUESTIONS[wizardCurrentQIndex].options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleWizardSubmit(null, opt)}
                    className="px-6 py-3 bg-emerald-50 text-emerald-700 font-bold rounded-xl border border-emerald-200 hover:bg-emerald-500 hover:text-white transition-colors"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <form onSubmit={handleWizardSubmit} className="relative flex items-center">
                <input
                  type="text"
                  value={wizardInput}
                  onChange={(e) => setWizardInput(e.target.value)}
                  disabled={isBotTyping || wizardCurrentQIndex >= WIZARD_QUESTIONS.length}
                  placeholder={isBotTyping ? "AI is typing..." : "Type your answer..."}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-6 pr-14 py-4 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 text-[15px]"
                />
                <button
                  type="submit"
                  disabled={isBotTyping || !wizardInput.trim() || wizardCurrentQIndex >= WIZARD_QUESTIONS.length}
                  className="absolute right-2 p-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-slate-900 transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* --- GENERATING STATE --- */}
      {step === 'generating' && (
        <div className="glass-card rounded-3xl p-12 text-center max-w-xl mx-auto border border-white/50 mt-10 animate-in fade-in zoom-in-95 duration-500">
          <div className="relative w-20 h-20 mx-auto mb-8">
            <div className="absolute inset-0 border-4 border-emerald-100 rounded-full" />
            <div className="absolute inset-0 border-4 border-emerald-500 rounded-full border-t-transparent animate-spin" />
            <Bot className="w-8 h-8 text-emerald-600 absolute inset-0 m-auto" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Architecting Your Blueprint</h2>
          <p className="text-slate-600">Analyzing your {targetRole} goals and constructing a hyper-targeted 6-month plan...</p>
        </div>
      )}

      {/* --- DISPLAY STATE --- */}
      {step === 'display' && roadmap && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          
          {/* Main Roadmap Area */}
          <div className="lg:col-span-2 space-y-6">
            <div className="glass-card rounded-3xl p-8 border border-white/50">
              <h2 className="text-3xl font-bold text-slate-900 mb-2">{roadmap.title}</h2>
              <p className="text-slate-600 mb-6">{roadmap.summary}</p>
              
              <div className="space-y-4">
                {roadmap.phases?.map((phase, idx) => (
                  <div key={idx} className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                    <button
                      onClick={() => togglePhase(idx)}
                      className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-4 text-left">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900">{phase.title}</h3>
                          <p className="text-sm text-slate-500">{phase.duration}</p>
                        </div>
                      </div>
                      {expandedPhases[idx] ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                    </button>

                    {expandedPhases[idx] && (
                      <div className="px-6 py-4 border-t border-slate-200 bg-white">
                        <p className="text-slate-700 mb-4">{phase.description}</p>
                        
                        {phase.skills && (
                          <div className="mb-4">
                            <h4 className="font-bold text-slate-900 text-sm mb-2 uppercase tracking-wider">Skills</h4>
                            <div className="flex flex-wrap gap-2">
                              {phase.skills.map((s, i) => (
                                <span key={i} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold">{s}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {phase.goals && (
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm mb-2 uppercase tracking-wider">Milestones</h4>
                            <ul className="space-y-2">
                              {phase.goals.map((g, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                  {g}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* AI Tutor Sidebar */}
          <div className="lg:col-span-1">
            <div className="glass-card rounded-3xl border border-white/50 flex flex-col h-[600px] sticky top-24">
              <div className="p-4 border-b border-slate-200 bg-emerald-50/50 rounded-t-3xl flex items-center gap-3">
                <div className="p-2 bg-emerald-200 text-emerald-700 rounded-xl">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">AI Tutor</h3>
                  <p className="text-xs text-slate-500">Ask any technical questions</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl p-3 text-sm ${
                      msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-100 text-slate-800 rounded-bl-none'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-100 rounded-2xl rounded-bl-none p-3">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleSendTutorMessage} className="p-3 border-t border-slate-200 bg-white rounded-b-3xl flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask a question..."
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                  className="p-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
