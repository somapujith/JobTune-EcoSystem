const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { pool } = require('../config/database');
const { callAI, extractJSON } = require('../utils/aiClient');

// ── Ensure tables exist ──────────────────────────────────────────────────────
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS learning_roadmaps (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL,
        gaps        JSONB,
        target_role VARCHAR(255) DEFAULT '',
        roadmap     JSONB,
        ai_powered  BOOLEAN DEFAULT false,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    console.error('Learning table migration error:', err.message);
  }
})();

// ── AI Roadmap Generator ─────────────────────────────────────────────────────
const SYSTEM_PROMPT_ROADMAP = `You are a senior career coach and technical mentor specializing in helping freshers and junior developers upskill rapidly.

Given a list of skill gaps and optionally a target role, generate a personalized 4-week learning roadmap.

Return ONLY valid JSON in this exact format:
{
  "title": "Your Personalized Roadmap to [Target Role]",
  "summary": "Brief 1-2 sentence overview",
  "weeks": [
    {
      "week": 1,
      "theme": "Week theme title",
      "goals": ["goal1", "goal2"],
      "tasks": [
        { "title": "Task title", "type": "video|article|project|exercise", "duration": "2 hrs", "resource": "Resource name or URL suggestion", "priority": "high|medium|low" }
      ]
    }
  ],
  "milestones": ["Milestone after week 2", "Final milestone"],
  "estimated_total_hours": 40
}

Rules:
- Each week should have 3-5 tasks
- Mix resource types (videos, articles, hands-on projects)
- Be specific with resource suggestions (name real courses/platforms like freeCodeCamp, Udemy, YouTube channels)
- Week 1 = foundations, Week 4 = practical application
- Total should be achievable in ~10 hrs/week`;

function generateFallbackRoadmap(gaps, targetRole) {
  const role = targetRole || 'Junior Developer';
  const gapList = Array.isArray(gaps) ? gaps : ['General Programming'];

  const weeks = [
    {
      week: 1,
      theme: 'Foundations & Core Concepts',
      goals: [`Understand the basics of ${gapList[0]}`, 'Set up development environment'],
      tasks: [
        { title: `Introduction to ${gapList[0]}`, type: 'video', duration: '3 hrs', resource: 'freeCodeCamp YouTube', priority: 'high' },
        { title: 'Hands-on Practice Exercises', type: 'exercise', duration: '2 hrs', resource: 'LeetCode / HackerRank', priority: 'high' },
        { title: 'Read Documentation & Best Practices', type: 'article', duration: '1.5 hrs', resource: 'MDN Web Docs / Official Docs', priority: 'medium' },
      ]
    },
    {
      week: 2,
      theme: 'Intermediate Patterns & Techniques',
      goals: [`Apply ${gapList[0]} concepts in a mini project`, gapList[1] ? `Begin exploring ${gapList[1]}` : 'Strengthen fundamentals'],
      tasks: [
        { title: `Build a Mini Project using ${gapList[0]}`, type: 'project', duration: '4 hrs', resource: 'Personal Project', priority: 'high' },
        { title: `${gapList[1] || 'Advanced'} Concepts Tutorial`, type: 'video', duration: '2 hrs', resource: 'Fireship / Traversy Media YouTube', priority: 'medium' },
        { title: 'Code Review & Refactoring Practice', type: 'exercise', duration: '1.5 hrs', resource: 'GitHub Open Source', priority: 'medium' },
      ]
    },
    {
      week: 3,
      theme: 'Real-World Application',
      goals: ['Integrate skills into a portfolio-worthy project', 'Practice problem-solving under time pressure'],
      tasks: [
        { title: 'Portfolio Project Development', type: 'project', duration: '5 hrs', resource: 'Personal Portfolio', priority: 'high' },
        { title: 'Technical Interview Prep', type: 'exercise', duration: '2 hrs', resource: 'NeetCode / Blind 75', priority: 'high' },
        { title: `${gapList[2] || 'Soft Skills'} Workshop`, type: 'article', duration: '1 hr', resource: 'Medium / Dev.to Articles', priority: 'low' },
      ]
    },
    {
      week: 4,
      theme: 'Job Readiness & Final Sprint',
      goals: ['Complete and deploy your project', 'Prepare for interviews'],
      tasks: [
        { title: 'Deploy Project to Production', type: 'project', duration: '3 hrs', resource: 'Vercel / Netlify / Railway', priority: 'high' },
        { title: 'Mock Interview Practice', type: 'exercise', duration: '2 hrs', resource: 'Pramp / Interviewing.io', priority: 'high' },
        { title: 'Update Resume & LinkedIn with New Skills', type: 'article', duration: '1.5 hrs', resource: 'JobTube Resume Optimizer', priority: 'high' },
        { title: 'Behavioral Interview Prep (STAR Method)', type: 'video', duration: '1 hr', resource: 'YouTube - Jeff Su', priority: 'medium' },
      ]
    }
  ];

  return {
    title: `Your Personalized Roadmap to ${role}`,
    summary: `A focused 4-week plan to bridge your skill gaps in ${gapList.slice(0, 3).join(', ')} and prepare you for the ${role} role.`,
    weeks,
    milestones: [
      `Complete ${gapList[0]} foundations and build your first mini project`,
      `Deploy a portfolio-worthy project and confidently discuss your skills in interviews`
    ],
    estimated_total_hours: 40
  };
}

// POST /api/learning/generate-roadmap
router.post('/generate-roadmap', authenticateToken, requirePlan(1), async (req, res, next) => {
  try {
    const { gaps, targetRole } = req.body;

    if (!gaps || !Array.isArray(gaps) || gaps.length === 0) {
      return res.status(400).json({ error: 'gaps array is required' });
    }

    const userPrompt = `Skill gaps to address: ${gaps.join(', ')}${targetRole ? `\nTarget role: ${targetRole}` : ''}\n\nCreate a 4-week learning roadmap.`;

    const aiResult = await callAI({
      systemPrompt: SYSTEM_PROMPT_ROADMAP,
      userPrompt,
      maxTokens: 1200,
      model: process.env.LM_STUDIO_MODEL_ROADMAP,
      structuredJson: true
    });

    let roadmap;
    let aiPowered = false;

    if (aiResult.ok) {
      const parsed = extractJSON(aiResult.data);
      if (parsed && parsed.weeks) {
        roadmap = parsed;
        aiPowered = true;
      } else {
        roadmap = generateFallbackRoadmap(gaps, targetRole);
      }
    } else {
      roadmap = generateFallbackRoadmap(gaps, targetRole);
    }

    // Save to database
    const result = await pool.query(
      'INSERT INTO learning_roadmaps (user_id, gaps, target_role, roadmap, ai_powered) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [req.user.id, JSON.stringify(gaps), targetRole || '', JSON.stringify(roadmap), aiPowered]
    );

    res.json({ success: true, data: { id: result.rows[0].id, roadmap, ai_powered: aiPowered } });
  } catch (err) {
    next(err);
  }
});

// GET /api/learning/roadmaps - get user's roadmaps
router.get('/roadmaps', authenticateToken, requirePlan(1), async (req, res, next) => {
  try {
    const rows = await pool.query(
      'SELECT * FROM learning_roadmaps WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
      [req.user.id]
    );
    const parsed = rows.rows.map(r => ({
      ...r,
      gaps: typeof r.gaps === 'string' ? JSON.parse(r.gaps) : r.gaps,
      roadmap: typeof r.roadmap === 'string' ? JSON.parse(r.roadmap) : r.roadmap,
    }));
    res.json({ success: true, data: parsed });
  } catch (err) {
    next(err);
  }
});

// GET /api/learning/resources (keep existing)
router.get('/resources', (req, res) => {
  res.json([
    { id: 1, title: 'Complete React Guide', type: 'Video', category: 'Frontend' },
    { id: 2, title: 'Node.js Crash Course', type: 'Video', category: 'Backend' },
    { id: 3, title: 'SQL for Beginners', type: 'Article', category: 'Database' },
  ]);
});

module.exports = router;
