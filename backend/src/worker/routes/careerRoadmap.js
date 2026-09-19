'use strict';

/**
 * Worker port of backend/src/routes/careerRoadmap.js  (mounted at /api/career).
 * Slice: mid1 (ADR-001 Phase 3). Ported from the WORKING-TREE Express file, which adds the two
 * discovery routes over git HEAD.
 *
 *   POST /roadmap        authenticateToken + requirePlan(1)
 *   GET  /roadmap/:id    authenticateToken + requirePlan(1)
 *   POST /discovery      authenticateToken                    (NEW in working tree; upsert)
 *   GET  /discovery      authenticateToken                    (NEW in working tree; 404 if none)
 *   GET  /roadmap        authenticateToken + requirePlan(1)
 *   (same registration order as Express)
 *
 * Services (injected, infra slice): getServices(c).aiClient (callAI, extractJSON).
 * Model selection: config.vars.LM_STUDIO_MODEL_ROADMAP.
 *
 * PLATFORM DEVIATION: activeGenerations (one in-flight roadmap generation per user, answered with 429)
 * is an in-memory Map, as on Express. On Workers it is per isolate, not per process: two requests from
 * the same user that land on different isolates can both generate. It still stops the common
 * double-click within one isolate. It is best-effort, never a security control. Durable enforcement
 * would need a Durable Object or DB lock (out of scope for a behaviour-preserving port).
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { getConfig, getServices } = require('../lib/context');
const { getDb } = require('../db');
const { getBody } = require('../lib/http');

const router = createRouter();

const activeGenerations = new Map();

// ── POST /api/career/roadmap - Generate personalized career roadmap ────────
router.post('/roadmap', authenticateToken, requirePlan(1), async (c) => {
  const userId = c.get('user').id;

  if (activeGenerations.has(userId)) {
    return c.json({ error: 'Roadmap generation already in progress. Please wait.' }, 429);
  }

  activeGenerations.set(userId, true);

  try {
    const { currentRole, targetRole, currentSkills, timeframe } = getBody(c);

    if (!targetRole) {
      return c.json({ error: 'Target role is required' }, 400);
    }

    // Validate timeframe
    const validTimeframes = ['3months', '6months', '1year'];
    const selectedTimeframe = validTimeframes.includes(timeframe) ? timeframe : '6months';

    // Format timeframe for display
    const timeframeDisplay = {
      '3months': '3 months',
      '6months': '6 months',
      '1year': '1 year'
    }[selectedTimeframe];

    // Build skills context
    const skillsText = Array.isArray(currentSkills)
      ? currentSkills.join(', ')
      : currentSkills || 'General programming';

    const systemPrompt = `You are an expert career transition coach who has guided 1,000+ professionals into new tech roles. You create actionable roadmaps with specific, real resources — not generic advice.

ROADMAP QUALITY RULES:
- Skills must be SPECIFIC technologies/frameworks, not categories ("Learn React Router and Redux Toolkit" NOT "Learn frontend frameworks")
- Projects must be PORTFOLIO-WORTHY and demonstrate the target skill ("Build a real-time chat app with Socket.io and React" NOT "Build a project")
- Resources must be REAL and well-known (freeCodeCamp, The Odin Project, CS50, Neetcode, specific YouTube channels like Fireship, specific books)
- Milestones must be MEASURABLE ("Complete 50 LeetCode medium problems" NOT "Practice algorithms")
- Each phase builds on the previous one — skills compound, not repeat

Output ONLY valid JSON. Keep each phase concise (max 2 goals, 3 skills, 1 project, 2 resources). Use exactly 3 phases.`;

    const userPrompt = `Build a ${timeframeDisplay} roadmap to become a ${targetRole}.
Current role: ${currentRole || 'Fresher'}. Skills: ${skillsText}.

JSON schema:
{"title":"string","summary":"string","estimatedHours":number,"phases":[{"phase":number,"title":"string","duration":"string","description":"string","goals":["string"],"skills":["string"],"projects":[{"name":"string","description":"string","difficulty":"beginner|intermediate|advanced"}],"resources":[{"title":"string","type":"course|article|book|project","url":"string"}],"milestones":["string"]}],"keyMetrics":["string"],"tips":["string"],"roleDescription":"string"}`;

    const { aiClient } = getServices(c);
    const aiResult = await aiClient.callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 1200,
      temperature: 0.5,
      model: getConfig(c).vars.LM_STUDIO_MODEL_ROADMAP,
      structuredJson: true
    });

    let roadmap;
    let aiPowered = false;

    if (aiResult.ok) {
      roadmap = aiClient.extractJSON(aiResult.data);
      if (roadmap?.phases?.length) {
        aiPowered = true;
      } else {
        console.warn('Failed to parse roadmap JSON, using fallback');
        roadmap = generateFallbackRoadmap(targetRole, skillsText, selectedTimeframe);
      }
    } else {
      console.warn('AI roadmap generation failed, using fallback:', aiResult.error);
      roadmap = generateFallbackRoadmap(targetRole, skillsText, selectedTimeframe);
    }

    // Save to database
    try {
      const result = await getDb(c).query(
        'INSERT INTO career_roadmaps (user_id, "current_role", target_role, timeframe, roadmap) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [userId, currentRole || 'Fresher', targetRole, selectedTimeframe, JSON.stringify(roadmap)]
      );
      roadmap.id = result.rows[0].id;
    } catch (dbErr) {
      console.warn('Could not save roadmap to database:', dbErr.message);
      // Continue anyway, return the roadmap
    }

    return c.json({ ...roadmap, aiPowered });
  } catch (err) {
    console.error('Career roadmap generation error:', err.message);
    return c.json({ error: 'Failed to generate career roadmap' }, 500);
  } finally {
    activeGenerations.delete(userId);
  }
});

// ── GET /api/career/roadmap/:id - Fetch saved roadmap ────────────────────
router.get('/roadmap/:id', authenticateToken, requirePlan(1), async (c) => {
  try {
    const id = c.req.param('id');
    const userId = c.get('user').id;

    const rows = await getDb(c).query(
      'SELECT * FROM career_roadmaps WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (rows.rows.length === 0) {
      return c.json({ error: 'Roadmap not found' }, 404);
    }

    const roadmap = rows.rows[0];
    roadmap.roadmap = typeof roadmap.roadmap === 'string'
      ? JSON.parse(roadmap.roadmap)
      : roadmap.roadmap;

    return c.json(roadmap);
  } catch (err) {
    console.error('Fetch roadmap error:', err.message);
    return c.json({ error: 'Failed to fetch roadmap' }, 500);
  }
});

// ── POST /api/career/discovery - Save career discovery survey answers ────
router.post('/discovery', authenticateToken, async (c) => {
  const userId = c.get('user').id;
  const { answers, subAnswers } = getBody(c);

  if (!answers || typeof answers !== 'object') {
    return c.json({ error: 'answers is required' }, 400);
  }

  try {
    const result = await getDb(c).query(
      `INSERT INTO career_discovery_responses (user_id, answers, sub_answers)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET answers = EXCLUDED.answers,
             sub_answers = EXCLUDED.sub_answers,
             updated_at = NOW()
       RETURNING id, updated_at`,
      [userId, JSON.stringify(answers), JSON.stringify(subAnswers || {})]
    );

    return c.json({ id: result.rows[0].id, updatedAt: result.rows[0].updated_at });
  } catch (err) {
    console.error('Save discovery response error:', err.message);
    return c.json({ error: 'Failed to save discovery responses' }, 500);
  }
});

// ── GET /api/career/discovery - Fetch user's saved discovery answers ─────
router.get('/discovery', authenticateToken, async (c) => {
  try {
    const userId = c.get('user').id;

    const result = await getDb(c).query(
      'SELECT answers, sub_answers, updated_at FROM career_discovery_responses WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'No discovery response found.' }, 404);
    }

    const row = result.rows[0];
    return c.json({
      answers: typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers,
      subAnswers: typeof row.sub_answers === 'string' ? JSON.parse(row.sub_answers) : row.sub_answers,
      updatedAt: row.updated_at
    });
  } catch (err) {
    console.error('Fetch discovery response error:', err.message);
    return c.json({ error: 'Failed to fetch discovery responses' }, 500);
  }
});

// ── GET /api/career/roadmap - Fetch user's latest roadmap ────────────────
router.get('/roadmap', authenticateToken, requirePlan(1), async (c) => {
  try {
    const userId = c.get('user').id;

    const rows = await getDb(c).query(
      'SELECT * FROM career_roadmaps WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );

    if (rows.rows.length === 0) {
      return c.json({ error: 'No roadmap found. Generate one first.' }, 404);
    }

    const roadmap = rows.rows[0];
    roadmap.roadmap = typeof roadmap.roadmap === 'string'
      ? JSON.parse(roadmap.roadmap)
      : roadmap.roadmap;

    return c.json(roadmap);
  } catch (err) {
    console.error('Fetch latest roadmap error:', err.message);
    return c.json({ error: 'Failed to fetch roadmap' }, 500);
  }
});

// ── Fallback roadmap generator (if LLM fails) ────────────────────────────
function generateFallbackRoadmap(targetRole, skillsText, timeframe) {
  const monthDuration = timeframe === '3months' ? 3 : timeframe === '1year' ? 12 : 6;
  const hoursPerMonth = 200 / monthDuration;

  return {
    title: `Your Path to ${targetRole}`,
    summary: `A structured ${monthDuration}-month plan to transition into a ${targetRole} role.`,
    estimatedHours: 200,
    phases: [
      {
        phase: 1,
        title: 'Foundation & Core Concepts',
        duration: `${Math.ceil(monthDuration / 3)} months`,
        description: 'Build foundational knowledge and set up your learning environment.',
        goals: ['Understand core concepts', 'Set up development environment'],
        skills: targetRole.toLowerCase().includes('frontend')
          ? ['HTML', 'CSS', 'JavaScript', 'React']
          : targetRole.toLowerCase().includes('backend')
            ? ['Node.js', 'Express', 'Databases', 'APIs']
            : ['Full-stack fundamentals', 'Web basics'],
        projects: [
          { name: 'Personal Portfolio Website', description: 'Build and deploy a simple portfolio', difficulty: 'beginner' }
        ],
        resources: [
          { title: 'freeCodeCamp', type: 'course', url: 'https://freecodecamp.org' },
          { title: 'MDN Web Docs', type: 'article', url: 'https://developer.mozilla.org' }
        ],
        milestones: ['Complete fundamentals course', 'Deploy first project']
      },
      {
        phase: 2,
        title: 'Intermediate Skills & First Projects',
        duration: `${Math.ceil(monthDuration / 3)} months`,
        description: 'Develop intermediate skills and build real projects.',
        goals: ['Build 2-3 meaningful projects', 'Learn intermediate patterns'],
        skills: ['Advanced concepts', 'Testing', 'Version control'],
        projects: [
          { name: 'Real-world Application', description: 'Build a feature-rich application', difficulty: 'intermediate' }
        ],
        resources: [
          { title: 'Udemy Courses', type: 'course', url: 'https://udemy.com' },
          { title: 'GitHub Projects', type: 'project', url: 'https://github.com' }
        ],
        milestones: ['Complete 2 medium projects', 'Contribute to open source']
      },
      {
        phase: 3,
        title: 'Advanced Skills & Job Preparation',
        duration: `${Math.ceil(monthDuration / 3)} months`,
        description: 'Polish skills and prepare for job transition.',
        goals: ['Master advanced topics', 'Prepare for interviews'],
        skills: ['System design', 'Performance optimization', 'Interview skills'],
        projects: [
          { name: 'Portfolio Capstone', description: 'Showcase your best work', difficulty: 'advanced' }
        ],
        resources: [
          { title: 'LeetCode', type: 'article', url: 'https://leetcode.com' },
          { title: 'System Design Primer', type: 'book', url: 'https://github.com/donnemartin/system-design-primer' }
        ],
        milestones: ['Complete all projects', 'Pass mock interviews']
      }
    ],
    keyMetrics: ['Projects completed', 'GitHub contributions', 'Interview scores', 'Learning hours'],
    tips: [
      'Build projects that solve real problems',
      'Contribute to open source regularly',
      'Practice coding interviews weekly',
      'Network with other developers',
      'Document your learning journey'
    ],
    roleDescription: `A ${targetRole} is responsible for developing and maintaining software. By following this roadmap, you'll develop the skills needed to excel in this role.`
  };
}

module.exports = router;
