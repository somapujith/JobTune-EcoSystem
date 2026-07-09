import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  useRotationRef, 
  SmoothTypewriter, 
  StaggeredList, 
  FadeInButton, 
  ScriptedScreen 
} from '../components/discovery/DiscoveryComponents';

export default function Survey() {
  const navigate = useNavigate();
  const [currentScreenIndex, setCurrentScreenIndex] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const layer1Ref = useRef(null);
  const layer2Ref = useRef(null);

  // Smooth DOM rotation synced with text typing states
  useRotationRef(18, 5, isTyping, layer1Ref);  // 18 deg/s base, 5x speed when active
  useRotationRef(-12, 5, isTyping, layer2Ref); // -12 deg/s base, 5x speed when active

  const handleStart = () => {
    navigate('/career-discovery'); 
  };

  const SCREENS = [
    [
      { text: "Welcome to JobTune", delay: 1000, className: "text-4xl md:text-6xl font-extrabold text-white mb-4 drop-shadow-lg", waitAfter: 1000 },
      { text: "Your AI Career Operating System", className: "text-xl md:text-3xl text-cyan-300 font-medium", waitAfter: 5000 }
    ],
    [
      { text: "Before we begin...", className: "text-3xl md:text-5xl font-bold text-white mb-8", waitAfter: 1500 },
      { text: "Let's understand where you are today.", className: "text-2xl md:text-4xl text-blue-200", waitAfter: 5000 }
    ],
    [
      { text: "I'm going to build your Career Profile.", className: "text-3xl md:text-5xl font-bold text-white mb-12", waitAfter: 1500 },
      { type: 'list', icon: 'check', items: [
          "Understand your goals",
          "Measure your current skills",
          "Discover your strengths",
          "Identify missing skills",
          "Design your personal roadmap"
        ], 
        itemDelay: 500, 
        className: "flex flex-col space-y-5 text-left",
        itemClassName: "text-xl md:text-2xl text-emerald-50 font-medium tracking-wide",
        waitAfter: 5000 
      }
    ],
    [
      { text: "This isn't an exam.", className: "text-3xl md:text-5xl font-bold text-white mb-6", waitAfter: 1500 },
      { text: "There are no right or wrong answers.", className: "text-2xl md:text-4xl text-blue-200 mb-6", waitAfter: 1500 },
      { text: "Just answer honestly.", className: "text-2xl md:text-4xl text-blue-200 mb-10", waitAfter: 1500 },
      { text: "The better I understand you,\nthe better I can guide you.", className: "text-xl md:text-3xl text-cyan-300 font-medium leading-relaxed", waitAfter: 5000 }
    ],
    [
      { text: "Every student is different.", className: "text-3xl md:text-5xl font-bold text-white mb-6", waitAfter: 1500 },
      { text: "Your roadmap shouldn't look like everyone else's.", className: "text-2xl md:text-4xl text-blue-200 mb-10", waitAfter: 1500 },
      { text: "That's why everything inside JobTune\nwill be personalized just for you.", className: "text-xl md:text-3xl text-cyan-300 font-medium leading-relaxed", waitAfter: 5000 }
    ],
    [
      { text: "By the end of this discovery,\nyou'll receive:", className: "text-3xl md:text-5xl font-bold text-white mb-12 leading-tight", waitAfter: 1500 },
      { type: 'list', icon: 'dot', items: [
          "Career Readiness Score",
          "Personalized Learning Roadmap",
          "Skill Gap Analysis",
          "Project Recommendations",
          "Interview Preparation Plan",
          "Placement Readiness Timeline"
        ], 
        itemDelay: 500, 
        className: "flex flex-col space-y-5 text-left",
        itemClassName: "text-xl md:text-2xl text-indigo-50 font-medium tracking-wide",
        waitAfter: 5000 
      }
    ],
    [
      { text: "Estimated Time", className: "text-xl md:text-2xl text-blue-300 mb-4 font-bold uppercase tracking-widest drop-shadow-md", waitAfter: 1000 },
      { text: "6–8 Minutes", className: "text-5xl md:text-8xl font-extrabold text-white mb-10 drop-shadow-xl", waitAfter: 1500 },
      { text: "This setup is only required once.\nYour profile will continue evolving as you learn,\nbuild projects, complete assessments,\nand prepare for interviews.", className: "text-base md:text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed mb-12", waitAfter: 3000 },
      { type: 'button', text: "Start Career Discovery", onClick: handleStart, className: "px-10 py-5 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 text-white font-bold text-xl shadow-[0_8px_32px_rgba(0,0,0,0.37)] hover:bg-white/10 hover:border-white/20 hover:shadow-[0_0_40px_rgba(14,165,233,0.4)] hover:-translate-y-1 transition-all duration-300" }
    ]
  ];

  const handleScreenComplete = () => {
    if (currentScreenIndex < SCREENS.length - 1) {
      setIsFadingOut(true);
      setTimeout(() => {
        setCurrentScreenIndex(prev => prev + 1);
        setIsFadingOut(false);
      }, 1000); 
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && currentScreenIndex < SCREENS.length - 1) {
        setIsFadingOut(false);
        setCurrentScreenIndex(SCREENS.length - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentScreenIndex, SCREENS.length]);

  return (
    <div 
      className="fixed inset-0 bg-[#020617] flex items-center justify-center p-4 sm:p-8 md:p-12 overflow-hidden"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}
    >
      <div className="absolute inset-0 z-0 overflow-hidden opacity-100 transition-opacity duration-1000 bg-[#020617]">
        {/* Layer 1: Gemini Blue & Red */}
        <div ref={layer1Ref} className="absolute inset-[-50%]">
          <div 
            className="absolute top-1/4 left-1/4 w-[60%] aspect-square rounded-full mix-blend-screen"
            style={{ background: 'radial-gradient(closest-side, rgba(66, 133, 244, 1) 0%, rgba(66, 133, 244, 0.5) 50%, transparent 100%)' }}
          />
          <div 
            className="absolute bottom-1/4 right-1/4 w-[60%] aspect-square rounded-full mix-blend-screen"
            style={{ background: 'radial-gradient(closest-side, rgba(234, 67, 53, 1) 0%, rgba(234, 67, 53, 0.5) 50%, transparent 100%)' }}
          />
        </div>
        
        {/* Layer 2: Gemini Yellow & Green */}
        <div ref={layer2Ref} className="absolute inset-[-50%]">
          <div 
            className="absolute bottom-1/3 left-1/3 w-[65%] aspect-square rounded-full mix-blend-screen"
            style={{ background: 'radial-gradient(closest-side, rgba(251, 188, 5, 1) 0%, rgba(251, 188, 5, 0.5) 50%, transparent 100%)' }}
          />
          <div 
            className="absolute top-1/3 right-1/3 w-[60%] aspect-square rounded-full mix-blend-screen"
            style={{ background: 'radial-gradient(closest-side, rgba(52, 168, 83, 1) 0%, rgba(52, 168, 83, 0.5) 50%, transparent 100%)' }}
          />
        </div>
      </div>

      <div 
        className="relative z-10 w-full h-full rounded-[3rem] flex flex-col shadow-2xl overflow-hidden backdrop-blur-[40px] border border-white/5"
        style={{ backgroundColor: 'rgba(4,9,26,0.1)' }}
      >
        {/* Flawless solid core that smoothly fades out 10px before the edge */}
        <div className="absolute inset-[10px] rounded-[2.5rem] bg-[#04091a] blur-[10px] z-0" />
        
        <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 z-20 overflow-hidden relative">
          <div 
            className={`transition-all duration-1000 w-full flex flex-col items-center ${isFadingOut ? 'opacity-0 blur-md scale-95' : 'opacity-100 blur-0 scale-100'}`}
          >
            {SCREENS[currentScreenIndex] && (
              <ScriptedScreen 
                key={currentScreenIndex}
                lines={SCREENS[currentScreenIndex]} 
                onTypingStateChange={setIsTyping}
                onComplete={handleScreenComplete} 
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
