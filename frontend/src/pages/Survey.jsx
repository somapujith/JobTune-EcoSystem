import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const SmoothTypewriter = ({ text, speed = 15, delay = 0, start = true, onComplete, className }) => {
  const [visibleChars, setVisibleChars] = useState(0);
  const [started, setStarted] = useState(false);
  const completedFired = useRef(false);

  useEffect(() => {
    if (!start) return;
    let timeout;
    if (delay > 0) {
      timeout = setTimeout(() => setStarted(true), delay);
    } else {
      setStarted(true);
    }
    return () => clearTimeout(timeout);
  }, [delay, start]);

  useEffect(() => {
    if (!started) return;
    
    if (visibleChars < text.length) {
      const timer = setTimeout(() => {
        setVisibleChars(prev => prev + 1);
      }, speed);
      return () => clearTimeout(timer);
    } else if (!completedFired.current) {
      completedFired.current = true;
      if (onComplete) {
        setTimeout(() => onComplete(), 100);
      }
    }
  }, [started, visibleChars, text.length, speed, onComplete]);

  let charIndex = 0;

  return (
    <div className={className}>
      {text.split('\n').map((lineText, lineIdx) => (
        <div key={lineIdx} className="whitespace-pre-wrap">
          {lineText.split(/(\s+)/).map((word, wIdx) => (
            <span key={wIdx} className="inline-block whitespace-pre">
              {word.split('').map((char) => {
                const i = charIndex++;
                return (
                  <span 
                    key={i} 
                    className="inline-block"
                    style={{ 
                      opacity: i < visibleChars ? 1 : 0,
                      filter: i < visibleChars ? 'blur(0px)' : 'blur(8px)',
                      transform: i < visibleChars ? 'translateY(0)' : 'translateY(4px)',
                      transition: 'opacity 0.3s ease-out, filter 0.3s ease-out, transform 0.3s ease-out' 
                    }}
                  >
                    {char}
                  </span>
                );
              })}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
};

const StaggeredList = ({ items, delay = 600, start = true, onComplete, className, itemClassName, icon }) => {
  const [visibleItems, setVisibleItems] = useState(0);
  const completedFired = useRef(false);

  useEffect(() => {
    if (!start) return;
    if (visibleItems < items.length) {
      const timer = setTimeout(() => {
        setVisibleItems(prev => prev + 1);
      }, delay);
      return () => clearTimeout(timer);
    } else if (!completedFired.current) {
      completedFired.current = true;
      if (onComplete) {
        setTimeout(() => onComplete(), 200);
      }
    }
  }, [visibleItems, items.length, delay, onComplete, start]);

  return (
    <div className="w-full flex justify-center">
      <ul className={className}>
        {items.map((item, index) => (
          <li 
            key={index} 
            className={`${itemClassName} flex items-center transition-all duration-700 transform ${index < visibleItems ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
          >
            {icon === 'check' && (
              <svg className="w-6 h-6 md:w-8 md:h-8 mr-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
            {icon === 'dot' && (
              <div className="w-2 h-2 md:w-2.5 md:h-2.5 mr-5 rounded-full bg-indigo-400 flex-shrink-0 shadow-[0_0_10px_rgba(129,140,248,0.8)]" />
            )}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const FadeInButton = ({ text, onClick, start = true, onComplete, className }) => {
  const [visible, setVisible] = useState(false);
  const completedFired = useRef(false);
  
  useEffect(() => {
    if (!start) return;
    const timer = setTimeout(() => {
      setVisible(true);
      if (onComplete && !completedFired.current) {
        completedFired.current = true;
        onComplete();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [onComplete, start]);

  return (
    <button 
      onClick={onClick}
      className={`${className} transition-all duration-1000 transform ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
      style={{ pointerEvents: visible ? 'auto' : 'none' }}
    >
      {text}
    </button>
  );
};

const ScriptedScreen = ({ lines, onComplete, containerClassName }) => {
  const [currentLine, setCurrentLine] = useState(0);

  const handleLineComplete = () => {
    const line = lines[currentLine];
    const wait = line.waitAfter || 0;
    setTimeout(() => {
      if (currentLine + 1 < lines.length) {
        setCurrentLine(curr => curr + 1);
      } else {
        if (onComplete) onComplete();
      }
    }, wait);
  };

  return (
    <div className={`flex flex-col items-center justify-center text-center w-full max-w-4xl mx-auto ${containerClassName}`}>
      {lines.map((line, index) => {
        const start = index <= currentLine;
        
        if (line.type === 'list') {
           return (
             <StaggeredList 
               key={index} 
               items={line.items} 
               icon={line.icon}
               delay={line.itemDelay} 
               className={line.className}
               itemClassName={line.itemClassName}
               start={start}
               onComplete={index === currentLine ? handleLineComplete : undefined} 
             />
           );
        }
        
        if (line.type === 'button') {
           return (
             <FadeInButton 
               key={index}
               text={line.text}
               onClick={line.onClick}
               className={line.className}
               start={start}
               onComplete={index === currentLine ? handleLineComplete : undefined}
             />
           );
        }
        
        return (
          <SmoothTypewriter 
            key={index} 
            text={line.text} 
            className={line.className} 
            speed={line.speed || 15}
            delay={line.delay || 0}
            start={start}
            onComplete={index === currentLine ? handleLineComplete : undefined} 
          />
        );
      })}
    </div>
  );
};

export default function Survey() {
  const navigate = useNavigate();
  const [currentScreenIndex, setCurrentScreenIndex] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);

  const handleStart = () => {
    navigate('/dashboard'); 
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

  return (
    <div 
      className="fixed inset-0 bg-[#020617] flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}
    >
      <div className="absolute inset-0 z-0 overflow-hidden opacity-90 transition-opacity duration-1000">
        <div 
          className="absolute inset-[-50%] animate-[spin_10s_linear_infinite]"
          style={{
            background: 'conic-gradient(from 0deg, transparent 0%, transparent 25%, #0ea5e9 35%, #3b82f6 45%, #6366f1 55%, transparent 65%, transparent 100%)',
            filter: 'blur(50px)',
            opacity: 0.8
          }}
        />
        <div 
          className="absolute inset-[-50%] animate-[spin_15s_linear_infinite_reverse]"
          style={{
            background: 'conic-gradient(from 180deg, transparent 0%, transparent 25%, #10b981 35%, #0ea5e9 45%, #8b5cf6 55%, transparent 65%, transparent 100%)',
            filter: 'blur(60px)',
            opacity: 0.6
          }}
        />
        <div className="absolute inset-0 bg-blue-500/10 blur-[120px] animate-pulse-slow" />
      </div>

      <div className="relative z-10 w-full h-full bg-[#020617]/85 backdrop-blur-3xl rounded-[2.5rem] border border-blue-400/20 flex flex-col shadow-[0_0_80px_rgba(14,165,233,0.15)] overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 z-20 overflow-hidden relative">
          <div 
            className={`transition-all duration-1000 w-full flex flex-col items-center ${isFadingOut ? 'opacity-0 blur-md scale-95' : 'opacity-100 blur-0 scale-100'}`}
          >
            {SCREENS[currentScreenIndex] && (
              <ScriptedScreen 
                key={currentScreenIndex}
                lines={SCREENS[currentScreenIndex]} 
                onComplete={handleScreenComplete} 
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
