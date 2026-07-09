import React, { useState, useEffect, useRef } from 'react';

export const useRotationRef = (baseSpeedDegreesPerSecond, activeMultiplier, isActive, ref) => {
  const currentSpeed = useRef(baseSpeedDegreesPerSecond);
  const rotationRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  useEffect(() => {
    let animationFrameId;
    lastTimeRef.current = performance.now();

    const animate = (time) => {
      const deltaTime = time - lastTimeRef.current;
      lastTimeRef.current = time;

      const targetSpeed = isActive ? baseSpeedDegreesPerSecond * activeMultiplier : baseSpeedDegreesPerSecond;
      currentSpeed.current += (targetSpeed - currentSpeed.current) * 0.05;

      const degreesToRotate = currentSpeed.current * (deltaTime / 1000);
      rotationRef.current = (rotationRef.current + degreesToRotate) % 360;
      
      if (ref.current) {
        ref.current.style.transform = `rotate(${rotationRef.current}deg)`;
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isActive, baseSpeedDegreesPerSecond, activeMultiplier, ref]);
};

export const SmoothTypewriter = ({ text, speed = 15, delay = 0, start = true, onStart, onComplete, className }) => {
  const [visibleChars, setVisibleChars] = useState(0);
  const [started, setStarted] = useState(false);
  const completedFired = useRef(false);
  const startFired = useRef(false);

  useEffect(() => {
    if (!start) return;
    let timeout;
    if (delay > 0) {
      timeout = setTimeout(() => {
        setStarted(true);
        if (onStart && !startFired.current) {
          startFired.current = true;
          onStart();
        }
      }, delay);
    } else {
      setStarted(true);
      if (onStart && !startFired.current) {
        startFired.current = true;
        onStart();
      }
    }
    return () => clearTimeout(timeout);
  }, [delay, start, onStart]);

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

export const StaggeredList = ({ items, delay = 600, start = true, onStart, onComplete, className, itemClassName, icon }) => {
  const [visibleItems, setVisibleItems] = useState(0);
  const completedFired = useRef(false);
  const startFired = useRef(false);

  useEffect(() => {
    if (start && onStart && !startFired.current) {
      startFired.current = true;
      onStart();
    }
  }, [start, onStart]);

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

export const FadeInButton = ({ text, onClick, start = true, onStart, onComplete, className }) => {
  const [visible, setVisible] = useState(false);
  const completedFired = useRef(false);
  const startFired = useRef(false);

  useEffect(() => {
    if (start && onStart && !startFired.current) {
      startFired.current = true;
      onStart();
    }
  }, [start, onStart]);
  
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

export const ScriptedScreen = ({ lines, onComplete, containerClassName, onTypingStateChange }) => {
  const [currentLine, setCurrentLine] = useState(0);
  const [isActivelyTyping, setIsActivelyTyping] = useState(false);

  useEffect(() => {
    if (onTypingStateChange) onTypingStateChange(isActivelyTyping);
  }, [isActivelyTyping, onTypingStateChange]);

  const handleLineStart = () => {
    setIsActivelyTyping(true);
  };

  const handleLineComplete = () => {
    setIsActivelyTyping(false);
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
               onStart={index === currentLine ? handleLineStart : undefined}
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
               onStart={index === currentLine ? handleLineStart : undefined}
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
            onStart={index === currentLine ? handleLineStart : undefined}
            onComplete={index === currentLine ? handleLineComplete : undefined} 
          />
        );
      })}
    </div>
  );
};
