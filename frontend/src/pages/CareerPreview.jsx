import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, Sparkles, Target, Zap, Clock, ShieldAlert } from 'lucide-react';
import { SmoothTypewriter } from '../components/discovery/DiscoveryComponents';

const ANALYSIS_MESSAGES = [
  "Analyzing programming profile...",
  "Understanding learning behaviour...",
  "Evaluating technical strengths...",
  "Identifying skill gaps...",
  "Calculating career readiness...",
  "Designing personalized roadmap...",
  "Preparing AI mentor...",
  "Generating Career DNA...",
  "Almost Ready..."
];

export default function CareerPreview() {
  const navigate = useNavigate();
  const location = useLocation();
  const { answers } = location.state || {}; // In a real app we'd calculate from this
  
  const [analyzing, setAnalyzing] = useState(true);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (!analyzing) return;
    
    const interval = setInterval(() => {
      setMessageIndex(prev => {
        if (prev === ANALYSIS_MESSAGES.length - 1) {
          clearInterval(interval);
          setTimeout(() => setAnalyzing(false), 1500); // Wait on last message
          return prev;
        }
        return prev + 1;
      });
    }, 800);

    return () => clearInterval(interval);
  }, [analyzing]);

  // Derived dummy values based on answers (if any)
  const role = answers?.career_goal || "Software Engineer";
  const roleMap = {
    frontend: "Frontend Engineer",
    backend: "Backend Engineer",
    fullstack: "Full Stack Engineer",
    aiml: "AI / ML Engineer",
    data: "Data Engineer",
    cloud: "Cloud Engineer",
    cyber: "Cybersecurity Engineer",
    mobile: "Mobile App Developer",
    qa: "QA / SDET",
    exploring: "Software Engineer"
  };
  const displayRole = roleMap[role] || "Software Engineer";

  if (analyzing) {
    return (
      <div className="fixed inset-0 bg-[#020617] flex items-center justify-center font-sans">
        <div className="text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-full border-4 border-blue-500/30 border-t-blue-500 animate-spin mb-8" />
          <h2 className="text-3xl text-white font-medium h-12">
            {ANALYSIS_MESSAGES[messageIndex]}
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] font-sans text-white p-6 md:p-12 relative overflow-hidden">
      
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="max-w-6xl mx-auto relative z-10 flex flex-col lg:flex-row gap-8">
        
        {/* Left Column: Stats */}
        <div className="lg:w-1/3 flex flex-col gap-6">
          <div className="p-8 rounded-[32px] bg-gradient-to-br from-white/10 to-white/5 border border-white/10 backdrop-blur-xl shadow-2xl">
            <h1 className="text-3xl font-bold mb-2">Career DNA</h1>
            <p className="text-slate-400 mb-8">AI Analysis Complete</p>
            
            <div className="space-y-6">
              <div>
                <p className="text-sm text-slate-400 mb-1 flex items-center"><Target className="w-4 h-4 mr-2" /> Career Direction</p>
                <p className="text-2xl font-bold text-blue-400">{displayRole}</p>
              </div>
              
              <div>
                <p className="text-sm text-slate-400 mb-1 flex items-center"><Zap className="w-4 h-4 mr-2 text-emerald-400" /> Top Strength</p>
                <p className="text-xl font-semibold">Logical Thinking</p>
              </div>

              <div>
                <p className="text-sm text-slate-400 mb-1 flex items-center"><ShieldAlert className="w-4 h-4 mr-2 text-amber-400" /> Biggest Gap</p>
                <p className="text-xl font-semibold">Production Projects</p>
              </div>

              <div>
                <p className="text-sm text-slate-400 mb-1 flex items-center"><Clock className="w-4 h-4 mr-2 text-purple-400" /> Estimated Timeline</p>
                <p className="text-xl font-semibold">8 Months to Placement</p>
              </div>
            </div>
            
            <div className="mt-8 pt-8 border-t border-white/10">
              <div className="flex justify-between items-end mb-2">
                <span className="text-sm font-medium text-slate-300">Career Readiness</span>
                <span className="text-3xl font-bold text-white">47%</span>
              </div>
              <div className="h-3 w-full bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 w-[47%] rounded-full" />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Locked Dashboard Features */}
        <div className="lg:w-2/3 flex flex-col">
          <div className="mb-6 flex justify-between items-center">
            <h2 className="text-2xl font-bold flex items-center">
              <Sparkles className="w-6 h-6 mr-3 text-blue-400" />
              Your Personalized Plan
            </h2>
            <button 
              onClick={() => navigate('/subscription-gate')}
              className="px-6 py-2.5 rounded-full bg-white text-black font-bold hover:scale-105 transition-transform"
            >
              Unlock All
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { title: "Personalized Roadmap", desc: "Step-by-step path to your goal." },
              { title: "Weekly Learning Plan", desc: "Structured daily tasks." },
              { title: "AI Mentor", desc: "24/7 technical guidance." },
              { title: "Resume Optimizer", desc: "ATS-friendly resume builder." },
              { title: "GitHub Review", desc: "AI code reviews on your commits." },
              { title: "Interview Preparation", desc: "Mock interviews & DSA practice." },
              { title: "Company Roadmaps", desc: "Target specific top-tier companies." },
              { title: "Project Generator", desc: "Unique project ideas to stand out." }
            ].map((feature, i) => (
              <div key={i} className="p-6 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-sm relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative z-10 flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-200 mb-1">{feature.title}</h3>
                    <p className="text-sm text-slate-400">{feature.desc}</p>
                  </div>
                  <Lock className="w-5 h-5 text-slate-500" />
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-8 flex justify-center">
            <button 
              onClick={() => navigate('/subscription-gate')}
              className="px-12 py-4 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 font-bold text-lg hover:shadow-[0_0_30px_rgba(59,130,246,0.5)] hover:scale-105 transition-all"
            >
              Unlock My Career Plan
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
