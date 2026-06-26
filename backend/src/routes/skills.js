const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { pool } = require('../config/database');
const { callAI, extractJSON } = require('../utils/aiClient');

// ── Dynamic Question Bank ───────────────────────────────────────────────────
const QUESTION_BANK = {
  technical: [
    { id: 't1', text: "Explain the difference between let, const, and var in JavaScript. When would you use each?", category: "JavaScript", difficulty: "easy" },
    { id: 't2', text: "How does React's Virtual DOM work? Why is it faster than direct DOM manipulation?", category: "React", difficulty: "easy" },
    { id: 't3', text: "What is the event loop in JavaScript? Explain with an example of how setTimeout works.", category: "JavaScript", difficulty: "medium" },
    { id: 't4', text: "Explain closures in JavaScript. Give a practical use case where closures are essential.", category: "JavaScript", difficulty: "medium" },
    { id: 't5', text: "What are indexes in databases? When would adding an index hurt performance?", category: "Database", difficulty: "medium" },
    { id: 't6', text: "Explain the difference between SQL and NoSQL databases. When would you choose each?", category: "Database", difficulty: "easy" },
    { id: 't7', text: "What is the N+1 query problem? How would you solve it in a REST API?", category: "Database", difficulty: "hard" },
    { id: 't8', text: "Explain how HTTPS works. What happens during a TLS handshake?", category: "Networking", difficulty: "hard" },
    { id: 't9', text: "What is the difference between process and thread? When would you use multi-threading vs multi-processing?", category: "OS", difficulty: "medium" },
    { id: 't10', text: "Design a URL shortener. What data structures and algorithms would you use?", category: "System Design", difficulty: "hard" },
    { id: 't11', text: "What are React hooks? Explain useState, useEffect, and useRef with examples.", category: "React", difficulty: "easy" },
    { id: 't12', text: "Explain REST vs GraphQL. What are the trade-offs of each approach?", category: "API Design", difficulty: "medium" },
    { id: 't13', text: "What is Docker? Explain containers vs virtual machines.", category: "DevOps", difficulty: "easy" },
    { id: 't14', text: "Explain the CAP theorem. How does it apply to distributed databases?", category: "System Design", difficulty: "hard" },
    { id: 't15', text: "What is CI/CD? Describe a typical deployment pipeline.", category: "DevOps", difficulty: "medium" },
  ],
  behavioral: [
    { id: 'b1', text: "Tell me about a time you disagreed with a team member on a technical decision. How did you resolve it?", category: "Teamwork", difficulty: "medium" },
    { id: 'b2', text: "Describe a project where you had to learn a new technology quickly. What was your approach?", category: "Learning", difficulty: "easy" },
    { id: 'b3', text: "How do you prioritize tasks when you have multiple deadlines?", category: "Time Management", difficulty: "easy" },
    { id: 'b4', text: "Tell me about a bug that took you a long time to find. What was the debugging process?", category: "Problem Solving", difficulty: "medium" },
    { id: 'b5', text: "How would you explain a complex technical concept to a non-technical stakeholder?", category: "Communication", difficulty: "medium" },
  ],
  coding: [
    { id: 'c1', text: "Write a function to check if a string is a palindrome. Consider edge cases.", category: "Strings", difficulty: "easy" },
    { id: 'c2', text: "Write a function to find the two numbers in an array that add up to a target sum. What is the time complexity?", category: "Arrays", difficulty: "medium" },
    { id: 'c3', text: "Write a function to flatten a deeply nested array (e.g., [1,[2,[3,[4]]]] -> [1,2,3,4]).", category: "Recursion", difficulty: "medium" },
    { id: 'c4', text: "Write a function to find the longest common prefix among an array of strings.", category: "Strings", difficulty: "medium" },
    { id: 'c5', text: "Implement a debounce function. Explain when you would use it in a real application.", category: "JavaScript", difficulty: "hard" },
  ]
};

function selectQuestions(targetDifficulty = 'medium', count = 8) {
  const difficultyOrder = { easy: 1, medium: 2, hard: 3 };
  const targetNum = difficultyOrder[targetDifficulty] || 2;

  // Select: 4 technical, 2 behavioral, 2 coding
  const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);

  const filterByDifficulty = (arr, target) => {
    const exact = arr.filter(q => q.difficulty === target);
    const nearby = arr.filter(q => Math.abs(difficultyOrder[q.difficulty] - targetNum) <= 1);
    return exact.length >= 2 ? shuffle(exact) : shuffle(nearby.length > 0 ? nearby : arr);
  };

  const tech = filterByDifficulty(QUESTION_BANK.technical, targetDifficulty).slice(0, 4);
  const behav = filterByDifficulty(QUESTION_BANK.behavioral, targetDifficulty).slice(0, 2);
  const code = filterByDifficulty(QUESTION_BANK.coding, targetDifficulty).slice(0, 2);

  return [...tech, ...behav, ...code];
}

// ── AI Skill Gap Analysis ────────────────────────────────────────────────────
const SYSTEM_PROMPT_SKILLS = `You are a senior technical assessment specialist who has evaluated 10,000+ candidates at companies like Google, Microsoft, and Amazon.

You analyze candidate responses with surgical precision — identifying not just what they know, but HOW they think, WHERE their mental models break down, and WHAT specific actions will close their gaps fastest.

Given a candidate's answers to technical and behavioral questions, produce a thorough evaluation.

Return ONLY valid JSON (no markdown fences, no extra text):
{
  "strengths": ["Be SPECIFIC — name exact technologies, patterns, or soft skills demonstrated. Example: 'Strong understanding of React component lifecycle and state management patterns' NOT 'good at React'"],
  "gaps": ["Be SPECIFIC — name exact missing knowledge. Example: 'No evidence of database optimization knowledge (indexing, query planning, N+1 prevention)' NOT 'needs database skills'"],
  "role_matches": ["Match to specific job titles with seniority level, e.g. 'Junior Frontend Developer', 'Associate Data Analyst'"],
  "analysis": "Write 3-4 sentences. First sentence: overall impression. Second: strongest area with evidence. Third: most critical gap and its career impact. Fourth: specific next step.",
  "scores": {
    "technical_depth": 0-100,
    "problem_solving": 0-100,
    "communication": 0-100,
    "industry_readiness": 0-100
  },
  "recommendations": [
    {"skill": "specific skill name", "action": "concrete learning action", "resource": "specific resource name", "timeframe": "realistic timeframe"},
    {"skill": "...", "action": "...", "resource": "...", "timeframe": "..."}
  ]
}

Scoring calibration:
- 0-30: No demonstrated knowledge
- 31-50: Awareness but cannot apply
- 51-70: Can apply with guidance
- 71-85: Independent proficiency
- 86-100: Expert/teaching level (rare for entry-level)

Be honest. Inflated scores waste the candidate's time. A truthful 45 helps more than a generous 72.`;

// Intelligent fallback when API is unavailable
function generateFallbackAnalysis(answers) {
  // Normalize answers to a single text blob regardless of format
  let allText;
  if (Array.isArray(answers)) {
    allText = answers.map(a => a.answer || '').join(' ').toLowerCase();
  } else {
    allText = Object.values(answers).join(' ').toLowerCase();
  }

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

// ── GET /api/skills/questions — Dynamic assessment questions ─────────────────
router.get('/questions', authenticateToken, requirePlan(1), async (req, res) => {
  try {
    const difficulty = req.query.difficulty || 'medium';
    const count = Math.min(parseInt(req.query.count) || 8, 15);
    const questions = selectQuestions(difficulty, count);
    res.json({ questions, total: questions.length, difficulty });
  } catch (err) {
    console.error('Question generation error:', err.message);
    res.status(500).json({ error: 'Failed to generate questions' });
  }
});

// ── POST /api/skills/assessment — AI-Powered Assessment ─────────────────────
router.post('/assessment', authenticateToken, requirePlan(1), async (req, res, next) => {
  try {
    const { answers } = req.body;

    // Build user prompt — support both old and new formats
    let userPrompt;
    if (Array.isArray(answers)) {
      // New format: array of {questionId, questionText, answer, category, difficulty}
      userPrompt = answers.map((a, i) =>
        `Question ${i + 1} [${a.category || 'General'}, ${a.difficulty || 'medium'}]: ${a.questionText}\nAnswer: ${a.answer}`
      ).join('\n\n');
    } else {
      // Legacy format: {question_id: answer}
      const legacyQuestions = [
        { id: 1, text: "How do you handle state in a large React application?", category: "React" },
        { id: 2, text: "Explain the concept of Event Loop in JavaScript.", category: "JavaScript" },
        { id: 3, text: "How would you optimize a slow SQL query?", category: "Database" },
        { id: 4, text: "Describe a time you resolved a conflict with a teammate.", category: "Soft Skills" }
      ];

      userPrompt = legacyQuestions.map(q => {
        const answer = answers[q.id] || answers[String(q.id)] || '(no answer provided)';
        return `**Q (${q.category}):** ${q.text}\n**A:** ${answer}`;
      }).join('\n\n');
    }

    const fullPrompt = `Evaluate this candidate's technical assessment:\n\n${userPrompt}`;

    // Try AI first
    const aiResult = await callAI({
      systemPrompt: SYSTEM_PROMPT_SKILLS,
      userPrompt: fullPrompt,
      maxTokens: 1200,
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

    // Save to database — store scores inside skills JSONB for history retrieval
    const skillsData = Array.isArray(answers)
      ? { answers, scores: result.scores }
      : { answers, scores: result.scores };

    const dbResult = await pool.query(
      'INSERT INTO skill_assessments (user_id, skills, strengths, gaps, role_matches) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [
        req.user.id,
        JSON.stringify(skillsData),
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
      recommendations: result.recommendations || [],
      ai_powered: aiResult.ok
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/skills/history — Past assessments with scores ──────────────────
router.get('/history', authenticateToken, requirePlan(1), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, skills, strengths, gaps, role_matches, created_at
       FROM skill_assessments WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 10`,
      [req.user.id]
    );

    const history = result.rows.map(row => {
      let scores = {};
      try {
        const data = typeof row.skills === 'string' ? JSON.parse(row.skills) : row.skills;
        scores = data?.scores || {};
      } catch {}
      return {
        id: row.id,
        scores,
        strengths: typeof row.strengths === 'string' ? JSON.parse(row.strengths) : row.strengths,
        gaps: typeof row.gaps === 'string' ? JSON.parse(row.gaps) : row.gaps,
        roleMatches: typeof row.role_matches === 'string' ? JSON.parse(row.role_matches) : row.role_matches,
        createdAt: row.created_at,
      };
    });

    res.json({ history });
  } catch (err) {
    console.error('Assessment history error:', err.message);
    res.status(500).json({ error: 'Failed to fetch assessment history' });
  }
});

module.exports = router;
