import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import PlanGate from './components/PlanGate';
import { getToolForRoute, getRequiredPlan } from './config/toolAccess';
// SSR-rendered pages (/, /blog, /login) must stay statically imported —
// entry-server.jsx uses renderToString, which cannot resolve lazy components.
import Home from './pages/Home';
import Login from './pages/Login';
import Blog from './pages/Blog';
import useAuthStore from './store/useAuthStore';
import useSubscriptionStore from './store/useSubscriptionStore';
import SessionBlocked from './components/SessionBlocked';
import { isBrowser } from './lib/browser';

// CSR-only routes: lazy-loaded so they land in their own chunks.
const PaymentConfirm = lazy(() => import('./pages/PaymentConfirm'));
const PlanSettings = lazy(() => import('./pages/PlanSettings'));
const SkillAssessment = lazy(() => import('./pages/SkillAssessment'));
const ResumeOptimizer = lazy(() => import('./pages/ResumeOptimizer'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ContentVault = lazy(() => import('./pages/ContentVault'));
const LinkedInOptimizer = lazy(() => import('./pages/LinkedInOptimizer'));
const GitHubOptimizer = lazy(() => import('./pages/GitHubOptimizer'));
const PortfolioBuilder = lazy(() => import('./pages/PortfolioBuilder'));
const ProjectIdeas = lazy(() => import('./pages/ProjectIdeas'));
const MockInterview = lazy(() => import('./pages/MockInterview'));
const JobMatcher = lazy(() => import('./pages/JobMatcher'));
const JobTracker = lazy(() => import('./pages/JobTracker'));
const JobDiscovery = lazy(() => import('./pages/JobDiscovery'));
const ResumeBuilder = lazy(() => import('./pages/ResumeBuilder'));
const ResumeHistory = lazy(() => import('./pages/ResumeHistory'));
const ResumeComparison = lazy(() => import('./pages/ResumeComparison'));
const ResumeSend = lazy(() => import('./pages/ResumeSend'));
const CareerRoadmap = lazy(() => import('./pages/CareerRoadmap'));
const ATSChecker = lazy(() => import('./pages/ATSCheckerV2'));
const JobAnalyzer = lazy(() => import('./pages/JobAnalyzer'));
const CoverLetterGenerator = lazy(() => import('./pages/CoverLetterGenerator'));
const EvidenceDashboard = lazy(() => import('./pages/EvidenceDashboard'));
const JobFitAnalysis = lazy(() => import('./pages/JobFitAnalysis'));
const JobPreparation = lazy(() => import('./pages/JobPreparation'));
const TuneAndPolishTrack = lazy(() => import('./pages/TuneAndPolishTrack'));
const ZeroToHeroTrack = lazy(() => import('./pages/ZeroToHeroTrack'));
const LearnAndBuildTrack = lazy(() => import('./pages/LearnAndBuildTrack'));
const RecruiterVisibility = lazy(() => import('./pages/RecruiterVisibility'));
const ResumeConsistency = lazy(() => import('./pages/ResumeConsistency'));
const AchievementEnhancer = lazy(() => import('./pages/AchievementEnhancer'));
const AITutor = lazy(() => import('./pages/AITutor'));
const AIDoubtSolver = lazy(() => import('./pages/AIDoubtSolver'));
const CourseLibrary = lazy(() => import('./pages/CourseLibrary'));
const LearningPaths = lazy(() => import('./pages/LearningPaths'));
const AINotesGenerator = lazy(() => import('./pages/AINotesGenerator'));
const AIFlashcards = lazy(() => import('./pages/AIFlashcards'));
const AIQuizGenerator = lazy(() => import('./pages/AIQuizGenerator'));
const Community = lazy(() => import('./pages/Community'));
const CommunicationSkills = lazy(() => import('./pages/CommunicationSkills'));
const CodingPractice = lazy(() => import('./pages/CodingPractice'));
const Assessments = lazy(() => import('./pages/Assessments'));
const AIProjectBuilder = lazy(() => import('./pages/AIProjectBuilder'));
const ProjectWorkspace = lazy(() => import('./pages/ProjectWorkspace'));
const AICareerCoach = lazy(() => import('./pages/AICareerCoach'));
const AICodeReviewer = lazy(() => import('./pages/AICodeReviewer'));
const UniversityDashboard = lazy(() => import('./pages/UniversityDashboard'));
const FacultyPanel = lazy(() => import('./pages/FacultyPanel'));
const RecruiterPortal = lazy(() => import('./pages/RecruiterPortal'));
const ComingSoon = lazy(() => import('./pages/ComingSoon'));
const Survey = lazy(() => import('./pages/Survey'));
const CareerDiscovery = lazy(() => import('./pages/CareerDiscovery'));
const CareerPreview = lazy(() => import('./pages/CareerPreview'));
const SubscriptionGate = lazy(() => import('./pages/SubscriptionGate'));

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
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const onboardingComplete = useSubscriptionStore(s => s.onboardingComplete);
  const onboardingChecked = useSubscriptionStore(s => s.onboardingChecked);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requireOnboarding && !onboardingChecked) return <OnboardingCheckLoader />;
  if (requireOnboarding && !onboardingComplete) return <Navigate to="/survey" replace />;

  return children;
}

// Survey-chain guard: only authenticated users who have NOT completed onboarding
// may enter; completed users are bounced to the dashboard.
function SurveyRoute({ children }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const onboardingComplete = useSubscriptionStore(s => s.onboardingComplete);
  const onboardingChecked = useSubscriptionStore(s => s.onboardingChecked);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!onboardingChecked) return <OnboardingCheckLoader />;
  if (onboardingComplete) return <Navigate to="/dashboard" replace />;

  return children;
}

function ProtectedToolRoute({ children, toolPath }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const onboardingComplete = useSubscriptionStore(s => s.onboardingComplete);
  const onboardingChecked = useSubscriptionStore(s => s.onboardingChecked);

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
  const checkAuth = useAuthStore(s => s.checkAuth);
  const isLoading = useAuthStore(s => s.isLoading);
  const sessionBlocked = useAuthStore(s => s.sessionBlocked);
  const checkOnboarded = useSubscriptionStore(s => s.checkOnboarded);
  const getUserPlan = useSubscriptionStore(s => s.getUserPlan);

  useEffect(() => {
    if (!isBrowser) return;
    // Verify session, then fire onboarding check + plan fetch concurrently
    // (both depend only on auth; a missing plan resolves to null harmlessly).
    checkAuth().then(() => {
      const isAuthed = useAuthStore.getState().isAuthenticated;
      if (!isAuthed) return;
      checkOnboarded();
      getUserPlan();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (sessionBlocked) return <SessionBlocked />;

  // During SSR isLoading is false (no browser, no token check needed).
  // On the client, isLoading starts true, so we show the spinner only after
  // hydration (isBrowser guard) to avoid a hydration mismatch.
  if (isBrowser && isLoading) return <AppLoader />;

  return (
    <ErrorBoundary>
      <Suspense fallback={<AppLoader />}>
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
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
