// Maps tool names to required plan tier
// Tool -> Required Plan (all plans >= tier have access)

export const TOOL_ACCESS = {
  // Learn & Build tier (free/entry)
  'Learning Resources': 'Learn & Build',
  'Project Ideas': 'Learn & Build',
  'Skill Assessment': 'Learn & Build',

  // Tune & Polish tier (mid)
  'Resume Optimizer': 'Tune & Polish',
  'LinkedIn Optimizer': 'Tune & Polish',
  'GitHub Optimizer': 'Tune & Polish',
  'Portfolio Builder': 'Tune & Polish',
  'Job Discovery': 'Tune & Polish',

  // Zero to Hero tier (premium)
  'Interview Prep': 'Zero to Hero',
  'Job Tracker': 'Zero to Hero',
  'Career Roadmap': 'Zero to Hero',
  'Cover Letter Generator': 'Zero to Hero',
  'ATS Checker': 'Zero to Hero',
  'Mock Interview': 'Zero to Hero',
  'Job Fit Analysis': 'Zero to Hero',
  'Evidence Dashboard': 'Zero to Hero',
};

// Route -> Tool name mapping
export const ROUTE_TOOLS = {
  '/skills': 'Skill Assessment',
  '/resume': 'Resume Optimizer',
  '/resume/build': 'Resume Optimizer',
  '/resume/history': 'Resume Optimizer',
  '/resume/compare': 'Resume Optimizer',
  '/resume/send': 'Resume Optimizer',
  '/linkedin': 'LinkedIn Optimizer',
  '/github': 'GitHub Optimizer',
  '/portfolio': 'Portfolio Builder',
  '/learning': 'Learning Resources',
  '/projects': 'Project Ideas',
  '/interview': 'Interview Prep',
  '/jobmatch': 'Job Discovery',
  '/discover': 'Job Discovery',
  '/jobs': 'Job Tracker',
  '/career': 'Career Roadmap',
  '/preparation': 'Learning Resources',
  '/evidence': 'Evidence Dashboard',
  '/job-fit': 'Job Fit Analysis',
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
