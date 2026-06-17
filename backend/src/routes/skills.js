const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { pool } = require('../config/database');
const { callAI, extractJSON } = require('../utils/aiClient');

// ── AI Skill Gap Analysis ────────────────────────────────────────────────────
const SYSTEM_PROMPT_SKILLS = `You are a senior technical interviewer at a FAANG company. 
Given a candidate's answers to technical and behavioural questions, you must evaluate them accurately.

Return ONLY valid JSON (no markdown, no extra text) in this exact format:
{
  "strengths": ["strength1", "strength2", "strength3"],
  "gaps": ["gap1", "gap2", "gap3"],
  "role_matches": ["Role 1", "Role 2"],
  "analysis": "One paragraph (2-3 sentences) summary of the candidate's overall readiness.",
  "scores": {
    "technical_depth": 72,
    "problem_solving": 65,
    "communication": 80,
    "industry_readiness": 58
  }
}

Rules:
- Strengths/gaps must be SPECIFIC (not vague like "good skills"). Use real technology or skill names.
- Role matches should be realistic entry-level or junior roles.
- Scores are 0-100. Be honest, not generous.
- Analysis should be encouraging but truthful.`;

// Intelligent fallback when API is unavailable
function generateFallbackAnalysis(answers) {
  const allText = Object.values(answers).join(' ').toLowerCase();

  const techMap = {
    'react': 'React.js', 'vue': 'Vue.js', 'angular': 'Angular',
    'node': 'Node.js', 'express': 'Express.js', 'python': 'Python',
    'sql': 'SQL / Databases', 'mongodb': 'MongoDB', 'docker': 'Docker',
    'api': 'API Design', 'git': 'Git & Version Control',
    'typescript': 'TypeScript', 'javascript': 'JavaScript',
    'css': 'CSS / Styling', 'html': 'HTML',
    'redux': 'State Management', 'zustand': 'State Management',
    'event loop': 'JavaScript Runtime', 'async': 'Async Programming',
    'promise': 'Async Programming', 'callback': 'JavaScript Fundamentals',
  };

  const detectedStrengths = [];
  const allGaps = ['System Design', 'Cloud Fundamentals (AWS/GCP)', 'CI/CD Pipelines', 
    'Testing & TDD', 'Data Structures', 'Algorithm Optimization', 'Microservices'];

  for (const [keyword, skill] of Object.entries(techMap)) {
    if (allText.includes(keyword) && !detectedStrengths.includes(skill)) {
      detectedStrengths.push(skill);
    }
  }

  // If user wrote substantial answers, credit communication
  const wordCount = allText.split(/\s+/).length;
  if (wordCount > 100) detectedStrengths.push('Clear Communication');
  if (wordCount > 200) detectedStrengths.push('Detailed Technical Articulation');

  const strengths = detectedStrengths.length > 0 
    ? detectedStrengths.slice(0, 5) 
    : ['Problem Solving Basics', 'Growth Mindset'];

  const gaps = allGaps.filter(g => !detectedStrengths.some(s => g.toLowerCase().includes(s.toLowerCase()))).slice(0, 4);

  const techScore = Math.min(90, 35 + detectedStrengths.length * 10);
  const commScore = Math.min(90, 40 + Math.floor(wordCount / 10));

  return {
    strengths,
    gaps,
    role_matches: detectedStrengths.length >= 3 
      ? ['Junior Full Stack Developer', 'SDE-1 (Frontend)', 'React Developer'] 
      : ['Junior Developer', 'Frontend Trainee', 'Intern - Software Engineering'],
    analysis: `Based on your responses, you demonstrate ${detectedStrengths.length >= 3 ? 'solid' : 'foundational'} technical knowledge with notable strength in ${strengths[0]}. Focus on bridging gaps in ${gaps[0]} and ${gaps[1]} to become more competitive. Your communication style is ${wordCount > 100 ? 'detailed and clear' : 'concise but could use more depth'}.`,
    scores: {
      technical_depth: techScore,
      problem_solving: Math.min(85, 40 + detectedStrengths.length * 8),
      communication: commScore,
      industry_readiness: Math.min(80, 30 + detectedStrengths.length * 7)
    }
  };
}

// Submit Assessment - AI-Powered
router.post('/assessment', authenticateToken, requirePlan(1), async (req, res, next) => {
  try {
    const { answers } = req.body;

    // Build the user prompt with actual question-answer pairs
    const questions = [
      { id: 1, text: "How do you handle state in a large React application?", category: "React" },
      { id: 2, text: "Explain the concept of Event Loop in JavaScript.", category: "JavaScript" },
      { id: 3, text: "How would you optimize a slow SQL query?", category: "Database" },
      { id: 4, text: "Describe a time you resolved a conflict with a teammate.", category: "Soft Skills" }
    ];

    const formattedQA = questions.map(q => {
      const answer = answers[q.id] || answers[String(q.id)] || '(no answer provided)';
      return `**Q (${q.category}):** ${q.text}\n**A:** ${answer}`;
    }).join('\n\n');

    const userPrompt = `Evaluate this fresher candidate's technical assessment:\n\n${formattedQA}`;

    // Try AI first
    const aiResult = await callAI({
      systemPrompt: SYSTEM_PROMPT_SKILLS,
      userPrompt,
      maxTokens: 800,
      model: process.env.LM_STUDIO_MODEL_SKILLS
    });
    
    let result;
    if (aiResult.ok) {
      const parsed = extractJSON(aiResult.data);
      if (parsed && parsed.strengths && parsed.gaps) {
        result = parsed;
      } else {
        console.warn('AI returned unparseable JSON, falling back');
        result = generateFallbackAnalysis(answers);
      }
    } else {
      console.warn('AI unavailable, using fallback analysis');
      result = generateFallbackAnalysis(answers);
    }

    // Save to database
    const dbResult = await pool.query(
      'INSERT INTO skill_assessments (user_id, skills, strengths, gaps, role_matches) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [
        req.user.id,
        JSON.stringify(answers),
        JSON.stringify(result.strengths),
        JSON.stringify(result.gaps),
        JSON.stringify(result.role_matches)
      ]
    );

    const rows = await pool.query('SELECT * FROM skill_assessments WHERE id = $1', [dbResult.rows[0].id]);

    // Return the enriched result
    res.json({
      ...rows.rows[0],
      strengths: result.strengths,
      gaps: result.gaps,
      role_matches: result.role_matches,
      analysis: result.analysis,
      scores: result.scores,
      ai_powered: aiResult.ok
    });
  } catch (err) {
    next(err);
  }
});

// Get User History
router.get('/history', authenticateToken, requirePlan(1), async (req, res, next) => {
  try {
    const rows = await pool.query('SELECT * FROM skill_assessments WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json(rows.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
