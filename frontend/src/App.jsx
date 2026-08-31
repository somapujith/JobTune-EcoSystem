import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import PlanGate from './components/PlanGate';
import { getToolForRoute, getRequiredPlan } from './config/toolAccess';
import Home from './pages/Home';
import Onboarding from './pages/Onboarding';
import PaymentConfirm from './pages/PaymentConfirm';
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
import LearningPathSubjects from './pages/LearningPathSubjects';
import LearningPathTier from './pages/LearningPathTier';
import LearningPathTopic from './pages/LearningPathTopic';
import ATSChecker from './pages/ATSCheckerV2';
import JobAnalyzer from './pages/JobAnalyzer';
import CoverLetterGenerator from './pages/CoverLetterGenerator';
import EvidenceDashboard from './pages/EvidenceDashboard';
import JobFitAnalysis from './pages/JobFitAnalysis';
import JobPreparation from './pages/JobPreparation';
import TuneAndPolishTrack from './pages/TuneAndPolishTrack';
import ZeroToHeroTrack from './pages/ZeroToHeroTrack';
import LearnAndBuildTrack from './pages/LearnAndBuildTrack';
import RecruiterVisibility from './pages/RecruiterVisibility';
import ResumeConsistency from './pages/ResumeConsistency';
import AchievementEnhancer from './pages/AchievementEnhancer';
import ComingSoon from './pages/ComingSoon';
import useAuthStore from './store/useAuthStore';
import useSubscriptionStore from './store/useSubscriptionStore';
import SessionBlocked from './components/SessionBlocked';
import { isBrowser } from './lib/browser';

function ProtectedRoute({ children, requireOnboarding = false }) {
  const { isAuthenticated, hasCompletedOnboarding } = useAuthStore();
  const { onboardingComplete } = useSubscriptionStore();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requireOnboarding && !hasCompletedOnboarding) return <Navigate to="/onboarding" replace />;
  if (requireOnboarding && !onboardingComplete) return <Navigate to="/onboarding" replace />;

  return children;
}

function ProtectedToolRoute({ children, toolPath }) {
  const { isAuthenticated } = useAuthStore();
  const { onboardingComplete, onboardingChecked, getUserPlan } = useSubscriptionStore();

  useEffect(() => {
    if (isAuthenticated) {
      getUserPlan();
    }
  }, [isAuthenticated, getUserPlan]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (!onboardingChecked) {
    return (
      <div className="w-full min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-600 mb-4 animate-spin">
            <div className="w-8 h-8 rounded-full border-2 border-white border-t-transparent" />
          </div>
          <p className="text-slate-600 font-semibold">Loading your tools...</p>
        </div>
      </div>
    );
  }

  if (!onboardingComplete) return <Navigate to="/onboarding" replace />;

  const toolName = getToolForRoute(toolPath);
  if (!toolName) return children;

  const requiredPlan = getRequiredPlan(toolName);
  return (
    <PlanGate toolName={toolName} requiredPlan={requiredPlan}>
      {children}
    </PlanGate>
  );
}

function App() {
  const { checkAuth, isLoading, sessionBlocked } = useAuthStore();
  const { checkOnboarded } = useSubscriptionStore();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!isBrowser) return;
    checkAuth().then(() => checkOnboarded());
  }, [checkAuth, checkOnboarded]);

  if (hydrated && sessionBlocked) {
    return <SessionBlocked />;
  }

  // First client render must match SSR output exactly to avoid hydration
  // mismatches; only switch to the loading spinner after hydration completes.
  if (hydrated && isLoading) {
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
          <Route path="payment-confirm" element={<PaymentConfirm />} />
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
          <Route path="preparation/tune-and-polish" element={<ProtectedToolRoute toolPath="/preparation/tune-and-polish"><TuneAndPolishTrack /></ProtectedToolRoute>} />
          <Route path="preparation/zero-to-hero" element={<ProtectedToolRoute toolPath="/preparation/zero-to-hero"><ZeroToHeroTrack /></ProtectedToolRoute>} />
          <Route path="preparation/learn-and-build" element={<ProtectedToolRoute toolPath="/preparation/learn-and-build"><LearnAndBuildTrack /></ProtectedToolRoute>} />
          <Route path="learning" element={<ProtectedToolRoute toolPath="/learning"><ContentVault /></ProtectedToolRoute>} />
          <Route path="learning-path" element={<ProtectedToolRoute toolPath="/learning-path"><LearningPathSubjects /></ProtectedToolRoute>} />
          <Route path="learning-path/:subject" element={<ProtectedToolRoute toolPath="/learning-path/:subject"><LearningPathTier /></ProtectedToolRoute>} />
          <Route path="learning-path/:subject/:tier/:slug" element={<ProtectedToolRoute toolPath="/learning-path/:subject/:tier/:slug"><LearningPathTopic /></ProtectedToolRoute>} />
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
          <Route path="job-analyzer" element={<ProtectedToolRoute toolPath="/job-analyzer"><JobAnalyzer /></ProtectedToolRoute>} />
          <Route path="ats-checker" element={<ProtectedToolRoute toolPath="/ats-checker"><ATSChecker /></ProtectedToolRoute>} />
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
          <Route path="recruiter-visibility" element={<ProtectedToolRoute toolPath="/recruiter-visibility"><RecruiterVisibility /></ProtectedToolRoute>} />
          <Route path="resume-consistency" element={<ProtectedToolRoute toolPath="/resume-consistency"><ResumeConsistency /></ProtectedToolRoute>} />
          <Route path="achievement-enhancer" element={<ProtectedToolRoute toolPath="/achievement-enhancer"><AchievementEnhancer /></ProtectedToolRoute>} />
          <Route path="career-readiness" element={<ProtectedToolRoute toolPath="/career-readiness"><ComingSoon toolName="Career Readiness Dashboard" description="A unified career score with progress tracking and improvement recommendations across your whole journey. Launching soon." /></ProtectedToolRoute>} />
        </Route>
        <Route path="/login" element={<Login />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
