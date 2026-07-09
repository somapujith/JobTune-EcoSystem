import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import PlanGate from './components/PlanGate';
import { getToolForRoute, getRequiredPlan } from './config/toolAccess';
import Home from './pages/Home';
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
import AITutor from './pages/AITutor';
import AIDoubtSolver from './pages/AIDoubtSolver';
import CourseLibrary from './pages/CourseLibrary';
import LearningPaths from './pages/LearningPaths';
import AINotesGenerator from './pages/AINotesGenerator';
import AIFlashcards from './pages/AIFlashcards';
import AIQuizGenerator from './pages/AIQuizGenerator';
import Community from './pages/Community';
import CommunicationSkills from './pages/CommunicationSkills';
import CodingPractice from './pages/CodingPractice';
import Assessments from './pages/Assessments';
import AIProjectBuilder from './pages/AIProjectBuilder';
import ProjectWorkspace from './pages/ProjectWorkspace';
import AICareerCoach from './pages/AICareerCoach';
import AICodeReviewer from './pages/AICodeReviewer';
import UniversityDashboard from './pages/UniversityDashboard';
import FacultyPanel from './pages/FacultyPanel';
import RecruiterPortal from './pages/RecruiterPortal';
import ComingSoon from './pages/ComingSoon';
import Survey from './pages/Survey';
import CareerDiscovery from './pages/CareerDiscovery';
import CareerPreview from './pages/CareerPreview';
import SubscriptionGate from './pages/SubscriptionGate';
import useAuthStore from './store/useAuthStore';
import useSubscriptionStore from './store/useSubscriptionStore';
import SessionBlocked from './components/SessionBlocked';
import { isBrowser } from './lib/browser';

// Minimal inline loader shown while the very first onboarding check is in flight
function OnboardingCheckLoader() {
  return (
    <div className="w-full min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mb-3" />
        <p className="text-slate-500 text-sm font-medium">Loading your tools...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, requireOnboarding = true }) {
  const { isAuthenticated } = useAuthStore();
  const { onboardingComplete, onboardingChecked } = useSubscriptionStore();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requireOnboarding && !onboardingChecked) return <OnboardingCheckLoader />;
  if (requireOnboarding && !onboardingComplete) return <Navigate to="/survey" replace />;

  return children;
}

// Survey-chain guard: only authenticated users who have NOT completed onboarding
// may enter; completed users are bounced to the dashboard.
function SurveyRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  const { onboardingComplete, onboardingChecked } = useSubscriptionStore();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!onboardingChecked) return <OnboardingCheckLoader />;
  if (onboardingComplete) return <Navigate to="/dashboard" replace />;

  return children;
}

function ProtectedToolRoute({ children, toolPath }) {
  const { isAuthenticated } = useAuthStore();
  const { onboardingComplete, onboardingChecked } = useSubscriptionStore();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (!onboardingChecked) return <OnboardingCheckLoader />;

  if (!onboardingComplete) return <Navigate to="/survey" replace />;

  const toolName = getToolForRoute(toolPath);
  if (!toolName) return children;

  const requiredPlan = getRequiredPlan(toolName);
  return (
    <PlanGate toolName={toolName} requiredPlan={requiredPlan}>
      {children}
    </PlanGate>
  );
}

// Inline loading spinner shown only during the initial auth check on page load
function AppLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="text-center">
        <div className="inline-block w-10 h-10 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mb-4" />
        <p className="text-slate-600 font-semibold">Loading...</p>
      </div>
    </div>
  );
}

function App() {
  const { checkAuth, isLoading, sessionBlocked } = useAuthStore();
  const { checkOnboarded, getUserPlan } = useSubscriptionStore();

  useEffect(() => {
    if (!isBrowser) return;
    // Sequential: verify session → check onboarding status → fetch plan once
    checkAuth().then(async () => {
      const isAuthed = useAuthStore.getState().isAuthenticated;
      if (!isAuthed) return;
      const onboarded = await checkOnboarded();
      if (onboarded) getUserPlan();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (sessionBlocked) return <SessionBlocked />;

  // During SSR isLoading is false (no browser, no token check needed).
  // On the client, isLoading starts true, so we show the spinner only after
  // hydration (isBrowser guard) to avoid a hydration mismatch.
  if (isBrowser && isLoading) return <AppLoader />;

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
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
          <Route path="projects" element={<ProtectedToolRoute toolPath="/projects"><ProjectIdeas /></ProtectedToolRoute>} />
          <Route path="blog" element={<Blog />} />
          <Route path="dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="dashboard/settings/plans" element={<ProtectedRoute requireOnboarding={false}><PlanSettings /></ProtectedRoute>} />
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
          <Route path="ai-tutor" element={<ProtectedToolRoute toolPath="/ai-tutor"><AITutor /></ProtectedToolRoute>} />
          <Route path="doubt-solver" element={<ProtectedToolRoute toolPath="/doubt-solver"><AIDoubtSolver /></ProtectedToolRoute>} />
          <Route path="courses" element={<ProtectedToolRoute toolPath="/courses"><CourseLibrary /></ProtectedToolRoute>} />
          <Route path="learning-paths" element={<ProtectedToolRoute toolPath="/learning-paths"><LearningPaths /></ProtectedToolRoute>} />
          <Route path="notes" element={<ProtectedToolRoute toolPath="/notes"><AINotesGenerator /></ProtectedToolRoute>} />
          <Route path="flashcards" element={<ProtectedToolRoute toolPath="/flashcards"><AIFlashcards /></ProtectedToolRoute>} />
          <Route path="quiz" element={<ProtectedToolRoute toolPath="/quiz"><AIQuizGenerator /></ProtectedToolRoute>} />
          <Route path="community" element={<ProtectedToolRoute toolPath="/community"><Community /></ProtectedToolRoute>} />
          <Route path="communication-skills" element={<ProtectedToolRoute toolPath="/communication-skills"><CommunicationSkills /></ProtectedToolRoute>} />
          <Route path="coding-practice" element={<ProtectedToolRoute toolPath="/coding-practice"><CodingPractice /></ProtectedToolRoute>} />
          <Route path="assessments" element={<ProtectedToolRoute toolPath="/assessments"><Assessments /></ProtectedToolRoute>} />
          <Route path="project-builder" element={<ProtectedToolRoute toolPath="/project-builder"><AIProjectBuilder /></ProtectedToolRoute>} />
          <Route path="project-workspace" element={<ProtectedToolRoute toolPath="/project-workspace"><ProjectWorkspace /></ProtectedToolRoute>} />
          <Route path="career-coach" element={<ProtectedToolRoute toolPath="/career-coach"><AICareerCoach /></ProtectedToolRoute>} />
          <Route path="code-reviewer" element={<ProtectedToolRoute toolPath="/code-reviewer"><AICodeReviewer /></ProtectedToolRoute>} />
          <Route path="university-dashboard" element={<ProtectedToolRoute toolPath="/university-dashboard"><UniversityDashboard /></ProtectedToolRoute>} />
          <Route path="faculty-panel" element={<ProtectedToolRoute toolPath="/faculty-panel"><FacultyPanel /></ProtectedToolRoute>} />
          <Route path="recruiter-portal" element={<ProtectedToolRoute toolPath="/recruiter-portal"><RecruiterPortal /></ProtectedToolRoute>} />
          <Route path="career-readiness" element={<ProtectedToolRoute toolPath="/career-readiness"><ComingSoon toolName="Career Readiness Dashboard" description="A unified career score with progress tracking and improvement recommendations across your whole journey. Launching soon." /></ProtectedToolRoute>} />
        </Route>
        <Route path="/login" element={<Login />} />
        <Route path="/survey" element={<SurveyRoute><Survey /></SurveyRoute>} />
        <Route path="/career-discovery" element={<SurveyRoute><CareerDiscovery /></SurveyRoute>} />
        <Route path="/career-preview" element={<SurveyRoute><CareerPreview /></SurveyRoute>} />
        <Route path="/subscription-gate" element={<SurveyRoute><SubscriptionGate /></SurveyRoute>} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
