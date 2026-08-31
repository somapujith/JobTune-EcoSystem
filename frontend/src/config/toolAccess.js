// Maps tool names to required plan tier
// Tool -> Required Plan (all plans >= tier have access)
// Mapping mirrors the official JobTube Subscription Plans PDF exactly.

export const TOOL_ACCESS = {
  // Learn & Build tier (₹199/month)
  'Skill Assessment': 'Learn & Build',
  'Career Roadmap': 'Learn & Build',
  'Learning Hub': 'Learn & Build',
  'Project Builder': 'Learn & Build',
  'Portfolio Builder': 'Learn & Build',

  // Tune & Polish tier (₹299/month) — includes everything above, plus:
  'Resume Optimizer': 'Tune & Polish',
  'ATS Checker': 'Tune & Polish',
  'LinkedIn Optimizer': 'Tune & Polish',
  'GitHub Optimizer': 'Tune & Polish',
  'Recruiter Visibility Checker': 'Tune & Polish',
  'Resume Consistency Checker': 'Tune & Polish',
  'Achievement Enhancer': 'Tune & Polish',
  'Application Assistant': 'Tune & Polish',

  // Zero To Hero tier (₹499/month) — includes everything above, plus:
  'Interview Prep': 'Zero to Hero',
  'Job Analytics': 'Zero to Hero',
  'Career Readiness Dashboard': 'Zero to Hero',

  // Tools not explicitly named in the pricing PDF — kept at their closest
  // existing tier so they remain reachable rather than orphaned.
  'Job Discovery': 'Tune & Polish',
  'Job Tracker': 'Zero to Hero',
  'Job Fit Analysis': 'Zero to Hero',
  'Evidence Dashboard': 'Zero to Hero',
  'Job Analyzer': 'Zero to Hero',
};

// Route -> Tool name mapping
export const ROUTE_TOOLS = {
  '/skills': 'Skill Assessment',
  '/career': 'Career Roadmap',
  '/learning': 'Learning Hub',
  '/learning-path': 'Learning Hub',
  '/learning-path/:subject': 'Learning Hub',
  '/learning-path/:subject/:tier/:slug': 'Learning Hub',
  '/projects': 'Project Builder',
  '/portfolio': 'Portfolio Builder',
  '/resume': 'Resume Optimizer',
  '/resume/build': 'Resume Optimizer',
  '/resume/history': 'Resume Optimizer',
  '/resume/compare': 'Resume Optimizer',
  '/resume/send': 'Resume Optimizer',
  '/ats-checker': 'ATS Checker',
  '/linkedin': 'LinkedIn Optimizer',
  '/github': 'GitHub Optimizer',
  '/recruiter-visibility': 'Recruiter Visibility Checker',
  '/resume-consistency': 'Resume Consistency Checker',
  '/achievement-enhancer': 'Achievement Enhancer',
  '/application-assistant': 'Application Assistant',
  '/cover-letter': 'Application Assistant',
  '/interview': 'Interview Prep',
  '/job-analytics': 'Job Analytics',
  '/career-readiness': 'Career Readiness Dashboard',
  '/jobmatch': 'Job Discovery',
  '/discover': 'Job Discovery',
  '/jobs': 'Job Tracker',
  '/preparation': 'Learning Hub',
  '/preparation/zero-to-hero': 'Learning Hub',
  '/preparation/tune-and-polish': 'Learning Hub',
  '/preparation/learn-and-build': 'Learning Hub',
  '/evidence': 'Evidence Dashboard',
  '/job-fit': 'Job Fit Analysis',
  '/job-analyzer': 'Job Analyzer',
};

export const PLAN_TIERS = {
  'Learn & Build': 1,
  'Tune & Polish': 2,
  'Zero to Hero': 3,
};

export function getToolForRoute(path) {
  return ROUTE_TOOLS[path] || null;
}

export function getRequiredPlan(toolName) {
  return TOOL_ACCESS[toolName] || 'Learn & Build';
}

export function getPlanTier(planName) {
  return PLAN_TIERS[planName] || 0;
}
