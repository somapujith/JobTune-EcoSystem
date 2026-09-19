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
  const { user, logout, isAuthenticated } = useAuthStore();
  const { userPlan } = useSubscriptionStore();
  const [isDark, setIsDark] = useDarkMode();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);
  const [openMobileGroup, setOpenMobileGroup] = useState(null);
  const [prepUnlocked, setPrepUnlocked] = useState(false);
  const dropdownRef = useRef(null);

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
    <header className="fixed top-0 w-full z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-800/60">
      <div className="flex items-center px-5 lg:px-8 h-16 w-full max-w-[1400px] mx-auto gap-4">
        <Link to="/" className="text-xl font-extrabold tracking-tight text-blue-700 dark:text-blue-400 font-headline flex-shrink-0 mr-1 leading-none">
          JobTune
        </Link>

        <nav className="hidden lg:flex items-center gap-1 flex-1 justify-center min-w-0" ref={dropdownRef}>
          {[
            { label: 'Dashboard', path: '/dashboard', exact: true },
            { label: 'Resume Forge', path: '/resume', prefix: true },
            { label: 'Blog', path: '/blog', exact: true },
          ].map(link => {
            const isActive = link.exact
              ? location.pathname === link.path
              : location.pathname.startsWith(link.path);
            return (
              <Link
                key={link.path}
                to={link.path}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  isActive
                    ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                {link.label}
              </Link>
            );
          })}

          {NAV_GROUPS.map((group) => {
            const active = isGroupActive(group);
            const isOpen = openGroup === group.label;
            return (
              <div key={group.label} className="relative">
                <button
                  onClick={() => setOpenGroup(isOpen ? null : group.label)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    active || isOpen
                      ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  {group.label}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="absolute top-full left-0 mt-3 w-60 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 py-1.5 z-50 animate-fade-in">
                    {group.items.map(item => (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`flex flex-col px-4 py-2.5 mx-1.5 rounded-lg transition-colors ${
                          location.pathname === item.path
                            ? 'bg-blue-50 dark:bg-blue-950/40'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <span className={`text-sm font-semibold ${
                          location.pathname === item.path
                            ? 'text-blue-700 dark:text-blue-400'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}>{item.label}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{item.desc}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
          <button
            onClick={() => setIsDark(!isDark)}
            title={isDark ? 'Light mode' : 'Dark mode'}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
          </button>

          <div className="hidden md:flex items-center gap-1.5 border-l pl-3 ml-1 border-slate-200 dark:border-slate-700">
            {isAuthenticated ? (
              <>
                {userPlan && (
                  <Link
                    to="/dashboard/settings/plans"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-950/60 transition-colors"
                    title="Manage or switch your plan"
                  >
                    <Crown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-300 hidden sm:inline">{userPlan.name}</span>
                  </Link>
                )}
                <button
                  onClick={logout}
                  title="Logout"
                  className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 font-medium transition-colors px-2.5 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20"
                >
                  <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 0" }}>logout</span>
                  <span className="hidden lg:inline text-xs font-semibold leading-none">Sign Out</span>
                </button>
                <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/40 overflow-hidden border-2 border-blue-200 dark:border-blue-800 shrink-0">
                  <img alt="User avatar" className="w-full h-full object-cover" src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id || '42'}`} />
                </div>
              </>
            ) : (
              <Link
                to="/login"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>

          <button
            onClick={() => setMobileOpen(prev => !prev)}
            className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-lg max-h-[80vh] overflow-y-auto animate-fade-in">
          <nav className="flex flex-col px-4 py-3 gap-0.5 w-full">
            {[
              { label: 'Dashboard', path: '/dashboard' },
              { label: 'Resume Forge', path: '/resume' },
              { label: 'Blog', path: '/blog' },
            ].map(link => (
              <Link
                key={link.path}
                to={link.path}
                className={`py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors ${
                  location.pathname === link.path || location.pathname.startsWith(link.path + '/')
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                {link.label}
              </Link>
            ))}

            {NAV_GROUPS.map((group) => {
              const isOpen = openMobileGroup === group.label;
              return (
                <div key={group.label} className="flex flex-col">
                  <button
                    onClick={() => setOpenMobileGroup(isOpen ? null : group.label)}
                    className="flex items-center justify-between py-2.5 px-4 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    {group.label}
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isOpen && (
                    <div className="flex flex-col pl-4 border-l-2 border-slate-100 dark:border-slate-800 ml-6 mt-0.5 gap-0.5">
                      {group.items.map(item => (
                        <Link
                          key={item.path}
                          to={item.path}
                          className={`py-2 px-3 rounded-lg text-sm transition-colors ${
                            location.pathname === item.path
                              ? 'text-blue-700 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-950/40'
                              : 'text-slate-500 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
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

            <div className="border-t border-slate-100 dark:border-slate-800 mt-2 pt-2 flex items-center justify-between px-4">
              {isAuthenticated ? (
                <button
                  onClick={logout}
                  className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400 font-semibold px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20"
                >
                  Sign Out
                </button>
              ) : (
                <Link to="/login" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">
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
    <div className="min-h-screen flex flex-col font-body bg-slate-50 dark:bg-[#030712] text-slate-900 dark:text-slate-100 antialiased overflow-x-hidden relative transition-colors duration-300">
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-15%] left-[-15%] w-[50%] h-[50%] rounded-full bg-blue-200/40 mix-blend-multiply filter blur-[140px] opacity-50 animate-blob dark:bg-blue-950/30 dark:mix-blend-screen" />
        <div className="absolute top-[-10%] right-[-15%] w-[50%] h-[50%] rounded-full bg-indigo-200/40 mix-blend-multiply filter blur-[140px] opacity-50 animate-blob dark:bg-indigo-950/30 dark:mix-blend-screen" style={{ animationDelay: '3s' }} />
        <div className="absolute bottom-[-25%] left-[15%] w-[50%] h-[50%] rounded-full bg-cyan-200/30 mix-blend-multiply filter blur-[140px] opacity-40 animate-blob dark:bg-cyan-950/20 dark:mix-blend-screen" style={{ animationDelay: '6s' }} />
      </div>

      <div className="relative z-10 w-full flex flex-col flex-grow">
        <Navbar />
        <div className="flex-grow flex pt-16">
          <Outlet />
        </div>

        <footer className="w-full bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border-t border-slate-200/50 dark:border-slate-800/50 relative z-10">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center px-6 py-6 gap-4">
            <div className="text-sm text-slate-400 dark:text-slate-500 font-medium">
              &copy; {new Date().getFullYear()} JobTune AI
            </div>
            <div className="flex gap-6">
              {['Privacy Policy', 'Terms of Service', 'Help Center'].map(label => (
                <a key={label} className="text-sm text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium" href="#">
                  {label}
                </a>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Layout;
