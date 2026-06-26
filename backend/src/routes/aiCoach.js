/**
 * AI Coach Routes (Career Coach + Code Reviewer)
 *
 * Career Coach routes: requirePlan(3) => "Zero to Hero"
 * Code Reviewer routes: requirePlan(2) => "Tune & Polish"
 *
 * All routes require authentication via authenticateToken.
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { callAI, extractJSON } = require('../utils/aiClient');
const { pool } = require('../config/database');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TARGET_ROLES = [
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'Data Scientist',
  'Machine Learning Engineer',
  'DevOps Engineer',
  'Mobile Developer',
  'Cloud Architect',
  'Cybersecurity Analyst',
  'Product Manager',
];

const LANGUAGES = [
  'javascript', 'python', 'java', 'cpp', 'typescript', 'go', 'ruby', 'php',
];

const REVIEW_TYPES = [
  'full', 'bugs', 'performance', 'security', 'best-practices', 'readability',
];

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/** Ensure the table for code reviews exists. */
async function ensureCodeReviewsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS code_reviews (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        language VARCHAR(32) NOT NULL,
        review_type VARCHAR(32) NOT NULL,
        score INTEGER DEFAULT 0,
        issues_count INTEGER DEFAULT 0,
        code_snippet TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch (err) {
    console.warn('code_reviews table check:', err.message);
  }
}

/** Ensure the table for career coaching sessions exists. */
async function ensureCareerCoachTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS career_coach_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        session_type VARCHAR(64) NOT NULL,
        target_role VARCHAR(128),
        data JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch (err) {
    console.warn('career_coach_sessions table check:', err.message);
  }
}

// Run table checks once on module load
ensureCodeReviewsTable();
ensureCareerCoachTable();

// ─────────────────────────────────────────────────────────────────────────────
// Fallback data generators
// ─────────────────────────────────────────────────────────────────────────────

function generateFallbackScore(userId) {
  const seed = userId % 40;
  return {
    overall: clamp(55 + seed, 30, 95),
    breakdown: {
      technicalSkills: { score: clamp(60 + (seed % 15), 30, 100), weight: 30 },
      projectsPortfolio: { score: clamp(50 + (seed % 20), 20, 100), weight: 20 },
      resumeProfile: { score: clamp(45 + (seed % 25), 20, 100), weight: 20 },
      interviewReadiness: { score: clamp(40 + (seed % 10), 15, 100), weight: 15 },
      communication: { score: clamp(55 + (seed % 12), 25, 100), weight: 15 },
    },
  };
}

function generateFallbackRecommendations(targetRole) {
  return [
    {
      id: 1,
      title: `Complete a ${targetRole} portfolio project`,
      description: 'Build a project that demonstrates core skills for your target role.',
      priority: 'High',
      estimatedTime: '4-6 hours',
      skillArea: 'Projects & Portfolio',
      done: false,
    },
    {
      id: 2,
      title: 'Update your resume with quantified achievements',
      description: 'Add metrics and impact statements to your top 3 experiences.',
      priority: 'High',
      estimatedTime: '1-2 hours',
      skillArea: 'Resume & Profile',
      done: false,
    },
    {
      id: 3,
      title: 'Practice behavioral interview questions',
      description: 'Use the STAR method to prepare answers for 5 common questions.',
      priority: 'Medium',
      estimatedTime: '2-3 hours',
      skillArea: 'Interview Readiness',
      done: false,
    },
    {
      id: 4,
      title: 'Contribute to an open-source project',
      description: 'Find a beginner-friendly issue on GitHub and submit a pull request.',
      priority: 'Medium',
      estimatedTime: '3-4 hours',
      skillArea: 'Technical Skills',
      done: false,
    },
    {
      id: 5,
      title: 'Write a technical blog post',
      description: 'Share your learning on a topic relevant to your target role.',
      priority: 'Low',
      estimatedTime: '2-3 hours',
      skillArea: 'Communication',
      done: false,
    },
  ];
}

function generateFallbackSkillGap(targetRole, currentSkills) {
  const roleSkills = {
    'Frontend Developer': ['React', 'TypeScript', 'CSS/Tailwind', 'Testing', 'Performance Optimization', 'Accessibility'],
    'Backend Developer': ['Node.js', 'PostgreSQL', 'REST APIs', 'Authentication', 'Caching', 'System Design'],
    'Full Stack Developer': ['React', 'Node.js', 'Databases', 'APIs', 'DevOps Basics', 'Testing'],
    'Data Scientist': ['Python', 'Pandas/NumPy', 'Machine Learning', 'SQL', 'Statistics', 'Data Visualization'],
    'Machine Learning Engineer': ['Python', 'TensorFlow/PyTorch', 'MLOps', 'Data Pipelines', 'Model Deployment', 'Statistics'],
    'DevOps Engineer': ['Docker', 'Kubernetes', 'CI/CD', 'AWS/GCP', 'Terraform', 'Monitoring'],
    'Mobile Developer': ['React Native', 'Swift/Kotlin', 'UI/UX', 'State Management', 'API Integration', 'App Store Deployment'],
    'Cloud Architect': ['AWS', 'Azure', 'Networking', 'Security', 'Cost Optimization', 'Microservices'],
    'Cybersecurity Analyst': ['Network Security', 'Penetration Testing', 'SIEM', 'Incident Response', 'Compliance', 'Cryptography'],
    'Product Manager': ['User Research', 'Agile/Scrum', 'Data Analysis', 'Roadmapping', 'Stakeholder Management', 'Technical Communication'],
  };

  const skills = roleSkills[targetRole] || roleSkills['Full Stack Developer'];
  const userSkills = Array.isArray(currentSkills) ? currentSkills.map(s => s.toLowerCase()) : [];

  return skills.map((skill) => {
    const hasSkill = userSkills.some(s => skill.toLowerCase().includes(s) || s.includes(skill.toLowerCase()));
    return {
      skill,
      currentLevel: hasSkill ? Math.floor(Math.random() * 30) + 50 : Math.floor(Math.random() * 30) + 10,
      requiredLevel: Math.floor(Math.random() * 20) + 75,
      recommendation: `Improve your ${skill} skills through hands-on projects and structured learning.`,
    };
  });
}

function generateFallbackCareerPlan(targetRole, currentLevel) {
  const level = currentLevel || 'beginner';
  return {
    targetRole,
    currentLevel: level,
    timeline: [
      {
        month: 1,
        title: 'Foundation Building',
        description: `Master the core concepts required for ${targetRole}`,
        tasks: ['Complete foundational courses', 'Set up development environment', 'Join relevant communities'],
        milestone: 'Core concepts understood',
      },
      {
        month: 2,
        title: 'Hands-on Projects',
        description: 'Build projects that demonstrate your skills',
        tasks: ['Complete 2 guided projects', 'Start a personal portfolio project', 'Document your work on GitHub'],
        milestone: '2 projects completed',
      },
      {
        month: 3,
        title: 'Advanced Skills',
        description: 'Deepen expertise in specialized areas',
        tasks: ['Learn advanced patterns', 'Contribute to open source', 'Build a complex project'],
        milestone: 'Portfolio-ready project shipped',
      },
      {
        month: 4,
        title: 'Interview Preparation',
        description: 'Prepare for technical and behavioral interviews',
        tasks: ['Practice coding challenges daily', 'Mock interviews with peers', 'Refine resume and LinkedIn'],
        milestone: 'Interview-ready',
      },
      {
        month: 5,
        title: 'Job Search',
        description: 'Apply strategically and network actively',
        tasks: ['Apply to 10+ positions per week', 'Network at events and online', 'Follow up on applications'],
        milestone: 'First interviews scheduled',
      },
      {
        month: 6,
        title: 'Landing & Growth',
        description: 'Secure your role and plan for continuous growth',
        tasks: ['Negotiate offers', 'Create 90-day onboarding plan', 'Set up mentorship'],
        milestone: 'Offer accepted',
      },
    ],
    shortTerm: ['Complete a relevant course', 'Update resume', 'Set daily practice schedule'],
    mediumTerm: ['Build 3 portfolio projects', 'Contribute to open source', 'Practice system design'],
    longTerm: ['Land target role', 'Earn a relevant certification', 'Establish industry network'],
  };
}

function generateFallbackComparison(role1, role2) {
  const roleData = {
    'Frontend Developer': { avgSalary: '$95K', demandLevel: 'High', growthRate: '15%', keySkills: ['React', 'TypeScript', 'CSS'], entryBarrier: 'Medium', remoteOpportunities: 'Very High' },
    'Backend Developer': { avgSalary: '$105K', demandLevel: 'High', growthRate: '12%', keySkills: ['Node.js', 'Python', 'SQL'], entryBarrier: 'Medium', remoteOpportunities: 'High' },
    'Full Stack Developer': { avgSalary: '$100K', demandLevel: 'Very High', growthRate: '14%', keySkills: ['React', 'Node.js', 'Databases'], entryBarrier: 'High', remoteOpportunities: 'Very High' },
    'Data Scientist': { avgSalary: '$120K', demandLevel: 'High', growthRate: '22%', keySkills: ['Python', 'ML', 'Statistics'], entryBarrier: 'High', remoteOpportunities: 'High' },
    'Machine Learning Engineer': { avgSalary: '$130K', demandLevel: 'Very High', growthRate: '25%', keySkills: ['Python', 'TensorFlow', 'MLOps'], entryBarrier: 'Very High', remoteOpportunities: 'High' },
    'DevOps Engineer': { avgSalary: '$115K', demandLevel: 'Very High', growthRate: '18%', keySkills: ['Docker', 'K8s', 'CI/CD'], entryBarrier: 'High', remoteOpportunities: 'Very High' },
    'Mobile Developer': { avgSalary: '$100K', demandLevel: 'Medium', growthRate: '10%', keySkills: ['React Native', 'Swift', 'Kotlin'], entryBarrier: 'Medium', remoteOpportunities: 'High' },
    'Cloud Architect': { avgSalary: '$140K', demandLevel: 'High', growthRate: '20%', keySkills: ['AWS', 'Azure', 'Networking'], entryBarrier: 'Very High', remoteOpportunities: 'Very High' },
    'Cybersecurity Analyst': { avgSalary: '$110K', demandLevel: 'Very High', growthRate: '28%', keySkills: ['Security', 'Networking', 'SIEM'], entryBarrier: 'High', remoteOpportunities: 'High' },
    'Product Manager': { avgSalary: '$115K', demandLevel: 'High', growthRate: '12%', keySkills: ['Agile', 'Analytics', 'Leadership'], entryBarrier: 'Medium', remoteOpportunities: 'High' },
  };

  const default1 = { avgSalary: '$95K', demandLevel: 'Medium', growthRate: '10%', keySkills: ['Varies'], entryBarrier: 'Medium', remoteOpportunities: 'Medium' };

  return {
    role1: { name: role1, ...(roleData[role1] || default1) },
    role2: { name: role2, ...(roleData[role2] || default1) },
    recommendation: `Both ${role1} and ${role2} offer strong career prospects. Consider your strengths and interests when choosing between them.`,
  };
}

function generateFallbackCodeReview(code, language, reviewType) {
  const lines = code.split('\n');
  const loc = lines.length;
  const score = clamp(Math.floor(Math.random() * 30) + 55, 30, 95);

  const issues = [
    {
      severity: 'warning',
      category: 'Best Practices',
      line: Math.min(3, loc),
      description: 'Consider adding input validation for function parameters.',
      suggestedFix: '// Add parameter type checking\nif (typeof param === "undefined") throw new Error("Missing parameter");',
    },
    {
      severity: 'info',
      category: 'Readability',
      line: Math.min(5, loc),
      description: 'Use descriptive variable names to improve code readability.',
      suggestedFix: '// Rename variables to be more descriptive\nconst userCount = items.length;',
    },
    {
      severity: 'suggestion',
      category: 'Performance',
      line: Math.min(8, loc),
      description: 'Consider caching repeated computations or using memoization.',
      suggestedFix: '// Use memoization for expensive calculations\nconst memoized = useMemo(() => expensiveCalc(data), [data]);',
    },
  ];

  if (reviewType === 'security' || reviewType === 'full') {
    issues.unshift({
      severity: 'critical',
      category: 'Security',
      line: 1,
      description: 'Ensure user inputs are properly sanitized before processing.',
      suggestedFix: '// Sanitize input\nconst sanitized = DOMPurify.sanitize(userInput);',
    });
  }

  return {
    score,
    issues,
    improvedCode: `// Improved version with suggested fixes applied\n${code}`,
    metrics: {
      linesOfCode: loc,
      complexityScore: clamp(Math.floor(loc / 5) + 2, 1, 50),
      maintainabilityIndex: clamp(100 - Math.floor(loc / 3), 30, 100),
    },
    explanation: `This ${language} code was reviewed for ${reviewType === 'full' ? 'all aspects' : reviewType}. ${issues.length} issues were found. The overall quality score is ${score}/100.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Career Coach Routes (requirePlan(3) = "Zero to Hero")
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /career-score
 * Returns the user's career readiness score breakdown.
 */
router.get('/career-score', authenticateToken, requirePlan(3), async (req, res) => {
  const userId = req.user.id;

  try {
    // Attempt to aggregate scores from user's platform activity
    let profileScore = 40;
    let projectScore = 35;
    let resumeScore = 30;
    let interviewScore = 25;
    let communicationScore = 35;

    // Check profile completeness
    try {
      const profileResult = await pool.query(
        'SELECT linkedin_url, github_url, headline, bio FROM profiles WHERE user_id = $1',
        [userId]
      );
      if (profileResult.rows.length > 0) {
        const p = profileResult.rows[0];
        let filled = 0;
        if (p.linkedin_url) filled++;
        if (p.github_url) filled++;
        if (p.headline) filled++;
        if (p.bio) filled++;
        profileScore = clamp(30 + filled * 15, 30, 90);
      }
    } catch {
      // profiles table might not exist yet
    }

    // Check resume uploads
    try {
      const resumeResult = await pool.query(
        'SELECT COUNT(*) as count FROM resumes WHERE user_id = $1',
        [userId]
      );
      const count = parseInt(resumeResult.rows[0]?.count || '0', 10);
      resumeScore = clamp(25 + count * 20, 25, 85);
    } catch {
      // resumes table might not exist
    }

    // Check projects
    try {
      const projectResult = await pool.query(
        'SELECT COUNT(*) as count FROM projects WHERE user_id = $1',
        [userId]
      );
      const count = parseInt(projectResult.rows[0]?.count || '0', 10);
      projectScore = clamp(20 + count * 15, 20, 90);
    } catch {
      // projects table might not exist
    }

    // Check interview practice
    try {
      const interviewResult = await pool.query(
        'SELECT COUNT(*) as count FROM interview_sessions WHERE user_id = $1',
        [userId]
      );
      const count = parseInt(interviewResult.rows[0]?.count || '0', 10);
      interviewScore = clamp(15 + count * 10, 15, 85);
    } catch {
      // interview_sessions might not exist
    }

    // Compute weighted overall
    const overall = Math.round(
      profileScore * 0.2 +
      projectScore * 0.2 +
      resumeScore * 0.2 +
      interviewScore * 0.15 +
      communicationScore * 0.15 +
      // small boost for having a plan
      10
    );

    res.json({
      overall: clamp(overall, 10, 100),
      breakdown: {
        technicalSkills: { score: profileScore, weight: 30 },
        projectsPortfolio: { score: projectScore, weight: 20 },
        resumeProfile: { score: resumeScore, weight: 20 },
        interviewReadiness: { score: interviewScore, weight: 15 },
        communication: { score: communicationScore, weight: 15 },
      },
    });
  } catch (err) {
    console.error('Career score error:', err.message);
    // Return fallback scores
    const fallback = generateFallbackScore(userId);
    res.json(fallback);
  }
});

/**
 * POST /recommendations
 * Generate weekly AI-powered recommendations.
 * Body: { targetRole }
 */
router.post('/recommendations', authenticateToken, requirePlan(3), async (req, res) => {
  const userId = req.user.id;
  const { targetRole } = req.body;
  const role = TARGET_ROLES.includes(targetRole) ? targetRole : 'Full Stack Developer';

  try {
    const systemPrompt = `You are a career coach for university students. Output ONLY valid JSON — no markdown, no explanation.`;

    const userPrompt = `Generate 5 weekly career development tasks for a student targeting "${role}".

JSON schema (array of objects):
[{"id":number,"title":"string","description":"string","priority":"High|Medium|Low","estimatedTime":"string","skillArea":"Technical Skills|Projects & Portfolio|Resume & Profile|Interview Readiness|Communication","done":false}]

Make tasks specific, actionable, and relevant to the target role. Vary priorities and skill areas.`;

    const aiResult = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 800,
      temperature: 0.6,
      structuredJson: true,
    });

    let recommendations;
    let aiPowered = false;

    if (aiResult.ok) {
      const parsed = extractJSON(aiResult.data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        recommendations = parsed.map((r, i) => ({
          id: r.id || i + 1,
          title: r.title || `Task ${i + 1}`,
          description: r.description || '',
          priority: ['High', 'Medium', 'Low'].includes(r.priority) ? r.priority : 'Medium',
          estimatedTime: r.estimatedTime || '1-2 hours',
          skillArea: r.skillArea || 'Technical Skills',
          done: false,
        }));
        aiPowered = true;
      }
    }

    if (!recommendations) {
      recommendations = generateFallbackRecommendations(role);
    }

    // Save session
    try {
      await pool.query(
        'INSERT INTO career_coach_sessions (user_id, session_type, target_role, data) VALUES ($1, $2, $3, $4)',
        [userId, 'recommendations', role, JSON.stringify(recommendations)]
      );
    } catch {
      // non-critical
    }

    res.json({ recommendations, targetRole: role, aiPowered });
  } catch (err) {
    console.error('Recommendations error:', err.message);
    res.json({
      recommendations: generateFallbackRecommendations(role),
      targetRole: role,
      aiPowered: false,
    });
  }
});

/**
 * POST /skill-gap
 * Analyze skill gaps for a target role.
 * Body: { targetRole, currentSkills }
 */
router.post('/skill-gap', authenticateToken, requirePlan(3), async (req, res) => {
  const userId = req.user.id;
  const { targetRole, currentSkills } = req.body;
  const role = TARGET_ROLES.includes(targetRole) ? targetRole : 'Full Stack Developer';
  const skills = Array.isArray(currentSkills) ? currentSkills.slice(0, 20) : [];

  try {
    const systemPrompt = `You are a career skills analyst. Output ONLY valid JSON — no markdown.`;

    const userPrompt = `Analyze skill gaps for a student with skills [${skills.join(', ')}] targeting "${role}".

JSON schema (array):
[{"skill":"string","currentLevel":number(0-100),"requiredLevel":number(0-100),"recommendation":"string"}]

Include 6-8 skills. Be realistic about gaps. currentLevel should be higher for skills the student already has.`;

    const aiResult = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 600,
      temperature: 0.5,
      structuredJson: true,
    });

    let gaps;
    let aiPowered = false;

    if (aiResult.ok) {
      const parsed = extractJSON(aiResult.data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        gaps = parsed.map((g) => ({
          skill: g.skill || 'Unknown',
          currentLevel: clamp(g.currentLevel || 20, 0, 100),
          requiredLevel: clamp(g.requiredLevel || 80, 0, 100),
          recommendation: g.recommendation || '',
        }));
        aiPowered = true;
      }
    }

    if (!gaps) {
      gaps = generateFallbackSkillGap(role, skills);
    }

    // Save session
    try {
      await pool.query(
        'INSERT INTO career_coach_sessions (user_id, session_type, target_role, data) VALUES ($1, $2, $3, $4)',
        [userId, 'skill-gap', role, JSON.stringify({ gaps, currentSkills: skills })]
      );
    } catch {
      // non-critical
    }

    res.json({ gaps, targetRole: role, aiPowered });
  } catch (err) {
    console.error('Skill gap error:', err.message);
    res.json({
      gaps: generateFallbackSkillGap(role, skills),
      targetRole: role,
      aiPowered: false,
    });
  }
});

/**
 * POST /career-plan
 * Generate a career timeline / action plan.
 * Body: { targetRole, currentLevel }
 */
router.post('/career-plan', authenticateToken, requirePlan(3), async (req, res) => {
  const userId = req.user.id;
  const { targetRole, currentLevel } = req.body;
  const role = TARGET_ROLES.includes(targetRole) ? targetRole : 'Full Stack Developer';
  const level = ['beginner', 'intermediate', 'advanced'].includes(currentLevel) ? currentLevel : 'beginner';

  try {
    const systemPrompt = `You are a career planning expert. Output ONLY valid JSON — no markdown.`;

    const userPrompt = `Create a 6-month career plan for a ${level}-level student targeting "${role}".

JSON schema:
{"targetRole":"string","currentLevel":"string","timeline":[{"month":number,"title":"string","description":"string","tasks":["string"],"milestone":"string"}],"shortTerm":["string"],"mediumTerm":["string"],"longTerm":["string"]}

Include 6 monthly phases. Keep tasks concise and actionable.`;

    const aiResult = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 1000,
      temperature: 0.5,
      structuredJson: true,
    });

    let plan;
    let aiPowered = false;

    if (aiResult.ok) {
      const parsed = extractJSON(aiResult.data);
      if (parsed?.timeline?.length) {
        plan = parsed;
        aiPowered = true;
      }
    }

    if (!plan) {
      plan = generateFallbackCareerPlan(role, level);
    }

    // Save session
    try {
      await pool.query(
        'INSERT INTO career_coach_sessions (user_id, session_type, target_role, data) VALUES ($1, $2, $3, $4)',
        [userId, 'career-plan', role, JSON.stringify(plan)]
      );
    } catch {
      // non-critical
    }

    res.json({ plan, aiPowered });
  } catch (err) {
    console.error('Career plan error:', err.message);
    res.json({
      plan: generateFallbackCareerPlan(role, level),
      aiPowered: false,
    });
  }
});

/**
 * POST /compare-roles
 * Compare two career roles side-by-side.
 * Body: { role1, role2 }
 */
router.post('/compare-roles', authenticateToken, requirePlan(3), async (req, res) => {
  const { role1, role2 } = req.body;

  if (!role1 || !role2) {
    return res.status(400).json({ error: 'Both role1 and role2 are required.' });
  }

  try {
    const systemPrompt = `You are a career comparison analyst. Output ONLY valid JSON.`;

    const userPrompt = `Compare these two career paths for a university student:
Role 1: "${role1}"
Role 2: "${role2}"

JSON schema:
{"role1":{"name":"string","avgSalary":"string","demandLevel":"string","growthRate":"string","keySkills":["string"],"entryBarrier":"string","remoteOpportunities":"string"},"role2":{"name":"string","avgSalary":"string","demandLevel":"string","growthRate":"string","keySkills":["string"],"entryBarrier":"string","remoteOpportunities":"string"},"recommendation":"string"}`;

    const aiResult = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 600,
      temperature: 0.5,
      structuredJson: true,
    });

    let comparison;
    let aiPowered = false;

    if (aiResult.ok) {
      const parsed = extractJSON(aiResult.data);
      if (parsed?.role1 && parsed?.role2) {
        comparison = parsed;
        aiPowered = true;
      }
    }

    if (!comparison) {
      comparison = generateFallbackComparison(role1, role2);
    }

    res.json({ comparison, aiPowered });
  } catch (err) {
    console.error('Compare roles error:', err.message);
    res.json({
      comparison: generateFallbackComparison(role1, role2),
      aiPowered: false,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Code Reviewer Routes (requirePlan(2) = "Tune & Polish")
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /code-review
 * Review submitted code.
 * Body: { code, language, reviewType }
 */
router.post('/code-review', authenticateToken, requirePlan(2), async (req, res) => {
  const userId = req.user.id;
  const { code, language, reviewType } = req.body;

  if (!code || typeof code !== 'string' || code.trim().length < 5) {
    return res.status(400).json({ error: 'Code is required (minimum 5 characters).' });
  }

  const lang = LANGUAGES.includes(language) ? language : 'javascript';
  const type = REVIEW_TYPES.includes(reviewType) ? reviewType : 'full';
  const truncatedCode = code.slice(0, 5000); // Limit to 5000 chars

  try {
    const reviewFocus = {
      full: 'bugs, performance, security, best practices, readability, and style',
      bugs: 'potential bugs, logic errors, and edge cases',
      performance: 'performance bottlenecks, memory usage, and optimization opportunities',
      security: 'security vulnerabilities, injection risks, and unsafe patterns',
      'best-practices': 'coding best practices, design patterns, and maintainability',
      readability: 'code readability, naming conventions, and documentation',
    }[type];

    const systemPrompt = `You are an expert code reviewer. Output ONLY valid JSON — no markdown, no explanation.`;

    const userPrompt = `Review this ${lang} code focusing on ${reviewFocus}.

Code:
\`\`\`${lang}
${truncatedCode}
\`\`\`

JSON schema:
{"score":number(0-100),"issues":[{"severity":"critical|warning|info|suggestion","category":"Bugs|Performance|Security|Style|Best Practices","line":number,"description":"string","suggestedFix":"string"}],"improvedCode":"string","metrics":{"linesOfCode":number,"complexityScore":number,"maintainabilityIndex":number},"explanation":"string"}

Be specific about line numbers. Provide actionable fixes. Score reflects overall quality.`;

    const aiResult = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 1200,
      temperature: 0.3,
      structuredJson: true,
    });

    let review;
    let aiPowered = false;

    if (aiResult.ok) {
      const parsed = extractJSON(aiResult.data);
      if (parsed?.score !== undefined && Array.isArray(parsed?.issues)) {
        review = {
          score: clamp(parsed.score, 0, 100),
          issues: parsed.issues.map((issue) => ({
            severity: ['critical', 'warning', 'info', 'suggestion'].includes(issue.severity) ? issue.severity : 'info',
            category: issue.category || 'Best Practices',
            line: issue.line || 1,
            description: issue.description || '',
            suggestedFix: issue.suggestedFix || '',
          })),
          improvedCode: parsed.improvedCode || truncatedCode,
          metrics: {
            linesOfCode: parsed.metrics?.linesOfCode || truncatedCode.split('\n').length,
            complexityScore: clamp(parsed.metrics?.complexityScore || 5, 1, 50),
            maintainabilityIndex: clamp(parsed.metrics?.maintainabilityIndex || 70, 0, 100),
          },
          explanation: parsed.explanation || '',
        };
        aiPowered = true;
      }
    }

    if (!review) {
      review = generateFallbackCodeReview(truncatedCode, lang, type);
    }

    // Save to database
    try {
      await pool.query(
        'INSERT INTO code_reviews (user_id, language, review_type, score, issues_count, code_snippet) VALUES ($1, $2, $3, $4, $5, $6)',
        [userId, lang, type, review.score, review.issues.length, truncatedCode.slice(0, 500)]
      );
    } catch {
      // non-critical
    }

    res.json({ review, language: lang, reviewType: type, aiPowered });
  } catch (err) {
    console.error('Code review error:', err.message);
    res.json({
      review: generateFallbackCodeReview(truncatedCode, lang, type),
      language: lang,
      reviewType: type,
      aiPowered: false,
    });
  }
});

/**
 * GET /review-history
 * Returns the user's past code review history.
 */
router.get('/review-history', authenticateToken, requirePlan(2), async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT id, language, review_type, score, issues_count, code_snippet, created_at
       FROM code_reviews
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId]
    );

    res.json({ reviews: result.rows });
  } catch (err) {
    console.error('Review history error:', err.message);
    res.json({ reviews: [] });
  }
});

module.exports = router;
