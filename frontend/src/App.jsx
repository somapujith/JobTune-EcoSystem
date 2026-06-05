import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import Home from './pages/Home';
import Onboarding from './pages/Onboarding';
import SkillAssessment from './pages/SkillAssessment';
import ResumeOptimizer from './pages/ResumeOptimizer';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import ContentVault from './pages/ContentVault';
import Blog from './pages/Blog';
import LinkedInOptimizer from './pages/LinkedInOptimizer';
import GitHubOptimizer from './pages/GitHubOptimizer';
import PortfolioBuilder from './pages/PortfolioBuilder';
import ProjectIdeas from './pages/ProjectIdeas';
import MockInterview from './pages/MockInterview';
import JobMatcher from './pages/JobMatcher';
import JobTracker from './pages/JobTracker';
import JobDiscovery from './pages/JobDiscovery';
import ResumeBuilder from './pages/ResumeBuilder';
import ResumeHistory from './pages/ResumeHistory';
import ResumeComparison from './pages/ResumeComparison';
import ResumeSend from './pages/ResumeSend';
import CareerRoadmap from './pages/CareerRoadmap';
import ATSChecker from './pages/ATSChecker';
import JobAnalyzer from './pages/JobAnalyzer';
import CoverLetterGenerator from './pages/CoverLetterGenerator';
import EvidenceDashboard from './pages/EvidenceDashboard';
import JobFitAnalysis from './pages/JobFitAnalysis';
import useAuthStore from './store/useAuthStore';

function ProtectedRoute({ children, requireOnboarding = false }) {
  const { isAuthenticated, hasCompletedOnboarding } = useAuthStore();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requireOnboarding && !hasCompletedOnboarding) return <Navigate to="/onboarding" replace />;

  return children;
}

function App() {
  const { checkAuth, isLoading } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-600 mb-4 animate-spin">
            <div className="w-8 h-8 rounded-full border-2 border-white border-t-transparent" />
          </div>
          <p className="text-slate-600 font-semibold">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="skills" element={<SkillAssessment />} />
          <Route path="resume" element={<ResumeOptimizer />} />
          <Route path="resume/build" element={<ResumeBuilder />} />
          <Route path="resume/history" element={<ResumeHistory />} />
          <Route path="resume/compare" element={<ResumeComparison />} />
          <Route path="resume/send" element={<ResumeSend />} />
          <Route path="linkedin" element={<LinkedInOptimizer />} />
          <Route path="github" element={<GitHubOptimizer />} />
          <Route path="portfolio" element={<PortfolioBuilder />} />
          <Route path="learning" element={<ContentVault />} />
          <Route path="projects" element={<ProjectIdeas />} />
          <Route path="blog" element={<Blog />} />
          <Route
            path="dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route path="interview" element={<MockInterview />} />
          <Route path="jobmatch" element={<JobMatcher />} />
          <Route path="discover" element={<JobDiscovery />} />
          <Route path="jobs" element={<JobTracker />} />
          <Route path="career" element={<CareerRoadmap />} />
          <Route path="job-analyzer" element={<JobAnalyzer />} />
          <Route path="ats-checker" element={<ATSChecker />} />
          <Route path="job-fit" element={<JobFitAnalysis />} />
          <Route path="cover-letter" element={<CoverLetterGenerator />} />
          <Route
            path="evidence"
            element={
              <ProtectedRoute>
                <EvidenceDashboard />
              </ProtectedRoute>
            }
          />
        </Route>
        <Route path="/login" element={<Login />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
