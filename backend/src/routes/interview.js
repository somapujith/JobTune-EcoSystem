const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { pool } = require('../config/database');
const { callAI, extractJSON } = require('../utils/aiClient');

// ── Ensure table exists ──────────────────────────────────────────────────────
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mock_interviews (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL,
        role        VARCHAR(255) NOT NULL,
        messages    JSONB,
        feedback    JSONB,
        score       INTEGER DEFAULT 0,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    console.error('Mock interviews table migration error:', err.message);
  }
})();

// ── System Prompts ───────────────────────────────────────────────────────────
const INTERVIEWER_PROMPT = `You are an experienced technical interviewer at a top tech company. You are conducting a live mock interview.

Rules:
- Ask ONE question at a time, appropriate for the given role
- After the candidate answers, give brief feedback (1-2 sentences) then ask the next question
- Vary between technical, behavioral, and situational questions
- Be encouraging but honest
- After 5 exchanges, end the interview with a summary

Return ONLY valid JSON:
{
  "feedback": "Brief feedback on their last answer (empty string if this is the first question)",
  "next_question": "Your next interview question",
  "question_type": "technical|behavioral|situational",
  "is_complete": false,
  "tips": ["Optional tip for improvement"]
}

When is_complete is true, also include:
{
  "is_complete": true,
  "final_score": 72,
  "final_feedback": "Overall assessment paragraph",
  "strengths": ["strength1", "strength2"],
  "improvements": ["area1", "area2"]
}`;

const QUESTION_BANK = {
  'Frontend Developer': [
    { q: "Can you explain the Virtual DOM and how React uses it for performance optimization?", type: "technical" },
    { q: "Tell me about a time you had to debug a complex UI rendering issue. How did you approach it?", type: "behavioral" },
    { q: "If a page is loading slowly and the Core Web Vitals are poor, what steps would you take to diagnose and fix it?", type: "situational" },
    { q: "What is the difference between controlled and uncontrolled components in React?", type: "technical" },
    { q: "How do you decide between using local state, context, or a state management library?", type: "technical" },
  ],
  'Backend Developer': [
    { q: "Explain the difference between SQL and NoSQL databases. When would you choose one over the other?", type: "technical" },
    { q: "Describe a situation where you had to handle a production incident. What was your process?", type: "behavioral" },
    { q: "You notice the API response time has increased from 200ms to 2 seconds. How would you investigate?", type: "situational" },
    { q: "What is middleware in Express.js and how does the request pipeline work?", type: "technical" },
    { q: "How would you implement rate limiting for a public API endpoint?", type: "technical" },
  ],
  'Full Stack Developer': [
    { q: "How do you handle authentication and authorization in a full-stack application?", type: "technical" },
    { q: "Tell me about the most complex feature you've built end-to-end. What were the challenges?", type: "behavioral" },
    { q: "Your app's database starts running out of connections during peak traffic. What do you do?", type: "situational" },
    { q: "Explain how CORS works and why it exists.", type: "technical" },
    { q: "What's your approach to structuring a monorepo with both frontend and backend code?", type: "technical" },
  ],
  'default': [
    { q: "Tell me about yourself and why you're interested in software development.", type: "behavioral" },
    { q: "What programming languages are you most comfortable with, and why?", type: "technical" },
    { q: "A teammate pushes code that breaks the build right before a deadline. How do you handle it?", type: "situational" },
    { q: "Explain the concept of version control and why it's important.", type: "technical" },
    { q: "Where do you see yourself as a developer in 2 years?", type: "behavioral" },
  ]
};

function getFallbackResponse(role, messageCount, lastAnswer) {
  const bank = QUESTION_BANK[role] || QUESTION_BANK['default'];
  const questionIndex = Math.floor(messageCount / 2);

  if (questionIndex >= bank.length) {
    return {
      feedback: lastAnswer ? "Good response. You showed thoughtful consideration of the topic." : "",
      next_question: "",
      question_type: "summary",
      is_complete: true,
      final_score: 68,
      final_feedback: `You completed the mock interview for the ${role} role. Your answers demonstrated foundational knowledge with room for growth in articulating technical depth. Focus on providing specific examples and quantifying your impact in future interviews.`,
      strengths: ["Clear communication", "Willingness to learn"],
      improvements: ["Add more specific technical details", "Use the STAR method for behavioral questions"],
      tips: []
    };
  }

  const question = bank[questionIndex];
  return {
    feedback: lastAnswer ? "Solid answer. Try to include more specific examples next time." : "",
    next_question: question.q,
    question_type: question.type,
    is_complete: false,
    tips: questionIndex === 0 ? ["Take a moment to structure your thoughts before answering"] : []
  };
}

// POST /api/interview/start - Start a new mock interview
router.post('/start', authenticateToken, requirePlan(3), async (req, res, next) => {
  try {
    const { role } = req.body;
    const targetRole = role || 'Full Stack Developer';

    const userPrompt = `Start a mock interview for the role: ${targetRole}. This is the first question - ask an engaging opening question appropriate for a fresher/junior candidate.`;

    const aiResult = await callAI({
      systemPrompt: INTERVIEWER_PROMPT,
      userPrompt,
      maxTokens: 500,
      model: process.env.LM_STUDIO_MODEL_INTERVIEW
    });

    let response;
    let aiPowered = false;

    if (aiResult.ok) {
      const parsed = extractJSON(aiResult.data);
      if (parsed && parsed.next_question) {
        response = parsed;
        aiPowered = true;
      } else {
        response = getFallbackResponse(targetRole, 0, null);
      }
    } else {
      response = getFallbackResponse(targetRole, 0, null);
    }

    // Save initial interview session
    const messages = [
      { role: 'interviewer', content: response.next_question, type: response.question_type }
    ];

    const result = await pool.query(
      'INSERT INTO mock_interviews (user_id, role, messages, score) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.user.id, targetRole, JSON.stringify(messages), 0]
    );

    res.json({
      success: true,
      data: {
        interviewId: result.rows[0].id,
        question: response.next_question,
        question_type: response.question_type,
        tips: response.tips || [],
        is_complete: false,
        ai_powered: aiPowered
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/interview/:id/respond - Send a response
router.post('/:id/respond', authenticateToken, async (req, res, next) => {
  try {
    const { answer } = req.body;
    const interviewId = req.params.id;

    if (!answer || answer.trim().length === 0) {
      return res.status(400).json({ error: 'Answer is required' });
    }

    // Fetch existing interview
    const rows = await pool.query(
      'SELECT * FROM mock_interviews WHERE id = $1 AND user_id = $2',
      [interviewId, req.user.id]
    );

    if (rows.rows.length === 0) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    const interview = rows.rows[0];
    const messages = typeof interview.messages === 'string'
      ? JSON.parse(interview.messages) : interview.messages;

    // Add user's answer
    messages.push({ role: 'candidate', content: answer });

    // Build conversation for AI
    const conversationHistory = messages.map(m =>
      `${m.role === 'interviewer' ? 'Interviewer' : 'Candidate'}: ${m.content}`
    ).join('\n');

    const userPrompt = `Interview for: ${interview.role}\n\nConversation so far:\n${conversationHistory}\n\nThe candidate has answered ${Math.floor(messages.length / 2)} questions so far. ${messages.length >= 10 ? 'This should be the final question - wrap up the interview.' : 'Continue the interview.'}`;

    const aiResult = await callAI({ systemPrompt: INTERVIEWER_PROMPT, userPrompt, maxTokens: 800 });

    let response;
    let aiPowered = false;

    if (aiResult.ok) {
      const parsed = extractJSON(aiResult.data);
      if (parsed && (parsed.next_question || parsed.is_complete)) {
        response = parsed;
        aiPowered = true;
      } else {
        response = getFallbackResponse(interview.role, messages.length, answer);
      }
    } else {
      response = getFallbackResponse(interview.role, messages.length, answer);
    }

    // Add interviewer response
    if (response.feedback) {
      messages.push({ role: 'interviewer', content: response.feedback, type: 'feedback' });
    }
    if (response.next_question) {
      messages.push({ role: 'interviewer', content: response.next_question, type: response.question_type });
    }

    // Update database
    const score = response.is_complete ? (response.final_score || 70) : 0;
    const feedback = response.is_complete ? JSON.stringify({
      final_feedback: response.final_feedback,
      strengths: response.strengths,
      improvements: response.improvements,
      score: response.final_score
    }) : null;

    await pool.query(
      'UPDATE mock_interviews SET messages = $1, score = $2, feedback = $3 WHERE id = $4',
      [JSON.stringify(messages), score, feedback, interviewId]
    );

    res.json({
      success: true,
      data: {
        feedback: response.feedback || '',
        question: response.next_question || '',
        question_type: response.question_type || '',
        tips: response.tips || [],
        is_complete: response.is_complete || false,
        final_score: response.final_score,
        final_feedback: response.final_feedback,
        strengths: response.strengths,
        improvements: response.improvements,
        ai_powered: aiPowered
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/interview/history
router.get('/history', authenticateToken, async (req, res, next) => {
  try {
    const rows = await pool.query(
      'SELECT id, role, score, created_at FROM mock_interviews WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [req.user.id]
    );
    res.json({ success: true, data: rows.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
