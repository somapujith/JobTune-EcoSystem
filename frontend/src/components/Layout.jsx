import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Briefcase, Activity, FileText, UserCircle, LayoutDashboard, Menu } from 'lucide-react';
import useAuthStore from '../store/useAuthStore';

const Navbar = () => {
  const { user, logout } = useAuthStore();
  
  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center gap-2">
              <Briefcase className="w-8 h-8 text-blue-600" />
              <span className="font-bold text-xl tracking-tight text-slate-900">FresherPrep</span>
            </Link>
          </div>
          <div className="hidden sm:flex sm:items-center sm:space-x-8">
            <Link to="/skills" className="text-slate-600 hover:text-blue-600 font-medium transition-colors">Skills Assessment</Link>
            <Link to="/resume" className="text-slate-600 hover:text-blue-600 font-medium transition-colors">Resume Optimizer</Link>
            <Link to="/dashboard" className="text-slate-600 hover:text-blue-600 font-medium transition-colors">Dashboard</Link>
            {user ? (
               <button onClick={logout} className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-200 transition-colors">Logout</button>
            ) : (
               <Link to="/login" className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm">Login / Signup</Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

const Layout = () => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar />
      <main className="flex-grow flex flex-col">
        <Outlet />
      </main>
      <footer className="bg-slate-900 text-slate-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
             <div>
                <div className="flex items-center gap-2 mb-4 text-white">
                  <Briefcase className="w-6 h-6" />
                  <span className="font-bold text-lg">FresherPrep</span>
                </div>
                <p className="text-sm">The complete ecosystem for fresh graduates to build skills and land jobs. Free forever.</p>
             </div>
             <div>
               <h3 className="text-white font-semibold mb-4">Ecosystem</h3>
               <ul className="space-y-2 text-sm">
                 <li><Link to="/skills" className="hover:text-white transition-colors">Skill Assessment</Link></li>
                 <li><Link to="/resume" className="hover:text-white transition-colors">Resume Optimizer</Link></li>
               </ul>
             </div>
          </div>
          <div className="border-t border-slate-800 mt-12 pt-8 text-center text-sm">
            &copy; {new Date().getFullYear()} FresherPrep Ecosystem. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
