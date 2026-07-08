/**
 * Community & Communication Skills Routes
 *
 * Community features: Discussion forums, study groups, events, leaderboard.
 * Communication skills: Resume presentation practice, email analysis, HR communication.
 *
 * Forums/groups   => requirePlan(1) — "Learn & Build"
 * Communication   => requirePlan(2) — "Tune & Polish"
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { callAI, extractJSON } = require('../utils/aiClient');
const { pool } = require('../config/database');

// ── Ensure tables exist ─────────────────────────────────────────────────────
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS community_threads (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL,
        author_name VARCHAR(255) DEFAULT 'Anonymous',
        title       VARCHAR(500) NOT NULL,
        body        TEXT NOT NULL,
        category    VARCHAR(100) NOT NULL DEFAULT 'general',
        tags        JSONB DEFAULT '[]',
        votes       INTEGER DEFAULT 0,
        views       INTEGER DEFAULT 0,
        reply_count INTEGER DEFAULT 0,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS community_replies (
        id          SERIAL PRIMARY KEY,
        thread_id   INTEGER NOT NULL REFERENCES community_threads(id) ON DELETE CASCADE,
        user_id     INTEGER NOT NULL,
        author_name VARCHAR(255) DEFAULT 'Anonymous',
        body        TEXT NOT NULL,
        votes       INTEGER DEFAULT 0,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS community_votes (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL,
        thread_id   INTEGER,
        reply_id    INTEGER,
        direction   VARCHAR(4) NOT NULL CHECK (direction IN ('up', 'down')),
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, thread_id, reply_id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS study_groups (
        id            SERIAL PRIMARY KEY,
        creator_id    INTEGER NOT NULL,
        name          VARCHAR(255) NOT NULL,
        topic         VARCHAR(255) NOT NULL,
        description   TEXT DEFAULT '',
        max_members   INTEGER DEFAULT 30,
        member_count  INTEGER DEFAULT 1,
        active        BOOLEAN DEFAULT true,
        color         VARCHAR(20) DEFAULT '#6366f1',
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS community_events (
        id              SERIAL PRIMARY KEY,
        title           VARCHAR(500) NOT NULL,
        description     TEXT DEFAULT '',
        event_date      DATE NOT NULL,
        event_type      VARCHAR(100) DEFAULT 'Workshop',
        participant_count INTEGER DEFAULT 0,
        color           VARCHAR(20) DEFAULT '#3b82f6',
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    console.error('Community table migration error:', err.message);
  }
})();

// ─────────────────────────────────────────────────────────────────────────────
// Fallback Data
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_CATEGORIES = [
  { id: 'general', name: 'General', threadCount: 24 },
  { id: 'frontend', name: 'Frontend', threadCount: 18 },
  { id: 'backend', name: 'Backend', threadCount: 15 },
  { id: 'dsa', name: 'DSA', threadCount: 31 },
  { id: 'placements', name: 'Placements', threadCount: 22 },
  { id: 'projects', name: 'Projects', threadCount: 12 },
  { id: 'career-advice', name: 'Career Advice', threadCount: 9 },
];

const FALLBACK_THREADS = [
  { id: 1, title: 'Best resources for learning React hooks in 2026?', author_name: 'Arjun Mehta', category: 'frontend', tags: ['react', 'hooks'], replies: 14, views: 230, votes: 23, created_at: '2026-06-25T10:30:00Z', body: 'I have been trying to master React hooks but find useReducer and custom hooks confusing. What resources helped you the most?' },
  { id: 2, title: 'How I cleared Amazon SDE-1 in 3 months', author_name: 'Priya Sharma', category: 'placements', tags: ['amazon', 'interview'], replies: 28, views: 892, votes: 67, created_at: '2026-06-24T08:15:00Z', body: 'Sharing my complete preparation strategy that helped me crack the Amazon interview.' },
  { id: 3, title: 'System Design basics for freshers', author_name: 'Rahul Gupta', category: 'backend', tags: ['system-design', 'freshers'], replies: 9, views: 156, votes: 15, created_at: '2026-06-23T14:00:00Z', body: 'Where should I begin with system design without jumping to advanced topics?' },
  { id: 4, title: 'DP roadmap for competitive programming', author_name: 'Sneha Patel', category: 'dsa', tags: ['dp', 'competitive'], replies: 21, views: 445, votes: 38, created_at: '2026-06-22T19:45:00Z', body: 'My curated roadmap for mastering DP problems organized from easy to hard.' },
  { id: 5, title: 'Should I learn Next.js or Remix?', author_name: 'Karan Singh', category: 'frontend', tags: ['nextjs', 'remix'], replies: 11, views: 178, votes: 12, created_at: '2026-06-21T11:20:00Z', body: 'Building my portfolio website and confused between Next.js and Remix.' },
];

const FALLBACK_GROUPS = [
  { id: 1, name: 'DSA Daily Grind', topic: 'Data Structures & Algorithms', member_count: 48, max_members: 50, active: true, color: '#f59e0b' },
  { id: 2, name: 'Full Stack Builders', topic: 'MERN Stack Projects', member_count: 32, max_members: 40, active: true, color: '#3b82f6' },
  { id: 3, name: 'Placement Prep 2026', topic: 'Campus Placements', member_count: 65, max_members: 100, active: true, color: '#ef4444' },
  { id: 4, name: 'ML/AI Explorers', topic: 'Machine Learning', member_count: 27, max_members: 30, active: false, color: '#8b5cf6' },
];

const FALLBACK_EVENTS = [
  { id: 1, title: 'CodeSprint 2026 - National Hackathon', event_date: '2026-07-15', event_type: 'Hackathon', participant_count: 342, color: '#ef4444' },
  { id: 2, title: 'Weekly DSA Contest #47', event_date: '2026-06-29', event_type: 'Contest', participant_count: 128, color: '#f59e0b' },
  { id: 3, title: 'Resume Workshop by Google Engineer', event_date: '2026-07-05', event_type: 'Workshop', participant_count: 89, color: '#3b82f6' },
];

const FALLBACK_LEADERBOARD = [
  { rank: 1, name: 'Priya Sharma', points: 2840, badges: 12, streak: 45 },
  { rank: 2, name: 'Arjun Mehta', points: 2650, badges: 10, streak: 38 },
  { rank: 3, name: 'Sneha Patel', points: 2490, badges: 11, streak: 32 },
  { rank: 4, name: 'Vikram Joshi', points: 2210, badges: 9, streak: 28 },
  { rank: 5, name: 'Meera Iyer', points: 1980, badges: 8, streak: 21 },
  { rank: 6, name: 'Rahul Gupta', points: 1870, badges: 7, streak: 19 },
  { rank: 7, name: 'Karan Singh', points: 1650, badges: 6, streak: 15 },
  { rank: 8, name: 'Nisha Kumar', points: 1520, badges: 6, streak: 12 },
  { rank: 9, name: 'Dev Patel', points: 1340, badges: 5, streak: 10 },
  { rank: 10, name: 'Ananya Roy', points: 1180, badges: 4, streak: 8 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Forum Routes
// ─────────────────────────────────────────────────────────────────────────────

// GET /forums — list forum categories with thread counts
router.get('/forums', authenticateToken, requirePlan(1), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT category, COUNT(*) as thread_count
      FROM community_threads
      GROUP BY category
      ORDER BY thread_count DESC
    `);
    if (result.rows.length > 0) {
      const categories = FALLBACK_CATEGORIES.map(cat => {
        const dbCat = result.rows.find(r => r.category === cat.id);
        return { ...cat, threadCount: dbCat ? parseInt(dbCat.thread_count) : cat.threadCount };
      });
      return res.json({ categories });
    }
    res.json({ categories: FALLBACK_CATEGORIES });
  } catch (err) {
    console.error('GET /forums error:', err.message);
    res.json({ categories: FALLBACK_CATEGORIES });
  }
});

// GET /forums/:category — list threads in a category
router.get('/forums/:category', authenticateToken, requirePlan(1), async (req, res) => {
  const { category } = req.params;
  const page = parseInt(req.query.page) || 1;
  const sort = req.query.sort || 'newest';
  const limit = 20;
  const offset = (page - 1) * limit;

  const SORT_MAP = { popular: 'votes DESC', active: 'reply_count DESC', newest: 'created_at DESC' };
  const orderBy = SORT_MAP[sort] || SORT_MAP.newest;

  try {
    const result = await pool.query(
      `SELECT * FROM community_threads WHERE category = $1 ORDER BY ${orderBy} LIMIT $2 OFFSET $3`,
      [category, limit, offset]
    );
    if (result.rows.length > 0) {
      return res.json({ threads: result.rows, page, hasMore: result.rows.length === limit });
    }
    const filtered = FALLBACK_THREADS.filter(t => t.category === category);
    res.json({ threads: filtered, page: 1, hasMore: false });
  } catch (err) {
    console.error('GET /forums/:category error:', err.message);
    const filtered = FALLBACK_THREADS.filter(t => t.category === category);
    res.json({ threads: filtered, page: 1, hasMore: false });
  }
});

// GET /forums/thread/:id — get thread with replies
router.get('/forums/thread/:id', authenticateToken, requirePlan(1), async (req, res) => {
  const { id } = req.params;
  try {
    const threadResult = await pool.query('SELECT * FROM community_threads WHERE id = $1', [id]);
    if (threadResult.rows.length === 0) {
      // Return fallback thread
      const fallback = FALLBACK_THREADS.find(t => t.id === parseInt(id));
      if (fallback) return res.json({ thread: fallback, replies: [] });
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Increment view count
    await pool.query('UPDATE community_threads SET views = views + 1 WHERE id = $1', [id]);

    const repliesResult = await pool.query(
      'SELECT * FROM community_replies WHERE thread_id = $1 ORDER BY created_at ASC',
      [id]
    );
    res.json({ thread: threadResult.rows[0], replies: repliesResult.rows });
  } catch (err) {
    console.error('GET /forums/thread/:id error:', err.message);
    const fallback = FALLBACK_THREADS.find(t => t.id === parseInt(id));
    res.json({ thread: fallback || FALLBACK_THREADS[0], replies: [] });
  }
});

// POST /forums/thread — create new thread
router.post('/forums/thread', authenticateToken, requirePlan(1), async (req, res) => {
  const { title, body, category, tags } = req.body;
  if (!title || !body || typeof title !== 'string' || typeof body !== 'string') {
    return res.status(400).json({ error: 'Title and body are required' });
  }

  const VALID_CATEGORIES = ['general', 'frontend', 'backend', 'dsa', 'placements', 'projects', 'career-advice'];
  const safeCategory = VALID_CATEGORIES.includes(category) ? category : 'general';
  const safeTags = Array.isArray(tags) ? tags.filter(t => typeof t === 'string').map(t => t.slice(0, 50)).slice(0, 10) : [];

  try {
    const userResult = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
    const authorName = userResult.rows[0]?.full_name || 'Anonymous';

    const result = await pool.query(
      `INSERT INTO community_threads (user_id, author_name, title, body, category, tags)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.id, authorName, title.slice(0, 500), body.slice(0, 5000), safeCategory, JSON.stringify(safeTags)]
    );
    res.json({ thread: result.rows[0] });
  } catch (err) {
    console.error('POST /forums/thread error:', err.message);
    res.status(500).json({ error: 'Failed to create thread' });
  }
});

// POST /forums/thread/:id/reply — reply to a thread
router.post('/forums/thread/:id/reply', authenticateToken, requirePlan(1), async (req, res) => {
  const { id } = req.params;
  const { body } = req.body;
  if (!body || typeof body !== 'string') return res.status(400).json({ error: 'Reply body is required' });

  try {
    const userResult = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
    const authorName = userResult.rows[0]?.full_name || 'Anonymous';

    const result = await pool.query(
      `INSERT INTO community_replies (thread_id, user_id, author_name, body)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, req.user.id, authorName, body.slice(0, 5000)]
    );

    // Update reply count
    await pool.query('UPDATE community_threads SET reply_count = reply_count + 1 WHERE id = $1', [id]);

    res.json({ reply: result.rows[0] });
  } catch (err) {
    console.error('POST /forums/thread/:id/reply error:', err.message);
    res.status(500).json({ error: 'Failed to post reply' });
  }
});

// POST /forums/thread/:id/vote — vote on a thread
router.post('/forums/thread/:id/vote', authenticateToken, requirePlan(1), async (req, res) => {
  const { id } = req.params;
  const { direction } = req.body;
  if (!['up', 'down'].includes(direction)) {
    return res.status(400).json({ error: 'Direction must be "up" or "down"' });
  }

  try {
    // Check for existing vote
    const existing = await pool.query(
      'SELECT * FROM community_votes WHERE user_id = $1 AND thread_id = $2 AND reply_id IS NULL',
      [req.user.id, id]
    );

    if (existing.rows.length > 0) {
      if (existing.rows[0].direction === direction) {
        return res.json({ message: 'Already voted' });
      }
      // Change vote direction
      await pool.query('UPDATE community_votes SET direction = $1 WHERE id = $2', [direction, existing.rows[0].id]);
      const delta = direction === 'up' ? 2 : -2;
      await pool.query('UPDATE community_threads SET votes = votes + $1 WHERE id = $2', [delta, id]);
    } else {
      await pool.query(
        'INSERT INTO community_votes (user_id, thread_id, direction) VALUES ($1, $2, $3)',
        [req.user.id, id, direction]
      );
      const delta = direction === 'up' ? 1 : -1;
      await pool.query('UPDATE community_threads SET votes = votes + $1 WHERE id = $2', [delta, id]);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('POST /forums/thread/:id/vote error:', err.message);
    res.json({ success: true }); // Don't fail the UI
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Study Groups Routes
// ─────────────────────────────────────────────────────────────────────────────

// GET /groups — list study groups
router.get('/groups', authenticateToken, requirePlan(1), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM study_groups ORDER BY created_at DESC LIMIT 20');
    if (result.rows.length > 0) {
      return res.json({ groups: result.rows });
    }
    res.json({ groups: FALLBACK_GROUPS });
  } catch (err) {
    console.error('GET /groups error:', err.message);
    res.json({ groups: FALLBACK_GROUPS });
  }
});

// POST /groups — create study group
router.post('/groups', authenticateToken, requirePlan(1), async (req, res) => {
  const { name, topic, description, maxMembers } = req.body;
  if (!name || !topic) {
    return res.status(400).json({ error: 'Name and topic are required' });
  }

  const colors = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
  const color = colors[Math.floor(Math.random() * colors.length)];

  try {
    const result = await pool.query(
      `INSERT INTO study_groups (creator_id, name, topic, description, max_members, color)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.id, name.slice(0, 255), topic.slice(0, 255), (description || '').slice(0, 2000), maxMembers || 30, color]
    );
    res.json({ group: result.rows[0] });
  } catch (err) {
    console.error('POST /groups error:', err.message);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Events Routes
// ─────────────────────────────────────────────────────────────────────────────

// GET /events — list upcoming events
router.get('/events', authenticateToken, requirePlan(1), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM community_events WHERE event_date >= CURRENT_DATE ORDER BY event_date ASC LIMIT 20`
    );
    if (result.rows.length > 0) {
      return res.json({ events: result.rows });
    }
    res.json({ events: FALLBACK_EVENTS });
  } catch (err) {
    console.error('GET /events error:', err.message);
    res.json({ events: FALLBACK_EVENTS });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard Routes
// ─────────────────────────────────────────────────────────────────────────────

// GET /leaderboard — get leaderboard
router.get('/leaderboard', authenticateToken, requirePlan(1), async (req, res) => {
  // For now, return curated fallback data.
  // In production, aggregate from user activity tables.
  res.json({ leaderboard: FALLBACK_LEADERBOARD });
});

// ─────────────────────────────────────────────────────────────────────────────
// Communication Skills Routes
// ─────────────────────────────────────────────────────────────────────────────

const PRACTICE_SYSTEM_PROMPT = `You are an expert communication coach specializing in professional workplace communication for university students and fresh graduates.

Evaluate the user's writing and return ONLY valid JSON in this exact format:
{
  "overallScore": <number 0-100>,
  "clarity": { "score": <number 0-100>, "feedback": "<1-2 sentences>" },
  "professionalism": { "score": <number 0-100>, "feedback": "<1-2 sentences>" },
  "impact": { "score": <number 0-100>, "feedback": "<1-2 sentences>" },
  "suggestions": ["<suggestion 1>", "<suggestion 2>", "<suggestion 3>", "<suggestion 4>"]
}

Rules:
- Be constructive and encouraging while being honest about areas for improvement.
- Score strictly: 90+ = exceptional, 70-89 = good, 50-69 = needs improvement, below 50 = significant issues.
- Each suggestion should be specific and actionable.
- Tailor feedback to the scenario context provided.`;

const HR_SYSTEM_PROMPT = `You are an expert HR communication coach for university students entering the workforce.

Evaluate the user's HR-related message and return ONLY valid JSON in this exact format:
{
  "overallScore": <number 0-100>,
  "appropriateness": { "score": <number 0-100>, "feedback": "<1-2 sentences>" },
  "professionalism": { "score": <number 0-100>, "feedback": "<1-2 sentences>" },
  "suggestions": ["<suggestion 1>", "<suggestion 2>", "<suggestion 3>", "<suggestion 4>"],
  "improvedVersion": "<improved version of their message>"
}

Rules:
- Be constructive but honest about professionalism gaps.
- The improved version should maintain the user's intent but elevate the language and structure.
- Consider the specific HR scenario context when evaluating.`;

const EMAIL_SYSTEM_PROMPT = `You are an expert professional email writing coach for university students.

Analyze the user's email and return ONLY valid JSON in this exact format:
{
  "overallScore": <number 0-100>,
  "tone": { "score": <number 0-100>, "feedback": "<1-2 sentences>" },
  "grammar": { "score": <number 0-100>, "feedback": "<1-2 sentences>" },
  "professionalism": { "score": <number 0-100>, "feedback": "<1-2 sentences>" },
  "structure": { "score": <number 0-100>, "feedback": "<1-2 sentences>" },
  "subjectLine": { "score": <number 0-100>, "feedback": "<1-2 sentences>" },
  "improvedVersion": "<complete improved version of their email>"
}

Rules:
- Be specific about what can be improved in each category.
- The improved version should be a complete, ready-to-send email.
- Consider the email template type (follow-up, thank you, inquiry, application, networking) when evaluating.
- Score the subject line even if absent — provide guidance on what a good subject would be.`;

// Fallback feedback generators
function generateFallbackPracticeFeedback(content, scenario) {
  const wordCount = content.split(/\s+/).length;
  const hasNumbers = /\d/.test(content);
  const hasPunctuation = /[.!?]/.test(content);
  const baseScore = Math.min(85, 40 + Math.floor(wordCount / 3) + (hasNumbers ? 10 : 0) + (hasPunctuation ? 5 : 0));

  return {
    overallScore: baseScore,
    clarity: { score: baseScore + 2, feedback: 'Your presentation has a clear structure. Consider adding a stronger opening that immediately captures attention.' },
    professionalism: { score: baseScore - 3, feedback: 'Good professional tone overall. Use more specific action verbs and quantify your achievements where possible.' },
    impact: { score: baseScore - 5, feedback: 'To increase impact, lead with your strongest achievement and connect your experience directly to the role requirements.' },
    suggestions: [
      'Open with your most impressive accomplishment or unique value proposition.',
      'Include at least 2-3 quantifiable achievements (percentages, numbers, timeframes).',
      'Practice the STAR method: Situation, Task, Action, Result for key experiences.',
      'End with a clear statement about what you bring to the role and your enthusiasm.',
    ],
  };
}

function generateFallbackEmailFeedback(email, subject, template) {
  const wordCount = email.split(/\s+/).length;
  const hasGreeting = /^(dear|hi|hello|good\s)/im.test(email);
  const hasClosing = /(regards|sincerely|best|thank)/im.test(email);
  const baseScore = Math.min(80, 35 + Math.floor(wordCount / 5) + (hasGreeting ? 10 : 0) + (hasClosing ? 10 : 0));

  return {
    overallScore: baseScore,
    tone: { score: baseScore + 3, feedback: 'Your tone is generally appropriate. For a professional email, consider using slightly more formal language.' },
    grammar: { score: baseScore + 5, feedback: 'Grammar is adequate. Proofread for run-on sentences and ensure consistent verb tense throughout.' },
    professionalism: { score: baseScore - 2, feedback: hasGreeting && hasClosing ? 'Good use of greeting and closing.' : 'Include a proper salutation and professional closing with your full name.' },
    structure: { score: baseScore - 4, feedback: 'Organize your email into three clear sections: purpose, details, and call to action.' },
    subjectLine: { score: subject ? baseScore : 30, feedback: subject ? 'Consider making your subject line more specific with the position title or key detail.' : 'Always include a subject line. It should be specific and under 60 characters.' },
    improvedVersion: `Dear [Recipient's Name],\n\nI hope this message finds you well. [Purpose of your email in one clear sentence.]\n\n[Key details — your experience, the specific opportunity, or relevant context. Be concise and specific.]\n\n[Clear call to action — what you would like the recipient to do next.]\n\nThank you for your time and consideration.\n\nBest regards,\n[Your Full Name]\n[Your Contact Information]`,
  };
}

function generateFallbackHRFeedback(content, scenario) {
  const wordCount = content.split(/\s+/).length;
  const baseScore = Math.min(78, 40 + Math.floor(wordCount / 4));

  return {
    overallScore: baseScore,
    appropriateness: { score: baseScore + 2, feedback: 'Your message addresses the situation adequately. Be more direct about your specific request while maintaining respectful language.' },
    professionalism: { score: baseScore - 2, feedback: 'Good professional language. Include specific dates, relevant details, and a clear ask to strengthen the message.' },
    suggestions: [
      'State your purpose clearly in the opening sentence.',
      'Provide necessary context without over-explaining.',
      'Include specific dates, numbers, or details relevant to your request.',
      'End with a professional closing and express willingness to discuss further.',
    ],
    improvedVersion: 'Dear [Manager/HR],\n\nI am writing to [state purpose clearly]. [Provide relevant context in 1-2 sentences.]\n\n[Specific details: dates, amounts, or actions requested.]\n\nI am happy to discuss this further at your convenience. Thank you for your time.\n\nBest regards,\n[Your Name]',
  };
}

// POST /communication/practice — practice communication (resume presentation, HR)
router.post('/communication/practice', authenticateToken, requirePlan(2), async (req, res) => {
  const { type, content, scenario } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Content is required' });
  }

  const trimmedContent = content.trim().slice(0, 5000);

  if (type === 'hr-communication') {
    try {
      const raw = await callAI({
        systemPrompt: HR_SYSTEM_PROMPT,
        userPrompt: `HR Scenario: ${scenario || 'General'}\n\nUser's message:\n${trimmedContent}`,
        maxTokens: 1024,
        temperature: 0.4,
        structuredJson: true,
      });
      const feedback = extractJSON(raw);
      if (feedback && feedback.overallScore) {
        return res.json({ feedback });
      }
      throw new Error('Invalid AI response');
    } catch (err) {
      console.error('Communication practice (HR) AI error:', err.message);
      return res.json({ feedback: generateFallbackHRFeedback(trimmedContent, scenario) });
    }
  }

  // Default: resume-presentation
  try {
    const raw = await callAI({
      systemPrompt: PRACTICE_SYSTEM_PROMPT,
      userPrompt: `Scenario: ${scenario || 'Present your resume'}\n\nUser's presentation:\n${trimmedContent}`,
      maxTokens: 1024,
      temperature: 0.4,
      structuredJson: true,
    });
    const feedback = extractJSON(raw);
    if (feedback && feedback.overallScore) {
      return res.json({ feedback });
    }
    throw new Error('Invalid AI response');
  } catch (err) {
    console.error('Communication practice AI error:', err.message);
    res.json({ feedback: generateFallbackPracticeFeedback(trimmedContent, scenario) });
  }
});

// POST /communication/email — analyze email
router.post('/communication/email', authenticateToken, requirePlan(2), async (req, res) => {
  const { email, subject, template } = req.body;
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'Email content is required' });
  }

  const trimmedEmail = email.trim().slice(0, 5000);

  try {
    const raw = await callAI({
      systemPrompt: EMAIL_SYSTEM_PROMPT,
      userPrompt: `Email Type: ${template || 'general'}\nSubject Line: ${subject || '(none provided)'}\n\nEmail Body:\n${trimmedEmail}`,
      maxTokens: 1200,
      temperature: 0.4,
      structuredJson: true,
    });
    const analysis = extractJSON(raw);
    if (analysis && analysis.overallScore) {
      return res.json({ analysis });
    }
    throw new Error('Invalid AI response');
  } catch (err) {
    console.error('Email analysis AI error:', err.message);
    res.json({ analysis: generateFallbackEmailFeedback(trimmedEmail, subject, template) });
  }
});

module.exports = router;
