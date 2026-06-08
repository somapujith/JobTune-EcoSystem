import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import PlanGate from './components/PlanGate';
import { getToolForRoute, getRequiredPlan } from './config/toolAccess';
import Home from './pages/Home';
import Onboarding from './pages/Onboarding';
import PlanSettings from './pages/PlanSettings';
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
import JobPreparation from './pages/JobPreparation';
import TuneAndPolishTrack from './pages/TuneAndPolishTrack';
import ZeroToHeroTrack from './pages/ZeroToHeroTrack';
import LearnAndBuildTrack from './pages/LearnAndBuildTrack';
import useAuthStore from './store/useAuthStore';

function ProtectedRoute({ children, requireOnboarding = false }) {
  const { isAuthenticated, hasCompletedOnboarding } = useAuthStore();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requireOnboarding && !hasCompletedOnboarding) return <Navigate to="/onboarding" replace />;

  return children;
}

function ProtectedToolRoute({ children, toolPath }) {
  const { isAuthenticated, hasCompletedOnboarding } = useAuthStore();
  const toolName = getToolForRoute(toolPath);
  const requiredPlan = toolName ? getRequiredPlan(toolName) : 'Learn & Build';

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!hasCompletedOnboarding) return <Navigate to="/onboarding" replace />;

  if (!toolName) return children; // No plan restriction

  return (
    <PlanGate toolName={toolName} requiredPlan={requiredPlan}>
      {children}
    </PlanGate>
  );
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
          <Route path="skills" element={<ProtectedToolRoute toolPath="/skills"><SkillAssessment /></ProtectedToolRoute>} />
          <Route path="resume" element={<ProtectedToolRoute toolPath="/resume"><ResumeOptimizer /></ProtectedToolRoute>} />
          <Route path="resume/build" element={<ProtectedToolRoute toolPath="/resume/build"><ResumeBuilder /></ProtectedToolRoute>} />
          <Route path="resume/history" element={<ProtectedToolRoute toolPath="/resume/history"><ResumeHistory /></ProtectedToolRoute>} />
          <Route path="resume/compare" element={<ProtectedToolRoute toolPath="/resume/compare"><ResumeComparison /></ProtectedToolRoute>} />
          <Route path="resume/send" element={<ProtectedToolRoute toolPath="/resume/send"><ResumeSend /></ProtectedToolRoute>} />
          <Route path="linkedin" element={<ProtectedToolRoute toolPath="/linkedin"><LinkedInOptimizer /></ProtectedToolRoute>} />
          <Route path="github" element={<ProtectedToolRoute toolPath="/github"><GitHubOptimizer /></ProtectedToolRoute>} />
          <Route path="portfolio" element={<ProtectedToolRoute toolPath="/portfolio"><PortfolioBuilder /></ProtectedToolRoute>} />
          <Route path="preparation" element={<ProtectedToolRoute toolPath="/preparation"><JobPreparation /></ProtectedToolRoute>} />
          <Route path="preparation/tune-and-polish" element={<ProtectedToolRoute toolPath="/preparation"><TuneAndPolishTrack /></ProtectedToolRoute>} />
          <Route path="preparation/zero-to-hero" element={<ProtectedToolRoute toolPath="/preparation"><ZeroToHeroTrack /></ProtectedToolRoute>} />
          <Route path="preparation/learn-and-build" element={<ProtectedToolRoute toolPath="/preparation"><LearnAndBuildTrack /></ProtectedToolRoute>} />
          <Route path="learning" element={<ProtectedToolRoute toolPath="/learning"><ContentVault /></ProtectedToolRoute>} />
          <Route path="projects" element={<ProtectedToolRoute toolPath="/projects"><ProjectIdeas /></ProtectedToolRoute>} />
          <Route path="blog" element={<Blog />} />
          <Route
            path="dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="dashboard/settings/plans"
            element={
              <ProtectedRoute>
                <PlanSettings />
              </ProtectedRoute>
            }
          />
          <Route path="interview" element={<ProtectedToolRoute toolPath="/interview"><MockInterview /></ProtectedToolRoute>} />
          <Route path="jobmatch" element={<ProtectedToolRoute toolPath="/jobmatch"><JobMatcher /></ProtectedToolRoute>} />
          <Route path="discover" element={<ProtectedToolRoute toolPath="/discover"><JobDiscovery /></ProtectedToolRoute>} />
          <Route path="jobs" element={<ProtectedToolRoute toolPath="/jobs"><JobTracker /></ProtectedToolRoute>} />
          <Route path="career" element={<ProtectedToolRoute toolPath="/career"><CareerRoadmap /></ProtectedToolRoute>} />
          <Route path="job-analyzer" element={<ProtectedToolRoute toolPath="/career"><JobAnalyzer /></ProtectedToolRoute>} />
          <Route path="ats-checker" element={<ProtectedToolRoute toolPath="/career"><ATSChecker /></ProtectedToolRoute>} />
          <Route path="job-fit" element={<ProtectedToolRoute toolPath="/job-fit"><JobFitAnalysis /></ProtectedToolRoute>} />
          <Route path="cover-letter" element={<ProtectedToolRoute toolPath="/cover-letter"><CoverLetterGenerator /></ProtectedToolRoute>} />
          <Route
            path="evidence"
            element={
              <ProtectedRoute>
                <ProtectedToolRoute toolPath="/evidence"><EvidenceDashboard /></ProtectedToolRoute>
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
