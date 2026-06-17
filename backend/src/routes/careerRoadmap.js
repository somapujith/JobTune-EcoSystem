const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { pool } = require('../config/database');
const { callAI, extractJSON } = require('../utils/aiClient');

const activeGenerations = new Map();

// ── POST /api/career/roadmap - Generate personalized career roadmap ────────
router.post('/roadmap', authenticateToken, requirePlan(1), async (req, res) => {
  const userId = req.user.id;

  if (activeGenerations.has(userId)) {
    return res.status(429).json({ error: 'Roadmap generation already in progress. Please wait.' });
  }

  activeGenerations.set(userId, true);

  try {
    const { currentRole, targetRole, currentSkills, timeframe } = req.body;

    if (!targetRole) {
      return res.status(400).json({ error: 'Target role is required' });
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

    const systemPrompt = `You are a senior career coach. Output ONLY valid JSON — no reasoning, no markdown, no explanation. Keep each phase concise (max 2 goals, 3 skills, 1 project, 2 resources). Use exactly 3 phases.`;

    const userPrompt = `Build a ${timeframeDisplay} roadmap to become a ${targetRole}.
Current role: ${currentRole || 'Fresher'}. Skills: ${skillsText}.

JSON schema:
{"title":"string","summary":"string","estimatedHours":number,"phases":[{"phase":number,"title":"string","duration":"string","description":"string","goals":["string"],"skills":["string"],"projects":[{"name":"string","description":"string","difficulty":"beginner|intermediate|advanced"}],"resources":[{"title":"string","type":"course|article|book|project","url":"string"}],"milestones":["string"]}],"keyMetrics":["string"],"tips":["string"],"roleDescription":"string"}`;

    const aiResult = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 1200,
      temperature: 0.5,
      model: process.env.LM_STUDIO_MODEL_ROADMAP,
      structuredJson: true
    });

    let roadmap;
    let aiPowered = false;

    if (aiResult.ok) {
      roadmap = extractJSON(aiResult.data);
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
      const result = await pool.query(
        'INSERT INTO career_roadmaps (user_id, "current_role", target_role, timeframe, roadmap) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [userId, currentRole || 'Fresher', targetRole, selectedTimeframe, JSON.stringify(roadmap)]
      );
      roadmap.id = result.rows[0].id;
    } catch (dbErr) {
      console.warn('Could not save roadmap to database:', dbErr.message);
      // Continue anyway, return the roadmap
    }

    res.json({ ...roadmap, aiPowered });
  } catch (err) {
    console.error('Career roadmap generation error:', err.message);
    res.status(500).json({ error: 'Failed to generate career roadmap' });
  } finally {
    activeGenerations.delete(userId);
  }
});

// ── GET /api/career/roadmap/:id - Fetch saved roadmap ────────────────────
router.get('/roadmap/:id', authenticateToken, requirePlan(1), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const rows = await pool.query(
      'SELECT * FROM career_roadmaps WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (rows.rows.length === 0) {
      return res.status(404).json({ error: 'Roadmap not found' });
    }

    const roadmap = rows.rows[0];
    roadmap.roadmap = typeof roadmap.roadmap === 'string'
      ? JSON.parse(roadmap.roadmap)
      : roadmap.roadmap;

    res.json(roadmap);
  } catch (err) {
    console.error('Fetch roadmap error:', err.message);
    res.status(500).json({ error: 'Failed to fetch roadmap' });
  }
});

// ── GET /api/career/roadmap - Fetch user's latest roadmap ────────────────
router.get('/roadmap', authenticateToken, requirePlan(1), async (req, res) => {
  try {
    const userId = req.user.id;

    const rows = await pool.query(
      'SELECT * FROM career_roadmaps WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );

    if (rows.rows.length === 0) {
      return res.status(404).json({ error: 'No roadmap found. Generate one first.' });
    }

    const roadmap = rows.rows[0];
    roadmap.roadmap = typeof roadmap.roadmap === 'string'
      ? JSON.parse(roadmap.roadmap)
      : roadmap.roadmap;

    res.json(roadmap);
  } catch (err) {
    console.error('Fetch latest roadmap error:', err.message);
    res.status(500).json({ error: 'Failed to fetch roadmap' });
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
