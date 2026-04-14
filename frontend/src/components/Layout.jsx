import React, { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Menu, X, Lock } from 'lucide-react';
import useAuthStore from '../store/useAuthStore';

const navLinks = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Resume Optimizer', path: '/resume', locked: true },
  { label: 'Content Vault', path: '/learning' },
  { label: 'Skill Assessment', path: '/skills' },
  { label: 'Mock Interview', path: '/interview' },
];

const Navbar = () => {
  const { user, logout, isAuthenticated, checkAuth } = useAuthStore();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <header className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur-xl shadow-[0px_4px_24px_rgba(0,78,159,0.08)] border-b border-slate-100">
      <div className="flex justify-between items-center px-6 lg:px-8 h-20 max-w-7xl mx-auto">
        <div className="flex items-center gap-10">
          <Link to="/" className="text-2xl font-black tracking-tight text-blue-800 font-headline">
            JobTune
          </Link>
          <nav className="hidden lg:flex items-center gap-8">
            {navLinks.map(link => (
              link.locked ? (
                <div 
                  key={link.path}
                  className="flex items-center gap-1.5 text-sm font-semibold text-slate-300 cursor-not-allowed"
                  title="Coming soon/Under maintenance"
                >
                  {link.label}
                  <Lock className="w-3.5 h-3.5" />
                </div>
              ) : (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`text-sm font-semibold transition-all duration-200 ${
                    location.pathname === link.path
                      ? 'text-blue-700 border-b-2 border-blue-600 pb-0.5'
                      : 'text-slate-500 hover:text-blue-600'
                  }`}
                >
                  {link.label}
                </Link>
              )
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden md:block text-sm text-slate-500 font-medium hover:text-blue-600 cursor-pointer transition-colors">Support</span>
          <div className="hidden md:flex items-center gap-3 border-l pl-4 border-slate-200">
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
        <div className="lg:hidden bg-white border-t border-slate-100 shadow-lg">
          <nav className="flex flex-col px-6 py-4 gap-1 max-w-7xl mx-auto">
            {navLinks.map(link => (
              link.locked ? (
                <div 
                  key={link.path}
                  className="flex items-center justify-between py-3 px-4 rounded-xl text-sm font-semibold text-slate-300 bg-slate-50 cursor-not-allowed"
                >
                  <span>{link.label}</span>
                  <Lock className="w-4 h-4" />
                </div>
              ) : (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`py-3 px-4 rounded-xl text-sm font-semibold transition-colors ${
                    location.pathname === link.path
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-blue-600'
                  }`}
                >
                  {link.label}
                </Link>
              )
            ))}
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
          <a className="text-slate-500 hover:text-blue-700 transition-opacity duration-300" href="#">Privacy Policy</a>
          <a className="text-slate-500 hover:text-blue-700 transition-opacity duration-300" href="#">Terms of Service</a>
          <a className="text-slate-500 hover:text-blue-700 transition-opacity duration-300" href="#">Help Center</a>
          <a className="text-slate-500 hover:text-blue-700 transition-opacity duration-300" href="#">API</a>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
