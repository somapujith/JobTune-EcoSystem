import { useEffect, useState, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown, Moon, Sun } from 'lucide-react';
import useAuthStore from '../store/useAuthStore';
import { useDarkMode } from '../hooks/useDarkMode';

const NAV_GROUPS = [
  { label: 'Job Search', items: [
    { label: 'Job Tracker',      path: '/jobs',      desc: 'Track applications' },
    { label: 'Job Matcher',      path: '/jobmatch',  desc: 'Find matching roles' },
  ]},
  { label: 'Portfolios', items: [
    { label: 'GitHub Profile',   path: '/github',    desc: 'Audit & generate README' },
    { label: 'LinkedIn Profile', path: '/linkedin',  desc: 'Score your LinkedIn presence' },
  ]},
  { label: 'Learning', items: [
    { label: 'Content Vault',    path: '/learning',   desc: 'Curated resources' },
    { label: 'Skill Assessment', path: '/skills',     desc: '25+ domain quiz' },
    { label: 'Mock Interview',   path: '/interview',  desc: 'AI-powered practice' },
  ]},
];

const Navbar = () => {
  const { user, logout, isAuthenticated, checkAuth } = useAuthStore();
  const [isDark, setIsDark] = useDarkMode();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);
  const [openMobileGroup, setOpenMobileGroup] = useState(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setOpenGroup(null);
  }, [location.pathname]);

  // Close dropdown when clicking outside
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
    <header className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur-xl shadow-[0px_4px_24px_rgba(0,78,159,0.08)] border-b border-slate-100">
      <div className="flex justify-between items-center px-6 lg:px-8 h-20 max-w-7xl mx-auto">
        <div className="flex items-center gap-10">
          <Link to="/" className="text-2xl font-black tracking-tight text-blue-800 font-headline">
            JobTune
          </Link>
          <nav className="hidden lg:flex items-center gap-8" ref={dropdownRef}>
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
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsDark(!isDark)}
            title={isDark ? 'Light mode' : 'Dark mode'}
            className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <span className="hidden md:block text-sm text-slate-500 dark:text-slate-400 font-medium hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors">Support</span>
          <div className="hidden md:flex items-center gap-3 border-l pl-4 border-slate-200 dark:border-slate-700">
            {isAuthenticated ? (
              <>
                <button
                  onClick={logout}
                  title="Logout"
                  className="flex items-center gap-2 text-sm text-slate-500 hover:text-rose-600 font-medium transition-colors px-3 py-2 rounded-lg hover:bg-rose-50"
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

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(prev => !prev)}
            className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-white border-t border-slate-100 shadow-lg max-h-[80vh] overflow-y-auto">
          <nav className="flex flex-col px-6 py-4 gap-2 max-w-7xl mx-auto">
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
  return (
    <div className="min-h-screen flex flex-col font-body bg-surface text-on-surface antialiased overflow-x-hidden">
      <Navbar />
      <div className="flex-grow flex pt-20">
        <Outlet />
      </div>
      
      <footer className="w-full border-t-0 bg-slate-50 dark:bg-slate-950 flex justify-between items-center px-8 py-12 font-body text-sm">
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
  );
};

export default Layout;
