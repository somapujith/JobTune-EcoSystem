import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import GlassCard from '../components/discovery/GlassCard';
import { SmoothTypewriter, useRotationRef } from '../components/discovery/DiscoveryComponents';
import { Check, ChevronRight } from 'lucide-react';

const SECTIONS = [
  { id: 'understanding', title: 'Understanding You' },
  { id: 'goal', title: 'Career Goal' },
  { id: 'programming', title: 'Programming' },
  { id: 'skills', title: 'Technical Skills' },
  { id: 'projects', title: 'Projects' },
  { id: 'dsa', title: 'DSA' },
  { id: 'learning', title: 'Learning Style' },
  { id: 'challenges', title: 'Career Challenges' }
];

const DISCOVERY_FLOW = [
  {
    id: 'stage',
    section: 'understanding',
    aiMessage: "Let's start by understanding where you currently are in your software engineering journey.",
    question: "Which stage best describes you?",
    type: "single",
    options: [
      { id: 'y1', emoji: '🎓', title: 'First Year', description: 'Learning programming fundamentals.' },
      { id: 'y2', emoji: '💻', title: 'Second Year', description: 'Building technical foundations.' },
      { id: 'y3', emoji: '🚀', title: 'Third Year', description: 'Preparing for internships.' },
      { id: 'y4', emoji: '🎯', title: 'Final Year', description: 'Focused on placements.' },
      { id: 'grad', emoji: '🏆', title: 'Recent Graduate', description: 'Looking for my first software role.' }
    ],
    processingMessage: "Understanding academic stage..."
  },
  {
    id: 'career_goal',
    section: 'goal',
    aiMessage: "Perfect.\nNow let's discover what kind of engineer you want to become.",
    question: "If you could start your dream software job tomorrow,\nwhich role would you choose?",
    type: "single",
    options: [
      { id: 'frontend', emoji: '🎨', title: 'Frontend Engineer', description: 'Creating beautiful web experiences.' },
      { id: 'backend', emoji: '⚙️', title: 'Backend Engineer', description: 'Building scalable systems and APIs.' },
      { id: 'fullstack', emoji: '🌐', title: 'Full Stack Engineer', description: 'Building complete applications.' },
      { id: 'aiml', emoji: '🤖', title: 'AI / ML Engineer', description: 'Developing intelligent software.' },
      { id: 'data', emoji: '📊', title: 'Data Engineer', description: 'Working with large-scale data.' },
      { id: 'cloud', emoji: '☁️', title: 'Cloud Engineer', description: 'Designing cloud infrastructure.' },
      { id: 'cyber', emoji: '🛡️', title: 'Cybersecurity Engineer', description: 'Protecting systems and applications.' },
      { id: 'mobile', emoji: '📱', title: 'Mobile App Developer', description: 'Building Android and iOS apps.' },
      { id: 'qa', emoji: '🧪', title: 'QA / SDET', description: 'Ensuring software quality.' },
      { id: 'exploring', emoji: '🧭', title: 'I\'m Still Exploring', description: 'Help me find my path.' }
    ]
  },
  {
    id: 'career_interest',
    section: 'goal',
    condition: (answers) => answers.career_goal === 'exploring',
    question: "Which type of work sounds most exciting?",
    type: "single",
    options: [
      { id: 'websites', title: 'Creating websites' },
      { id: 'apis', title: 'Building APIs' },
      { id: 'ai', title: 'Artificial Intelligence' },
      { id: 'data', title: 'Data Analysis' },
      { id: 'cloud', title: 'Cloud Infrastructure' },
      { id: 'security', title: 'Cyber Security' },
      { id: 'mobile', title: 'Mobile Apps' },
      { id: 'problem_solving', title: 'Problem Solving' },
      { id: 'ui', title: 'UI Design' }
    ],
    processingMessage: "Finding your best career match..."
  },
  {
    id: 'programming_experience',
    section: 'programming',
    question: "Which statement describes your programming experience?",
    type: "single",
    options: [
      { id: 'none', emoji: '🌱', title: 'I\'ve never written code.' },
      { id: 'basics', emoji: '📘', title: 'I\'ve learned the basics.' },
      { id: 'small', emoji: '💡', title: 'I can build small projects.' },
      { id: 'complete', emoji: '🚀', title: 'I can build complete applications.' },
      { id: 'real', emoji: '🏆', title: 'I\'m confident solving real-world problems.' }
    ]
  },
  {
    id: 'favorite_language',
    section: 'programming',
    question: "Which language feels most natural to you?",
    type: "single",
    options: [
      { id: 'c', title: 'C' },
      { id: 'cpp', title: 'C++' },
      { id: 'java', title: 'Java' },
      { id: 'python', title: 'Python' },
      { id: 'js', title: 'JavaScript' },
      { id: 'ts', title: 'TypeScript' },
      { id: 'go', title: 'Go' },
      { id: 'rust', title: 'Rust' },
      { id: 'none', title: 'No Preference Yet' }
    ]
  },
  {
    id: 'debugging',
    section: 'programming',
    question: "When your code breaks...\nWhich statement fits you best?",
    type: "single",
    options: [
      { id: 'help', emoji: '😅', title: 'I usually need help.' },
      { id: 'simple', emoji: '🙂', title: 'I can fix simple bugs.' },
      { id: 'most', emoji: '💪', title: 'I solve most bugs myself.' },
      { id: 'strength', emoji: '🔥', title: 'Debugging is one of my strengths.' }
    ]
  },
  {
    id: 'tech_areas',
    section: 'skills',
    question: "Which areas have you worked with?",
    type: "multi-category",
    options: [
      { id: 'frontend', title: 'Frontend Development', sub: ['HTML', 'CSS', 'JavaScript', 'React', 'Next.js', 'Tailwind CSS', 'Angular', 'Vue'] },
      { id: 'backend', title: 'Backend Development', sub: ['Node.js', 'Express', 'Spring Boot', 'Django', 'Flask', 'ASP.NET', 'REST APIs', 'GraphQL'] },
      { id: 'database', title: 'Databases', sub: ['MySQL', 'PostgreSQL', 'MongoDB', 'Firebase', 'SQLite', 'Redis'] },
      { id: 'cloud', title: 'Cloud', sub: ['AWS', 'Azure', 'Google Cloud', 'Vercel', 'Netlify', 'Render'] },
      { id: 'git', title: 'Git & GitHub', sub: [] },
      { id: 'devops', title: 'DevOps', sub: [] },
      { id: 'ai', title: 'Artificial Intelligence', sub: [] },
      { id: 'mobile', title: 'Mobile Development', sub: [] },
      { id: 'none', title: 'None Yet', sub: [] }
    ],
    processingMessage: "Understanding technical stack..."
  },
  {
    id: 'projects_count',
    section: 'projects',
    aiMessage: "Projects tell me more than grades.",
    question: "How would you describe your project experience?",
    type: "single",
    options: [
      { id: 'none', emoji: '📂', title: 'I haven\'t built any projects yet.' },
      { id: 'few', emoji: '🛠️', title: 'I\'ve built one or two.' },
      { id: 'several', emoji: '🚀', title: 'I\'ve completed several personal projects.' },
      { id: 'production', emoji: '🏆', title: 'I\'ve worked on production-level software.' }
    ]
  },
  {
    id: 'projects_location',
    section: 'projects',
    question: "Where are your projects?",
    type: "single",
    options: [
      { id: 'github', title: 'GitHub' },
      { id: 'portfolio', title: 'Portfolio Website' },
      { id: 'college', title: 'College Only' },
      { id: 'local', title: 'Local Computer' },
      { id: 'none', title: 'No Projects Yet' }
    ]
  },
  {
    id: 'github_activity',
    section: 'projects',
    question: "How active are you on GitHub?",
    type: "single",
    options: [
      { id: 'never', title: 'Never' },
      { id: 'occasionally', title: 'Occasionally' },
      { id: 'monthly', title: 'Monthly' },
      { id: 'weekly', title: 'Weekly' },
      { id: 'daily', title: 'Almost Every Day' }
    ]
  },
  {
    id: 'dsa_journey',
    section: 'dsa',
    question: "How would you describe your DSA journey?",
    type: "single",
    options: [
      { id: 'never', title: 'Never Started' },
      { id: 'basics', title: 'Learning Basics' },
      { id: 'easy', title: 'Easy Problems' },
      { id: 'medium', title: 'Medium Problems' },
      { id: 'hard', title: 'Hard Problems' }
    ]
  },
  {
    id: 'dsa_count',
    section: 'dsa',
    question: "Approximately how many coding problems have you solved?",
    type: "single",
    options: [
      { id: '0', title: '0' },
      { id: '1_50', title: '1–50' },
      { id: '50_150', title: '50–150' },
      { id: '150_300', title: '150–300' },
      { id: '300_500', title: '300–500' },
      { id: '500_plus', title: '500+' }
    ]
  },
  {
    id: 'dsa_platform',
    section: 'dsa',
    question: "Which platform do you primarily use?",
    type: "single",
    options: [
      { id: 'leetcode', title: 'LeetCode' },
      { id: 'codechef', title: 'CodeChef' },
      { id: 'codeforces', title: 'Codeforces' },
      { id: 'hackerrank', title: 'HackerRank' },
      { id: 'gfg', title: 'GeeksforGeeks' },
      { id: 'none', title: 'None Yet' }
    ]
  },
  {
    id: 'learning_style',
    section: 'learning',
    question: "How do you naturally learn best?",
    type: "single",
    options: [
      { id: 'videos', title: 'Watching Videos' },
      { id: 'projects', title: 'Building Projects' },
      { id: 'docs', title: 'Reading Documentation' },
      { id: 'ai', title: 'Learning with AI' },
      { id: 'courses', title: 'Structured Courses' },
      { id: 'books', title: 'Books' }
    ]
  },
  {
    id: 'learning_time',
    section: 'learning',
    question: "How much time can you consistently dedicate each day?",
    type: "single",
    options: [
      { id: '30m', title: 'Less than 30 Minutes' },
      { id: '1h', title: '30–60 Minutes' },
      { id: '2h', title: '1–2 Hours' },
      { id: '4h', title: '2–4 Hours' },
      { id: '4h_plus', title: 'More than 4 Hours' }
    ]
  },
  {
    id: 'learning_productive',
    section: 'learning',
    question: "When are you usually most productive?",
    type: "single",
    options: [
      { id: 'morning', title: 'Morning' },
      { id: 'afternoon', title: 'Afternoon' },
      { id: 'evening', title: 'Evening' },
      { id: 'night', title: 'Late Night' },
      { id: 'flexible', title: 'Flexible' }
    ]
  },
  {
    id: 'challenges',
    section: 'challenges',
    question: "What's currently holding you back?\nSelect up to 3.",
    type: "multi",
    max: 3,
    options: [
      { id: 'dont_know_learn', title: 'I don\'t know what to learn.' },
      { id: 'tutorial_hell', title: 'Too many tutorials.' },
      { id: 'dsa', title: 'DSA feels difficult.' },
      { id: 'no_projects', title: 'I don\'t have projects.' },
      { id: 'interview', title: 'Interview fear.' },
      { id: 'consistency', title: 'Poor consistency.' },
      { id: 'mentor', title: 'No mentor.' },
      { id: 'confidence', title: 'Lack of confidence.' },
      { id: 'resume', title: 'Resume isn\'t competitive.' },
      { id: 'apply', title: 'I don\'t know how to apply.' }
    ]
  },
  {
    id: 'final_goal',
    section: 'challenges',
    question: "If JobTune could help you achieve ONE goal this year...\nWhat would it be?",
    type: "single",
    options: [
      { id: 'internship', title: 'Get My First Internship' },
      { id: 'placement', title: 'Become Placement Ready' },
      { id: 'product_company', title: 'Crack a Product Company' },
      { id: 'fullstack', title: 'Master Full Stack Development' },
      { id: 'dsa_master', title: 'Become Great at DSA' },
      { id: 'portfolio', title: 'Build an Amazing Portfolio' },
      { id: 'interviews', title: 'Ace Technical Interviews' },
      { id: 'direction', title: 'Find My Career Direction' }
    ]
  }
];

export default function CareerDiscovery() {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [subAnswers, setSubAnswers] = useState({}); // for multi-category sub selections
  
  // States for rendering progression
  const [showAI, setShowAI] = useState(false);
  const [showQuestion, setShowQuestion] = useState(false);
  const [showProcessing, setShowProcessing] = useState(false);
  
  const [isActivelyTyping, setIsActivelyTyping] = useState(true);
  
  const layer1Ref = useRef(null);
  const layer2Ref = useRef(null);
  useRotationRef(4, 3, isActivelyTyping, layer1Ref);
  useRotationRef(-6, 3, isActivelyTyping, layer2Ref);

  const currentStep = DISCOVERY_FLOW[currentIndex];
  
  useEffect(() => {
    // Reset states when step changes
    if (currentStep?.aiMessage) {
      setShowAI(true);
      setShowQuestion(false);
    } else {
      setShowAI(false);
      setShowQuestion(true);
      setIsActivelyTyping(false); // If no AI message, we aren't typing
    }
  }, [currentIndex, currentStep]);

  // Handle skip logic if condition isn't met
  useEffect(() => {
    if (currentStep?.condition && !currentStep.condition(answers)) {
      goToNextStep();
    }
  }, [currentIndex]);

  const handleAIComplete = () => {
    setIsActivelyTyping(false);
    setTimeout(() => {
      setShowQuestion(true);
    }, 400); // Pause before showing question
  };

  const handleSelect = (optionId) => {
    if (currentStep.type === 'single') {
      setAnswers(prev => ({ ...prev, [currentStep.id]: optionId }));
      // Auto-advance after 300ms
      setTimeout(() => {
        if (currentStep.processingMessage) {
          setShowProcessing(true);
          setShowQuestion(false);
          setShowAI(false);
          setTimeout(() => {
            setShowProcessing(false);
            goToNextStep();
          }, 2000);
        } else {
          goToNextStep();
        }
      }, 300);
    } else if (currentStep.type === 'multi') {
      setAnswers(prev => {
        const current = prev[currentStep.id] || [];
        if (current.includes(optionId)) {
          return { ...prev, [currentStep.id]: current.filter(id => id !== optionId) };
        } else if (!currentStep.max || current.length < currentStep.max) {
          return { ...prev, [currentStep.id]: [...current, optionId] };
        }
        return prev;
      });
    } else if (currentStep.type === 'multi-category') {
       setAnswers(prev => {
        const current = prev[currentStep.id] || [];
        if (current.includes(optionId)) {
          return { ...prev, [currentStep.id]: current.filter(id => id !== optionId) };
        } else {
          return { ...prev, [currentStep.id]: [...current, optionId] };
        }
      });
    }
  };

  const handleSubSelect = (catId, subItem) => {
    setSubAnswers(prev => {
      const catSub = prev[catId] || [];
      if (catSub.includes(subItem)) {
        return { ...prev, [catId]: catSub.filter(i => i !== subItem) };
      } else {
        return { ...prev, [catId]: [...catSub, subItem] };
      }
    });
  };

  const handleContinueMulti = () => {
    if (currentStep.processingMessage) {
      setShowProcessing(true);
      setShowQuestion(false);
      setShowAI(false);
      setTimeout(() => {
        setShowProcessing(false);
        goToNextStep();
      }, 2000);
    } else {
      goToNextStep();
    }
  };

  const goToNextStep = () => {
    if (currentIndex < DISCOVERY_FLOW.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // Finished all steps -> Navigate to AI Analysis
      navigate('/career-preview', { state: { answers, subAnswers } }); 
    }
  };

  const currentSectionIdx = SECTIONS.findIndex(s => s.id === currentStep?.section);

  if (!currentStep) return null;

  return (
    <div className="fixed inset-0 bg-[#020617] flex overflow-hidden font-sans">
      
      {/* Background Aura */}
      <div className="absolute inset-0 z-0 overflow-hidden opacity-100 transition-opacity duration-1000">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120vw] aspect-square rounded-full flex items-center justify-center mix-blend-screen" ref={layer1Ref}>
          <div className="absolute top-0 right-0 w-[60vw] h-[60vw] rounded-full bg-[radial-gradient(closest-side,rgba(59,130,246,0.25)_0%,transparent_100%)] blur-2xl translate-x-1/4 -translate-y-1/4" />
          <div className="absolute bottom-0 left-0 w-[60vw] h-[60vw] rounded-full bg-[radial-gradient(closest-side,rgba(239,68,68,0.2)_0%,transparent_100%)] blur-2xl -translate-x-1/4 translate-y-1/4" />
        </div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100vw] aspect-square rounded-full flex items-center justify-center mix-blend-screen" ref={layer2Ref}>
          <div className="absolute top-0 left-0 w-[50vw] h-[50vw] rounded-full bg-[radial-gradient(closest-side,rgba(234,179,8,0.15)_0%,transparent_100%)] blur-2xl -translate-x-1/4 -translate-y-1/4" />
          <div className="absolute bottom-0 right-0 w-[50vw] h-[50vw] rounded-full bg-[radial-gradient(closest-side,rgba(34,197,94,0.15)_0%,transparent_100%)] blur-2xl translate-x-1/4 translate-y-1/4" />
        </div>
      </div>

      {/* Main UI Container */}
      <div className="relative z-10 w-full h-full flex flex-col md:flex-row backdrop-blur-[60px] bg-[rgba(4,9,26,0.2)] p-4 md:p-8">
        
        {/* Solid Core to create frosted edge */}
        <div className="absolute inset-[10px] md:inset-[20px] rounded-[2.5rem] bg-[#04091a] blur-[15px] z-0" />

        {/* Content Container */}
        <div className="relative z-10 w-full h-full flex flex-col md:flex-row overflow-hidden rounded-[2.5rem]">
          
          {/* Sidebar Progress (Hidden on mobile for space) */}
          <div className="hidden md:flex flex-col w-64 pt-12 pl-8 border-r border-white/5">
            <h2 className="text-xl font-bold text-white mb-12 flex items-center">
              <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center mr-3">
                <div className="w-2 h-2 bg-white rounded-full" />
              </div>
              JobTune
            </h2>
            <div className="flex flex-col space-y-6">
              {SECTIONS.map((section, idx) => {
                const isActive = idx === currentSectionIdx;
                const isCompleted = idx < currentSectionIdx;
                return (
                  <div key={section.id} className="flex items-center">
                    <div className={`
                      flex items-center justify-center w-8 h-8 rounded-full transition-all duration-500 z-10 relative
                      ${isActive ? 'bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.8)]' : 
                        isCompleted ? 'bg-blue-900/50 text-blue-400' : 'bg-white/5 text-slate-500'}
                    `}>
                      {isCompleted ? <Check className="w-4 h-4" /> : <span className={`text-xs font-semibold ${isActive ? 'text-white' : ''}`}>{idx + 1}</span>}
                    </div>
                    <span className={`ml-4 text-sm font-semibold transition-colors duration-300 ${isActive ? 'text-white drop-shadow-md' : isCompleted ? 'text-slate-300' : 'text-slate-600'}`}>
                      {section.title}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Main Discovery Area */}
          <div className="flex-1 flex flex-col h-full overflow-y-auto pt-8 pb-20 md:pb-8 px-4 md:px-12 scrollbar-hide relative">
            
            <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full justify-center min-h-full">
              
              {/* Processing Overlay */}
              {showProcessing && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#04091a]/80 backdrop-blur-sm animate-in fade-in duration-500">
                  <div className="text-center">
                    <div className="inline-block w-10 h-10 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mb-6" />
                    <h3 className="text-xl md:text-2xl text-white font-medium">
                      <SmoothTypewriter text={currentStep.processingMessage} speed={30} onStart={() => setIsActivelyTyping(true)} />
                    </h3>
                  </div>
                </div>
              )}

              {/* AI Intro Message */}
              {showAI && !showProcessing && (
                <div className="mb-12">
                  <div className="flex items-center mb-6">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.4)] mr-4">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <span className="text-blue-400 font-semibold tracking-wider text-sm uppercase">AI Mentor</span>
                  </div>
                  <h2 className="text-2xl md:text-4xl text-white font-medium leading-relaxed">
                    <SmoothTypewriter 
                      text={currentStep.aiMessage} 
                      speed={25} 
                      onStart={() => setIsActivelyTyping(true)}
                      onComplete={handleAIComplete} 
                    />
                  </h2>
                </div>
              )}

              {/* Question & Options */}
              {showQuestion && !showProcessing && (
                <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 w-full">
                  <h2 className="text-2xl md:text-3xl text-white font-bold mb-8 whitespace-pre-wrap">
                    {currentStep.question}
                  </h2>

                  <div className={`grid gap-4 ${currentStep.options.some(o => o.description) ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'}`}>
                    {currentStep.options.map(option => {
                      const isSelected = currentStep.type === 'multi' || currentStep.type === 'multi-category' 
                        ? (answers[currentStep.id] || []).includes(option.id)
                        : answers[currentStep.id] === option.id;

                      return (
                        <div key={option.id} className="flex flex-col">
                          <GlassCard
                            title={option.title}
                            description={option.description}
                            emoji={option.emoji}
                            isSelected={isSelected}
                            onClick={() => handleSelect(option.id)}
                            className="h-full"
                          />
                          
                          {/* Sub-options for Technical Skills */}
                          {currentStep.type === 'multi-category' && isSelected && option.sub && option.sub.length > 0 && (
                            <div className="mt-2 p-3 rounded-xl bg-white/5 border border-white/10 animate-in slide-in-from-top-2 fade-in duration-300">
                              <div className="flex flex-wrap gap-2">
                                {option.sub.map(subItem => {
                                  const isSubSelected = (subAnswers[option.id] || []).includes(subItem);
                                  return (
                                    <button
                                      key={subItem}
                                      onClick={() => handleSubSelect(option.id, subItem)}
                                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                        isSubSelected 
                                          ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.5)]' 
                                          : 'bg-white/10 text-slate-300 hover:bg-white/20'
                                      }`}
                                    >
                                      {subItem}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Continue button for multi-select */}
                  {(currentStep.type === 'multi' || currentStep.type === 'multi-category') && (
                    <div className="mt-12 flex justify-end">
                      <button
                        onClick={handleContinueMulti}
                        disabled={!(answers[currentStep.id] && answers[currentStep.id].length > 0)}
                        className={`
                          flex items-center px-8 py-3 rounded-xl font-bold text-lg transition-all duration-300
                          ${answers[currentStep.id] && answers[currentStep.id].length > 0 
                            ? 'bg-white text-[#04091a] hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)]' 
                            : 'bg-white/10 text-white/30 cursor-not-allowed'}
                        `}
                      >
                        Continue
                        <ChevronRight className="w-5 h-5 ml-2" />
                      </button>
                    </div>
                  )}

                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
