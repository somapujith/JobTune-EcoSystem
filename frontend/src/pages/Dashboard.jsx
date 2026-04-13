import React from 'react';
import useAuthStore from '../store/useAuthStore';
import { Navigate } from 'react-router-dom';
import { Target, Activity, FileText, CheckCircle2, TrendingUp } from 'lucide-react';

export default function Dashboard() {
  const { user, isAuthenticated } = useAuthStore();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 w-full">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Welcome back, {user?.email?.split('@')[0] || 'User'}!</h1>
          <p className="text-slate-600 mt-2">Here is your progress across the FresherPrep Ecosystem.</p>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 shadow-sm">
          Continue Learning
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Overall Readiness</p>
            <p className="text-2xl font-bold text-slate-900">45%</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Skills Verified</p>
            <p className="text-2xl font-bold text-slate-900">12/25</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Profile Score</p>
            <p className="text-2xl font-bold text-slate-900">82/100</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 line-clamp-none h-fit">
          <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" /> Recent Activity
          </h3>
          <div className="space-y-6">
            <div className="flex gap-4 relative">
               <div className="w-px h-full bg-slate-200 absolute left-2.5 top-0 bottom-0"></div>
               <div className="w-5 h-5 rounded-full bg-blue-500 border-4 border-white shadow-sm relative z-10"></div>
               <div>
                 <p className="font-medium text-slate-900">Completed React Skill Assessment</p>
                 <p className="text-sm text-slate-500 mt-1">2 days ago</p>
               </div>
            </div>
            <div className="flex gap-4 relative">
               <div className="w-px h-full bg-slate-200 absolute left-2.5 top-0 bottom-0"></div>
               <div className="w-5 h-5 rounded-full bg-emerald-500 border-4 border-white shadow-sm relative z-10"></div>
               <div>
                 <p className="font-medium text-slate-900">Uploaded Resume V2</p>
                 <p className="text-sm text-slate-500 mt-1">4 days ago • Scored 85/100</p>
               </div>
            </div>
            <div className="flex gap-4 relative">
               <div className="w-5 h-5 rounded-full bg-slate-300 border-4 border-white shadow-sm relative z-10"></div>
               <div>
                 <p className="font-medium text-slate-900">Account Created</p>
                 <p className="text-sm text-slate-500 mt-1">1 week ago</p>
               </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 max-h-[500px]">
          <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
             <FileText className="w-5 h-5 text-blue-600" /> Recommended Action Items
          </h3>
          <ul className="space-y-4">
             <li className="p-4 border border-blue-100 bg-blue-50/50 rounded-xl flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 font-bold text-sm">1</div>
                <div>
                  <h4 className="font-semibold text-slate-900 text-sm">Update your GitHub README</h4>
                  <p className="text-sm text-slate-600 mt-1">Your profile score is held back by an empty README. Use the GitHub Optimizer tool.</p>
                </div>
             </li>
             <li className="p-4 border border-rose-100 bg-rose-50/50 rounded-xl flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0 font-bold text-sm">2</div>
                <div>
                  <h4 className="font-semibold text-slate-900 text-sm">Address System Design gaps</h4>
                  <p className="text-sm text-slate-600 mt-1">Based on your assessment, review the 'System Design Basics' course in Content Vault.</p>
                </div>
             </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
