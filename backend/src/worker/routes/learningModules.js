'use strict';

/**
 * Worker port of backend/src/routes/learningModules.js (mounted at /api/learning-modules).
 * Endpoints, in Express registration order (order matters: '/tracks' before '/:trackId'):
 *   GET  /tracks                       authenticateToken
 *   GET  /:trackId                     authenticateToken
 *   GET  /:trackId/:moduleId           authenticateToken
 *   POST /knowledge-check              authenticateToken
 *   POST /module-assessment            authenticateToken + requirePlan(3)
 *   POST /module-assessment/submit     authenticateToken + requirePlan(3)
 *
 * Changes vs Express (platform-forced only): callAI/extractJSON -> the injected aiClient service;
 * req/res -> Hono context; the two static JSON data files (src/data/modules.json, questions.json, ~1 MB)
 * are still loaded with a literal require (esbuild inlines them at build time) but lazily, inside
 * accessor functions, so the Worker does not evaluate them at startup for every request.
 * Preserved as-is: shuffles use Math.random per request, 'constructor'/'toString' track ids reach
 * track.modules and fail with a masked 500 (plain-object lookup, as in Express), all messages.
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { getServices } = require('../lib/context');
const { getBody } = require('../lib/http');

const router = createRouter();

// Static, immutable data bundled at build time. Literal paths only (no dynamic require).
const getModulesData = () => require('../../data/modules.json');
const getQuestionsData = () => require('../../data/questions.json');

// ── GET /tracks — list available learning tracks ────────────────────────────
router.get('/tracks', authenticateToken, (c) => {
  const tracks = Object.values(getModulesData()).map(track => ({
    id: track.id,
    name: track.name,
    icon: track.icon,
    skills: track.skills,
    moduleCount: track.moduleCount,
    totalSubtopics: track.modules.reduce((sum, m) => sum + m.subtopics.length, 0),
    estimatedHours: track.modules.reduce((sum, m) => sum + m.estimatedHours, 0),
  }));
  return c.json({ tracks });
});

// ── GET /:trackId — get all modules for a track (without full content) ──────
router.get('/:trackId', authenticateToken, (c) => {
  const track = getModulesData()[c.req.param('trackId')];
  if (!track) return c.json({ error: 'Track not found' }, 404);

  const modules = track.modules.map(m => ({
    id: m.id,
    topic: m.topic,
    order: m.order,
    description: m.description,
    subtopicCount: m.subtopics.length,
    estimatedHours: m.estimatedHours,
    prerequisites: m.prerequisites,
  }));

  return c.json({
    id: track.id,
    name: track.name,
    icon: track.icon,
    skills: track.skills,
    modules,
  });
});

// ── GET /:trackId/:moduleId — get full module content ───────────────────────
router.get('/:trackId/:moduleId', authenticateToken, (c) => {
  const track = getModulesData()[c.req.param('trackId')];
  if (!track) return c.json({ error: 'Track not found' }, 404);

  const mod = track.modules.find(m => m.id === c.req.param('moduleId'));
  if (!mod) return c.json({ error: 'Module not found' }, 404);

  return c.json(mod);
});

// ── POST /knowledge-check — MCQ verification for claimed skills ─────────────
router.post('/knowledge-check', authenticateToken, (c) => {
  const { skills } = getBody(c);
  if (!Array.isArray(skills) || skills.length === 0) {
    return c.json({ error: 'skills array is required' }, 400);
  }

  const SKILL_TO_GROUP = {
    html: 'frontend', css: 'frontend', javascript: 'javascript',
    react: 'react', vue: 'frontend', angular: 'frontend',
    typescript: 'javascript', nodejs: 'nodejs', express: 'nodejs',
    python: 'backend', java: 'backend', sql: 'backend',
    git: 'frontend', docker: 'devops', aws: 'devops',
    rest: 'backend', graphql: 'backend', mongodb: 'backend',
    'data structures': 'full-stack', algorithms: 'full-stack',
    'system design': 'full-stack', testing: 'frontend',
  };

  const result = [];

  for (const skill of skills) {
    const normalizedSkill = skill.toLowerCase().trim();
    const group = SKILL_TO_GROUP[normalizedSkill] || 'full-stack';

    const groupQuestions = getQuestionsData().filter(q => q.group === group);
    if (groupQuestions.length === 0) continue;

    const shuffled = [...groupQuestions].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 3);

    const mcqs = selected.map((q, i) => {
      const correctSnippet = q.answer.split('\n').filter(l => l.trim())[0]?.substring(0, 200) || q.answer.substring(0, 200);

      const distractors = generateDistractors(q.question, correctSnippet);

      const options = [correctSnippet, ...distractors].sort(() => Math.random() - 0.5);
      const correctIndex = options.indexOf(correctSnippet);

      return {
        id: `${normalizedSkill}-kc-${i}`,
        skill: skill,
        question: q.question,
        options,
        correct: correctIndex,
        difficulty: q.difficulty,
      };
    });

    result.push({ skill, questions: mcqs });
  }

  return c.json({ checks: result });
});

function generateDistractors(question, correctAnswer) {
  const genericDistractors = [
    [
      'It is a deprecated feature that is no longer used in modern development.',
      'It refers to a server-side rendering technique used only in Java.',
      'It is a CSS property for controlling font rendering.',
    ],
    [
      'It is primarily used for database migration scripts.',
      'It is a build tool for compiling TypeScript to WebAssembly.',
      'It is a testing framework specific to mobile applications.',
    ],
    [
      'It handles memory allocation at the hardware level.',
      'It is a network protocol used exclusively for IoT devices.',
      'It is a design pattern that was replaced by microservices.',
    ],
  ];

  const set = genericDistractors[Math.floor(Math.random() * genericDistractors.length)];
  return set;
}

// ── POST /module-assessment — generate assessment for a module ───────────────
router.post('/module-assessment', authenticateToken, requirePlan(3), async (c) => {
  const { aiClient } = getServices(c);
  try {
    const { moduleId, topics, difficulty = 'beginner' } = getBody(c);
    if (!moduleId || !Array.isArray(topics) || topics.length === 0) {
      return c.json({ error: 'moduleId and topics array are required' }, 400);
    }

    const topicsList = topics.join(', ');

    const systemPrompt = `You are a technical assessment creator for a coding bootcamp. Create assessment questions that test understanding of specific topics that students have just learned.

RULES:
- Questions must ONLY test the listed topics — nothing outside scope
- Include a mix of conceptual understanding and practical application
- For coding questions, provide starter code and test cases
- Be specific — "What does X do?" not "Tell me about X"
- Difficulty: ${difficulty}

Return ONLY valid JSON (no markdown fences):
{
  "questions": [
    {"id": "q1", "type": "mcq", "text": "question text", "options": ["A", "B", "C", "D"], "correct": 0, "topic": "topic name", "explanation": "why this is correct"},
    {"id": "q2", "type": "mcq", "text": "question text", "options": ["A", "B", "C", "D"], "correct": 1, "topic": "topic name", "explanation": "why"},
    {"id": "q3", "type": "mcq", "text": "question text", "options": ["A", "B", "C", "D"], "correct": 2, "topic": "topic name", "explanation": "why"},
    {"id": "q4", "type": "mcq", "text": "question text", "options": ["A", "B", "C", "D"], "correct": 0, "topic": "topic name", "explanation": "why"},
    {"id": "q5", "type": "short-answer", "text": "question text", "correctKeywords": ["keyword1", "keyword2"], "topic": "topic name", "explanation": "expected answer"},
    {"id": "q6", "type": "short-answer", "text": "question text", "correctKeywords": ["keyword1", "keyword2"], "topic": "topic name", "explanation": "expected answer"},
    {"id": "q7", "type": "system-design", "text": "How would you design/structure X? Explain your approach.", "correctKeywords": ["keyword1", "keyword2", "keyword3"], "topic": "topic name", "explanation": "ideal approach"},
    {"id": "q8", "type": "coding", "text": "Write a function that...", "starterCode": "function solution() {\\n  // your code here\\n}", "testCases": [{"input": "...", "expected": "..."}], "topic": "topic name", "explanation": "solution approach"}
  ]
}`;

    const userPrompt = `Create an 8-question assessment for a student who just completed a module on: ${topicsList}

The assessment should include:
- 4 MCQ questions (testing conceptual understanding)
- 2 short-answer questions (testing deeper understanding)
- 1 system-design thinking question (how would you approach building X using these concepts)
- 1 coding question (practical implementation)

Topics covered: ${topicsList}
Difficulty level: ${difficulty}`;

    const aiResult = await aiClient.callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 2000,
      temperature: 0.5,
      cache: false,
    });

    let questions;

    if (aiResult.ok) {
      const parsed = aiClient.extractJSON(aiResult.data);
      if (parsed?.questions?.length > 0) {
        questions = parsed.questions;
      }
    }

    if (!questions) {
      questions = generateFallbackAssessment(topics, difficulty);
    }

    return c.json({
      assessmentId: `${moduleId}-${Date.now()}`,
      moduleId,
      questions,
      aiPowered: !!aiResult.ok,
    });
  } catch (err) {
    console.error('Module assessment error:', err.message);
    return c.json({ error: 'Failed to generate assessment' }, 500);
  }
});

function generateFallbackAssessment(topics, difficulty) {
  const questions = [];
  const topicList = Array.isArray(topics) ? topics : [topics];

  for (let i = 0; i < Math.min(4, topicList.length + 2); i++) {
    const topic = topicList[i % topicList.length];
    questions.push({
      id: `q${i + 1}`,
      type: 'mcq',
      text: `Which of the following best describes ${topic}?`,
      options: [
        `${topic} is a fundamental concept used in modern software development for building efficient applications.`,
        `${topic} is a deprecated technology that is no longer used in production environments.`,
        `${topic} is exclusively a database technology used for data warehousing.`,
        `${topic} is a hardware specification standard for IoT devices.`,
      ],
      correct: 0,
      topic,
      explanation: `${topic} is indeed a fundamental concept in software development.`,
    });
  }

  const shortTopic = topicList[0];
  questions.push({
    id: `q${questions.length + 1}`,
    type: 'short-answer',
    text: `Explain in your own words what ${shortTopic} is and why it is important in software development.`,
    correctKeywords: [shortTopic.toLowerCase(), 'development', 'application'],
    topic: shortTopic,
    explanation: `A good answer should mention what ${shortTopic} is, its purpose, and its role in building applications.`,
  });

  questions.push({
    id: `q${questions.length + 1}`,
    type: 'short-answer',
    text: `What are the key differences between ${topicList[0]} and ${topicList[Math.min(1, topicList.length - 1)]}?`,
    correctKeywords: [topicList[0].toLowerCase(), 'difference'],
    topic: topicList[0],
    explanation: `The answer should compare the two concepts highlighting their different purposes and use cases.`,
  });

  questions.push({
    id: `q${questions.length + 1}`,
    type: 'system-design',
    text: `If you were building a web application that uses ${topicList.join(' and ')}, how would you structure the project? Describe your approach.`,
    correctKeywords: ['structure', 'component', 'organize'],
    topic: topicList[0],
    explanation: `A good answer should describe project structure, separation of concerns, and how the technologies work together.`,
  });

  questions.push({
    id: `q${questions.length + 1}`,
    type: 'coding',
    text: `Write a simple example demonstrating your understanding of ${shortTopic}. The code should be functional and well-commented.`,
    starterCode: `// Demonstrate your understanding of ${shortTopic}\n// Write your code below\n\n`,
    testCases: [{ input: 'N/A', expected: 'Code should demonstrate the concept correctly' }],
    topic: shortTopic,
    explanation: `The code should show practical understanding of ${shortTopic} with proper syntax and logic.`,
  });

  return questions;
}

// ── POST /module-assessment/submit — evaluate assessment answers ─────────────
router.post('/module-assessment/submit', authenticateToken, requirePlan(3), async (c) => {
  try {
    const { assessmentId, moduleId, answers } = getBody(c);
    if (!assessmentId || !moduleId || !answers || typeof answers !== 'object') {
      return c.json({ error: 'assessmentId, moduleId, and answers are required' }, 400);
    }

    const { questions } = getBody(c);
    if (!Array.isArray(questions)) {
      return c.json({ error: 'questions array is required for grading' }, 400);
    }

    let correct = 0;
    const total = questions.length;
    const results = [];

    for (const q of questions) {
      const userAnswer = answers[q.id] || '';
      let isCorrect = false;

      if (q.type === 'mcq') {
        const selectedIndex = parseInt(userAnswer, 10);
        isCorrect = selectedIndex === q.correct;
      } else if (q.type === 'short-answer' || q.type === 'system-design') {
        const answerLower = (typeof userAnswer === 'string' ? userAnswer : '').toLowerCase();
        const keywords = q.correctKeywords || [];
        const matchedKeywords = keywords.filter(kw => answerLower.includes(kw.toLowerCase()));
        isCorrect = answerLower.length >= 20 && matchedKeywords.length >= Math.ceil(keywords.length * 0.5);
      } else if (q.type === 'coding') {
        isCorrect = typeof userAnswer === 'string' && userAnswer.trim().length >= 30;
      }

      if (isCorrect) correct++;

      results.push({
        questionId: q.id,
        type: q.type,
        topic: q.topic,
        userAnswer: typeof userAnswer === 'string' ? userAnswer.substring(0, 500) : userAnswer,
        isCorrect,
        explanation: q.explanation || '',
      });
    }

    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const passed = score >= 60;

    return c.json({
      assessmentId,
      moduleId,
      score,
      correct,
      total,
      passed,
      results,
      message: passed
        ? 'Congratulations! You passed the assessment. The next module is now unlocked.'
        : 'You did not pass this time. Review the explanations below and try again.',
    });
  } catch (err) {
    console.error('Assessment submit error:', err.message);
    return c.json({ error: 'Failed to evaluate assessment' }, 500);
  }
});

module.exports = router;
