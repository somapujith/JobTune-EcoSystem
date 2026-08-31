import { useEffect, useState, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown, Moon, Sun, Crown } from 'lucide-react';
import useAuthStore from '../store/useAuthStore';
import useSubscriptionStore from '../store/useSubscriptionStore';
import { useDarkMode } from '../hooks/useDarkMode';
import { api } from '../store/useAuthStore';

const BASE_NAV_GROUPS = [
  { label: 'Job Search', items: [
    { label: 'Job Discovery',    path: '/discover',  desc: 'Find new opportunities' },
    { label: 'Job Tracker',      path: '/jobs',      desc: 'Track applications' },
    { label: 'Job Matcher',      path: '/jobmatch',  desc: 'Find matching roles' },
  ]},
  { label: 'Job Tools', items: [
    { label: 'Job Analyzer',     path: '/job-analyzer', desc: 'Extract skills from postings' },
    { label: 'ATS Checker',      path: '/ats-checker',  desc: 'Resume-job match score' },
    { label: 'Job Fit Scorer',   path: '/job-fit',      desc: 'Detailed job fit analysis' },
    { label: 'Cover Letter',     path: '/cover-letter', desc: 'AI-generated letters' },
    { label: 'Achievement Enhancer', path: '/achievement-enhancer', desc: 'Turn tasks into impact bullets' },
    { label: 'Resume Consistency',   path: '/resume-consistency',   desc: 'Cross-check resume vs profiles' },
  ]},
  { label: 'Portfolios', items: [
    { label: 'GitHub Profile',   path: '/github',    desc: 'Audit & generate README' },
    { label: 'LinkedIn Profile', path: '/linkedin',  desc: 'Score your LinkedIn presence' },
    { label: 'Recruiter Visibility', path: '/recruiter-visibility', desc: 'How recruiters see you' },
  ]},
];

const PREP_ITEM_LOCKED = [
  { label: 'Preparation Dashboard', path: '/preparation', desc: 'Your central prep center' },
  { label: 'Learning Path', path: '/learning-path', desc: 'Tiered curricula with streak tracking' },
];

const PREP_ITEMS_UNLOCKED = [
  { label: 'Preparation Dashboard', path: '/preparation', desc: 'Your central prep center' },
  { label: 'Tune & Polish', path: '/preparation/tune-and-polish', desc: 'Interview Copilot & Resumes' },
  { label: 'Zero to Hero', path: '/preparation/zero-to-hero', desc: 'Path Finder & AI Tutor' },
  { label: 'Learn & Build', path: '/preparation/learn-and-build', desc: 'Targeted Portfolio Projects' },
  { label: 'Learning Path', path: '/learning-path', desc: 'Tiered curricula with streak tracking' },
];

const Navbar = () => {
  // App.jsx owns checkAuth — Navbar just reads state, no duplicate call
  const { user, logout, isAuthenticated } = useAuthStore();
  const { userPlan } = useSubscriptionStore();
  const [isDark, setIsDark] = useDarkMode();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);
  const [openMobileGroup, setOpenMobileGroup] = useState(null);
  const [prepUnlocked, setPrepUnlocked] = useState(false);
  const dropdownRef = useRef(null);

  // Fetch prep-onboarding status once on login; listen for custom events only
  useEffect(() => {
    if (!isAuthenticated) {
      setPrepUnlocked(false);
      return;
    }
    const recheck = () => {
      api.get('/progress/preferences')
        .then(({ data }) => { if (data?.data?.prepOnboardingDone) setPrepUnlocked(true); })
        .catch(() => {});
    };
    recheck();
    window.addEventListener('prep-onboarding-complete', recheck);
    window.addEventListener('prep-onboarding-reset', () => setPrepUnlocked(false));
    return () => {
      window.removeEventListener('prep-onboarding-complete', recheck);
      window.removeEventListener('prep-onboarding-reset', () => setPrepUnlocked(false));
    };
  }, [isAuthenticated]);

  const NAV_GROUPS = [
    ...BASE_NAV_GROUPS,
    {
      label: 'Preparation',
      items: prepUnlocked ? PREP_ITEMS_UNLOCKED : PREP_ITEM_LOCKED,
    },
  ];

  useEffect(() => {
    setMobileOpen(false);
    setOpenGroup(null);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenGroup(null);
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setOpenGroup(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const isGroupActive = (group) => group.items.some(item => location.pathname.startsWith(item.path));

  return (
    <header className="fixed top-0 w-full z-50 glass-panel border-b border-white/40 dark:border-slate-800/50">
      <div className="flex items-center px-6 lg:px-10 h-16 w-full gap-4">
        <Link to="/" className="text-2xl font-black tracking-tight text-blue-800 font-headline flex-shrink-0 mr-2">
          JobTune
        </Link>

        <nav className="hidden lg:flex items-center gap-5 flex-1 justify-center min-w-0" ref={dropdownRef}>
          <Link
            to="/dashboard"
            className={`text-sm font-semibold transition-all duration-200 ${
              location.pathname === '/dashboard'
                ? 'text-blue-700 border-b-2 border-blue-600 pb-0.5'
                : 'text-slate-500 hover:text-blue-600'
            }`}
          >
            Dashboard
          </Link>
          <Link
            to="/resume"
            className={`text-sm font-semibold transition-all duration-200 ${
              location.pathname.startsWith('/resume')
                ? 'text-blue-700 border-b-2 border-blue-600 pb-0.5'
                : 'text-slate-500 hover:text-blue-600'
            }`}
          >
            Resume Forge
          </Link>
          <Link
            to="/blog"
            className={`text-sm font-semibold transition-all duration-200 ${
              location.pathname === '/blog'
                ? 'text-blue-700 border-b-2 border-blue-600 pb-0.5'
                : 'text-slate-500 hover:text-blue-600'
            }`}
          >
            Blog
          </Link>
          {NAV_GROUPS.map((group) => {
            const active = isGroupActive(group);
            const isOpen = openGroup === group.label;
            return (
              <div key={group.label} className="relative">
                <button
                  onClick={() => setOpenGroup(isOpen ? null : group.label)}
                  className={`flex items-center gap-1 text-sm font-semibold transition-colors duration-200 ${
                    active || isOpen ? 'text-blue-700' : 'text-slate-500 hover:text-blue-600'
                  }`}
                >
                  {group.label}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="absolute top-full left-0 mt-6 w-64 bg-white rounded-2xl shadow-[0px_16px_40px_rgba(0,78,159,0.12)] border border-slate-100 py-2 z-50">
                    {group.items.map(item => (
                      <Link
                        key={item.path}
                        to={item.path}
                        className="flex flex-col px-4 py-3 hover:bg-blue-50 transition-colors group rounded-xl mx-2"
                      >
                        <span className="text-sm font-semibold text-slate-800 group-hover:text-blue-700">{item.label}</span>
                        <span className="text-xs text-slate-400 mt-0.5">{item.desc}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <button
            onClick={() => setIsDark(!isDark)}
            title={isDark ? 'Light mode' : 'Dark mode'}
            className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <span className="hidden xl:block text-sm text-slate-500 dark:text-slate-400 font-medium hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors">Support</span>
          <div className="hidden md:flex items-center gap-2 border-l pl-3 border-slate-200 dark:border-slate-700">
            {isAuthenticated ? (
              <>
                {userPlan && (
                  <Link
                    to="/dashboard/settings/plans"
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors group"
                    title="Manage or switch your plan"
                  >
                    <Crown className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-300 hidden sm:inline group-hover:underline">{userPlan.name}</span>
                  </Link>
                )}
                <button
                  onClick={logout}
                  title="Logout"
                  className="flex items-center gap-2 text-sm text-slate-500 hover:text-rose-600 font-medium transition-colors px-3 py-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20"
                >
                  <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>logout</span>
                  <span className="hidden lg:inline">Sign Out</span>
                </button>
                <div className="h-9 w-9 rounded-full bg-blue-100 overflow-hidden border-2 border-blue-200 shrink-0">
                  <img alt="User avatar" className="w-full h-full object-cover" src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id || '42'}`} />
                </div>
              </>
            ) : (
              <Link
                to="/login"
                className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm"
              >
                Sign In
              </Link>
            )}
          </div>

          <button
            onClick={() => setMobileOpen(prev => !prev)}
            className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden bg-white border-t border-slate-100 shadow-lg max-h-[80vh] overflow-y-auto">
          <nav className="flex flex-col px-6 py-4 gap-2 w-full">
            <Link
              to="/dashboard"
              className={`py-3 px-4 rounded-xl text-sm font-semibold transition-colors ${
                location.pathname === '/dashboard'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-blue-600'
              }`}
            >
              Dashboard
            </Link>
            <Link
              to="/resume"
              className={`py-3 px-4 rounded-xl text-sm font-semibold transition-colors ${
                location.pathname.startsWith('/resume')
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-blue-600'
              }`}
            >
              Resume Forge
            </Link>
            <Link
              to="/blog"
              className={`py-3 px-4 rounded-xl text-sm font-semibold transition-colors ${
                location.pathname === '/blog'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-blue-600'
              }`}
            >
              Blog
            </Link>

            {NAV_GROUPS.map((group) => {
              const isOpen = openMobileGroup === group.label;
              return (
                <div key={group.label} className="flex flex-col">
                  <button
                    onClick={() => setOpenMobileGroup(isOpen ? null : group.label)}
                    className="flex items-center justify-between py-3 px-4 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    {group.label}
                    <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isOpen && (
                    <div className="flex flex-col pl-4 border-l-2 border-slate-100 ml-6 mt-1 gap-1">
                      {group.items.map(item => (
                        <Link
                          key={item.path}
                          to={item.path}
                          className={`py-2 px-4 rounded-lg text-sm transition-colors ${
                            location.pathname === item.path
                              ? 'text-blue-700 font-semibold bg-blue-50'
                              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                          }`}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="border-t border-slate-100 mt-2 pt-3 flex items-center justify-between">
              <span className="text-sm text-slate-500 font-medium">Support</span>
              {isAuthenticated ? (
                <button
                  onClick={logout}
                  className="flex items-center gap-2 text-sm text-rose-600 font-semibold px-4 py-2 rounded-lg bg-rose-50"
                >
                  Sign Out
                </button>
              ) : (
                <Link to="/login" className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold">
                  Sign In
                </Link>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};

const Layout = () => {
  const location = useLocation();

  const isFullScreenPage = location.pathname === '/onboarding' || location.pathname === '/payment-confirm';

  if (isFullScreenPage) {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen flex flex-col font-body bg-slate-50 dark:bg-[#030712] text-slate-900 dark:text-slate-100 antialiased overflow-x-hidden relative transition-colors duration-500">
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-blue-400/30 mix-blend-multiply filter blur-[120px] opacity-70 animate-blob dark:bg-blue-900/40 dark:mix-blend-screen" />
        <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-400/30 mix-blend-multiply filter blur-[120px] opacity-70 animate-blob dark:bg-indigo-900/40 dark:mix-blend-screen" style={{ animationDelay: '3s' }} />
        <div className="absolute bottom-[-20%] left-[20%] w-[60%] h-[60%] rounded-full bg-cyan-400/30 mix-blend-multiply filter blur-[120px] opacity-70 animate-blob dark:bg-cyan-900/40 dark:mix-blend-screen" style={{ animationDelay: '6s' }} />
      </div>

      <div className="relative z-10 w-full flex flex-col flex-grow">
        <Navbar />
        <div className="flex-grow flex pt-20">
          <Outlet />
        </div>

        <footer className="w-full border-t-0 bg-transparent flex justify-between items-center px-8 py-12 font-body text-sm relative z-10">
          <div className="text-slate-500 dark:text-slate-400">
            &copy; 2024 JobTune AI. Professional Vanguard System.
          </div>
          <div className="flex gap-8">
            <a className="text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 transition-colors duration-300" href="#">Privacy Policy</a>
            <a className="text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 transition-colors duration-300" href="#">Terms of Service</a>
            <a className="text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 transition-colors duration-300" href="#">Help Center</a>
            <a className="text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-400 transition-colors duration-300" href="#">API</a>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Layout;
