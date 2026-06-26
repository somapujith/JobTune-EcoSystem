const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { callAI, extractJSON } = require('../utils/aiClient');

// ─────────────────────────────────────────────────────────────────────────────
// Fallback data generators (used when AI is unavailable)
// ─────────────────────────────────────────────────────────────────────────────

function generateFallbackNotes(topic, type) {
  if (type === 'mindmap') {
    return {
      title: topic,
      type: 'mindmap',
      content: `${topic}\n├── Core Concepts\n│   ├── Definition & Overview\n│   ├── Key Principles\n│   └── Historical Context\n├── Technical Details\n│   ├── Implementation Approaches\n│   ├── Common Patterns\n│   └── Best Practices\n├── Applications\n│   ├── Real-World Use Cases\n│   ├── Industry Examples\n│   └── Career Relevance\n└── Resources\n    ├── Recommended Reading\n    ├── Practice Exercises\n    └── Online Courses`,
    };
  }

  if (type === 'revision') {
    return {
      title: `${topic} - Revision Notes`,
      type: 'revision',
      keyConcepts: [
        `${topic} is a fundamental concept in its domain`,
        'Understanding the core principles is essential',
        'Practice with real-world examples solidifies learning',
      ],
      summary: `${topic} covers essential concepts that form the foundation of the subject. Focus on understanding the why behind each concept, not just the how.`,
      keyTakeaways: [
        'Master the fundamentals before advanced topics',
        'Apply concepts through hands-on projects',
        'Review regularly using spaced repetition',
      ],
    };
  }

  return {
    title: topic,
    type: 'detailed',
    keyConcepts: [
      { term: 'Core Definition', description: `The fundamental meaning and scope of ${topic}` },
      { term: 'Key Principles', description: 'The underlying rules and guidelines that govern this subject' },
      { term: 'Applications', description: 'How this topic is applied in real-world scenarios' },
    ],
    detailedExplanation: `${topic} is a significant area of study that encompasses several important concepts. Understanding ${topic} requires a solid grasp of its fundamental principles, practical applications, and the broader context in which it operates.\n\nThe subject can be broken down into several key areas, each building upon the previous one to form a comprehensive understanding.`,
    codeExamples: [],
    summary: `${topic} is a multi-faceted subject that requires both theoretical knowledge and practical application. The key to mastery is consistent practice and review.`,
    keyTakeaways: [
      'Start with the fundamentals and build up',
      'Practice regularly with hands-on exercises',
      'Connect concepts to real-world applications',
      'Use spaced repetition for long-term retention',
    ],
  };
}

function generateFallbackFlashcards(topic, count) {
  const cards = [];
  const templates = [
    { front: `What is ${topic}?`, back: `${topic} is a key concept in its domain that involves understanding fundamental principles and their applications.`, difficulty: 'easy' },
    { front: `What are the main components of ${topic}?`, back: `The main components include: core concepts, practical applications, best practices, and real-world use cases.`, difficulty: 'easy' },
    { front: `Why is ${topic} important?`, back: `${topic} is important because it provides foundational knowledge that enables more advanced understanding and practical problem-solving.`, difficulty: 'easy' },
    { front: `How is ${topic} applied in practice?`, back: `${topic} is applied through systematic implementation of its principles in real-world projects and solutions.`, difficulty: 'medium' },
    { front: `What are common misconceptions about ${topic}?`, back: `Common misconceptions include oversimplifying the concept, ignoring edge cases, and confusing related but distinct ideas.`, difficulty: 'medium' },
    { front: `Compare and contrast the key approaches in ${topic}`, back: `Different approaches vary in complexity, performance, and use cases. The best approach depends on specific requirements and constraints.`, difficulty: 'medium' },
    { front: `What are the best practices for ${topic}?`, back: `Best practices include: following established patterns, writing clean code, testing thoroughly, and staying updated with latest developments.`, difficulty: 'medium' },
    { front: `Explain the trade-offs involved in ${topic}`, back: `Trade-offs typically involve balancing performance vs. readability, simplicity vs. flexibility, and speed vs. accuracy.`, difficulty: 'hard' },
    { front: `How has ${topic} evolved over time?`, back: `The field has evolved from basic implementations to more sophisticated approaches, incorporating modern tools and methodologies.`, difficulty: 'hard' },
    { front: `Design a solution using ${topic} principles`, back: `A well-designed solution would incorporate core principles, follow best practices, handle edge cases, and be maintainable.`, difficulty: 'hard' },
    { front: `What are the limitations of ${topic}?`, back: `Limitations include scalability constraints, complexity in edge cases, and the need for continuous learning as the field evolves.`, difficulty: 'hard' },
    { front: `How does ${topic} relate to adjacent concepts?`, back: `${topic} connects to related fields through shared principles, complementary techniques, and overlapping use cases.`, difficulty: 'medium' },
    { front: `What tools or frameworks support ${topic}?`, back: `Various tools and frameworks exist to support ${topic}, each with their own strengths suited to different use cases.`, difficulty: 'easy' },
    { front: `Describe a real-world scenario where ${topic} is critical`, back: `In production systems, ${topic} is critical for ensuring reliability, performance, and maintainability of solutions.`, difficulty: 'medium' },
    { front: `What should you study next after mastering ${topic}?`, back: `After mastering the basics, explore advanced patterns, related technologies, and specialized applications in your area of interest.`, difficulty: 'easy' },
  ];
  const n = Math.min(count || 10, templates.length);
  for (let i = 0; i < n; i++) cards.push(templates[i]);
  return cards;
}

function generateFallbackQuiz(topic, difficulty, count) {
  const easyQs = [
    { question: `What is the primary purpose of ${topic}?`, options: ['To solve complex problems systematically', 'To make code run faster', 'To reduce file sizes', 'To improve graphics'], correct: 0, explanation: `${topic} primarily focuses on systematic problem-solving and understanding fundamental principles.` },
    { question: `Which of these is a key concept in ${topic}?`, options: ['Fundamental principles', 'Random guessing', 'Ignoring best practices', 'Avoiding documentation'], correct: 0, explanation: `Understanding fundamental principles is essential to mastering ${topic}.` },
    { question: `What is the best way to learn ${topic}?`, options: ['Consistent practice and review', 'Reading once without practice', 'Memorizing without understanding', 'Skipping fundamentals'], correct: 0, explanation: `Consistent practice with spaced review is the most effective learning strategy.` },
  ];
  const medQs = [
    { question: `When implementing ${topic}, what should you consider first?`, options: ['Requirements and constraints', 'The latest framework', 'The shortest solution', 'Personal preference only'], correct: 0, explanation: `Always start by understanding requirements and constraints before choosing an implementation approach.` },
    { question: `What is a common pitfall when working with ${topic}?`, options: ['Premature optimization', 'Writing tests', 'Reading documentation', 'Planning ahead'], correct: 0, explanation: `Premature optimization is a common pitfall that can lead to overly complex solutions.` },
    { question: `How should you handle edge cases in ${topic}?`, options: ['Identify and test them explicitly', 'Ignore them', 'Hope they never occur', 'Add them later if needed'], correct: 0, explanation: `Edge cases should be identified early and tested explicitly to ensure robust solutions.` },
  ];
  const hardQs = [
    { question: `What advanced pattern is most relevant to ${topic}?`, options: ['Design patterns adapted to the domain', 'Using global variables everywhere', 'Avoiding abstraction entirely', 'Writing monolithic code'], correct: 0, explanation: `Domain-specific design patterns help create maintainable and scalable solutions.` },
    { question: `In a complex ${topic} scenario, what is the optimal approach?`, options: ['Break down into smaller sub-problems', 'Solve everything at once', 'Copy existing solutions verbatim', 'Avoid testing'], correct: 0, explanation: `Breaking complex problems into smaller, manageable sub-problems is a proven strategy.` },
    { question: `What distinguishes expert-level understanding of ${topic}?`, options: ['Knowing when NOT to apply a technique', 'Using every technique available', 'Avoiding simple solutions', 'Memorizing all syntax'], correct: 0, explanation: `Expert-level understanding includes knowing trade-offs and when certain approaches are inappropriate.` },
  ];

  let pool;
  if (difficulty === 'easy') pool = easyQs;
  else if (difficulty === 'hard') pool = hardQs;
  else pool = [...easyQs.slice(0, 1), ...medQs, ...hardQs.slice(0, 1)];

  const n = Math.min(count || 10, pool.length);
  return pool.slice(0, n);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /notes/generate
// ─────────────────────────────────────────────────────────────────────────────

router.post('/notes/generate', authenticateToken, requirePlan(1), async (req, res) => {
  try {
    const { topic, type = 'detailed' } = req.body;

    if (!topic || topic.trim().length < 3) {
      return res.status(400).json({ error: 'Topic must be at least 3 characters' });
    }

    let systemPrompt, userPrompt, maxTokens;

    if (type === 'mindmap') {
      systemPrompt = `You are a study expert who creates visual mind maps that mirror how the brain naturally organizes information — from big concepts to specific details, with clear connections between related ideas. Use tree characters for hierarchy. Return ONLY valid JSON.`;
      userPrompt = `Create a mind map outline for: ${topic}\n\nReturn ONLY this JSON:\n{\n  "title": "${topic}",\n  "type": "mindmap",\n  "content": "the full mind map as a multi-line string using tree characters"\n}`;
      maxTokens = 800;
    } else if (type === 'revision') {
      systemPrompt = `You are a study expert who creates revision notes optimized for spaced repetition and exam performance. Focus on: key definitions, common exam questions, frequently confused concepts, and mnemonics. Return ONLY valid JSON.`;
      userPrompt = `Create concise revision notes for: ${topic}\n\nReturn ONLY this JSON:\n{\n  "title": "${topic} - Revision Notes",\n  "type": "revision",\n  "keyConcepts": ["concept1", "concept2", "concept3"],\n  "summary": "A concise 2-3 sentence summary",\n  "keyTakeaways": ["takeaway1", "takeaway2", "takeaway3"]\n}`;
      maxTokens = 600;
    } else {
      systemPrompt = `You are a comprehensive study expert who writes notes that could replace a textbook chapter. Include: clear definitions, real-world analogies, production-quality code examples with inline comments, common interview questions about this topic, and edge cases that trip up beginners. Return ONLY valid JSON.`;
      userPrompt = `Generate detailed study notes for: ${topic}\n\nReturn ONLY this JSON:\n{\n  "title": "${topic}",\n  "type": "detailed",\n  "keyConcepts": [{"term": "Term1", "description": "Description1"}, {"term": "Term2", "description": "Description2"}],\n  "detailedExplanation": "A thorough multi-paragraph explanation",\n  "codeExamples": [{"language": "javascript", "code": "example code", "description": "what the code does"}],\n  "summary": "A concise summary paragraph",\n  "keyTakeaways": ["takeaway1", "takeaway2", "takeaway3", "takeaway4"]\n}`;
      maxTokens = 1200;
    }

    const aiResult = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens,
      temperature: 0.5,
      structuredJson: true,
    });

    let notes;
    if (aiResult.ok && aiResult.data) {
      const parsed = extractJSON(aiResult.data);
      if (parsed) {
        notes = parsed;
      } else {
        console.warn('Failed to parse AI notes response, using fallback');
        notes = generateFallbackNotes(topic, type);
      }
    } else {
      notes = generateFallbackNotes(topic, type);
    }

    res.json({ success: true, data: notes });
  } catch (err) {
    console.error('Notes generation error:', err);
    res.status(500).json({ error: 'Failed to generate notes' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /flashcards/generate
// ─────────────────────────────────────────────────────────────────────────────

router.post('/flashcards/generate', authenticateToken, requirePlan(1), async (req, res) => {
  try {
    const { topic, count = 10 } = req.body;

    if (!topic || topic.trim().length < 3) {
      return res.status(400).json({ error: 'Topic must be at least 3 characters' });
    }

    const cardCount = Math.min(Math.max(count, 5), 15);

    const systemPrompt = `You are a study expert who creates flashcards using proven learning science: active recall, interleaving, and elaborative interrogation. Create cards that test UNDERSTANDING not memorization. Bad: "What is a closure?" Good: "What will this code output and why? [code snippet]". Vary difficulty. Return ONLY valid JSON.`;

    const userPrompt = `Create ${cardCount} study flashcards about: ${topic}\n\nReturn ONLY this JSON:\n{\n  "flashcards": [\n    {"front": "Question text", "back": "Answer text", "difficulty": "easy|medium|hard"}\n  ]\n}`;

    const aiResult = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 1200,
      temperature: 0.6,
      structuredJson: true,
    });

    let flashcards;
    if (aiResult.ok && aiResult.data) {
      const parsed = extractJSON(aiResult.data);
      if (parsed && (parsed.flashcards || Array.isArray(parsed))) {
        flashcards = parsed.flashcards || parsed;
      } else {
        console.warn('Failed to parse AI flashcards response, using fallback');
        flashcards = generateFallbackFlashcards(topic, cardCount);
      }
    } else {
      flashcards = generateFallbackFlashcards(topic, cardCount);
    }

    res.json({ success: true, data: flashcards });
  } catch (err) {
    console.error('Flashcard generation error:', err);
    res.status(500).json({ error: 'Failed to generate flashcards' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /quiz/generate
// ─────────────────────────────────────────────────────────────────────────────

router.post('/quiz/generate', authenticateToken, requirePlan(1), async (req, res) => {
  try {
    const { topic, difficulty = 'medium', count = 10 } = req.body;

    if (!topic || topic.trim().length < 3) {
      return res.status(400).json({ error: 'Topic must be at least 3 characters' });
    }

    const qCount = Math.min(Math.max(count, 5), 15);

    const systemPrompt = `You are an expert quiz creator who designs scenario-based questions that test real understanding, not just definition recall. For technical topics, include code snippets in questions when possible. Each question should have exactly 4 plausible options (avoid obviously wrong answers). The "correct" field must be the 0-based index of the correct option. Include a detailed explanation for each answer that teaches WHY the correct answer is right and WHY common wrong answers are tempting. Return ONLY valid JSON.`;

    const userPrompt = `Create ${qCount} ${difficulty}-difficulty multiple-choice questions about: ${topic}\n\nReturn ONLY this JSON:\n{\n  "questions": [\n    {\n      "question": "Question text?",\n      "options": ["Option A", "Option B", "Option C", "Option D"],\n      "correct": 0,\n      "explanation": "Why option A is correct"\n    }\n  ]\n}`;

    const aiResult = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 1200,
      temperature: 0.5,
      structuredJson: true,
    });

    let questions;
    if (aiResult.ok && aiResult.data) {
      const parsed = extractJSON(aiResult.data);
      if (parsed && (parsed.questions || Array.isArray(parsed))) {
        questions = parsed.questions || parsed;
      } else {
        console.warn('Failed to parse AI quiz response, using fallback');
        questions = generateFallbackQuiz(topic, difficulty, qCount);
      }
    } else {
      questions = generateFallbackQuiz(topic, difficulty, qCount);
    }

    // Assign a quiz ID for submission tracking
    const quizId = `quiz_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    res.json({ success: true, data: { quizId, topic, difficulty, questions } });
  } catch (err) {
    console.error('Quiz generation error:', err);
    res.status(500).json({ error: 'Failed to generate quiz' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /quiz/submit
// ─────────────────────────────────────────────────────────────────────────────

router.post('/quiz/submit', authenticateToken, requirePlan(1), async (req, res) => {
  try {
    const { quizId, answers, questions, topic, difficulty, timeTaken } = req.body;

    if (!quizId || !answers || !questions) {
      return res.status(400).json({ error: 'quizId, answers, and questions are required' });
    }

    let correct = 0;
    const breakdown = questions.map((q, i) => {
      const userAnswer = answers[i];
      const isCorrect = userAnswer === q.correct;
      if (isCorrect) correct++;
      return {
        question: q.question,
        userAnswer,
        correctAnswer: q.correct,
        isCorrect,
        explanation: q.explanation,
      };
    });

    const score = Math.round((correct / questions.length) * 100);

    let feedback;
    if (score >= 90) feedback = 'Outstanding! You have excellent command of this topic.';
    else if (score >= 70) feedback = 'Great job! You have a solid understanding. Review the missed questions to strengthen weak areas.';
    else if (score >= 50) feedback = 'Good effort! Focus on reviewing the concepts you missed and try again.';
    else feedback = 'Keep studying! Review the explanations for each question and revisit the topic notes before retrying.';

    const suggestions = [];
    if (score < 90) suggestions.push('Review your incorrect answers and their explanations');
    if (score < 70) suggestions.push('Generate study notes on this topic for deeper understanding');
    if (score < 50) suggestions.push('Create flashcards to memorize key concepts');
    suggestions.push('Try the quiz again after reviewing to track improvement');

    res.json({
      success: true,
      data: {
        quizId,
        topic,
        difficulty,
        score,
        correct,
        total: questions.length,
        timeTaken,
        feedback,
        suggestions,
        breakdown,
      },
    });
  } catch (err) {
    console.error('Quiz submit error:', err);
    res.status(500).json({ error: 'Failed to submit quiz' });
  }
});

module.exports = router;
