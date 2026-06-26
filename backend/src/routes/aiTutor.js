const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { callAI, extractJSON } = require('../utils/aiClient');

// ── System Prompts ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT_TUTOR = `You are a world-class CS educator who combines the clarity of 3Blue1Brown, the practicality of Fireship, and the depth of MIT OCW. You teach by building intuition FIRST, then formalizing with code.

Your teaching method:
1. ANALOGY FIRST — relate the concept to something the student already knows ("Think of a Promise like ordering food at a restaurant — you get a receipt immediately, but the food arrives later")
2. VISUAL MENTAL MODEL — describe what's happening in memory/execution ("When you call useState, React creates a slot in its internal array at index 0...")
3. MINIMAL WORKING CODE — the shortest possible example that demonstrates the concept, with inline comments
4. GOTCHA ALERT — mention the #1 mistake beginners make with this concept
5. PROGRESSIVE QUESTION — ask a question that's one step harder than what you just explained

Return ONLY valid JSON (no markdown wrapping):
{
  "reply": "Your explanation (can include markdown code blocks with triple-backtick syntax). Use headers (##) to organize if the explanation has multiple parts.",
  "suggestedTopics": ["Follow-up Topic 1", "Follow-up Topic 2", "Follow-up Topic 3"]
}

Keep explanations under 400 words. Prefer diagrams described in text over walls of prose. Never be condescending — assume the student is smart but encountering this concept for the first time.`;

const SYSTEM_PROMPT_DOUBT = `You are an expert debugging mentor. When a student brings a doubt or error, you don't just fix it — you teach them to fish.

Your resolution method:
1. IDENTIFY the root cause precisely ("This error occurs because JavaScript hoists var declarations but not let/const, so the variable is in the Temporal Dead Zone")
2. EXPLAIN the underlying concept in 2-3 clear paragraphs with an analogy
3. SHOW a minimal, runnable code example that demonstrates both the WRONG way and the RIGHT way, with comments explaining the difference
4. CHALLENGE with a practice question that tests they truly understood (not just memorized the fix)
5. CONNECT to related concepts they should explore next

Return ONLY valid JSON (no markdown wrapping):
{
  "concept": "The core concept name (e.g., 'Temporal Dead Zone in JavaScript')",
  "explanation": "Clear 2-3 paragraph explanation. First paragraph: what went wrong and why. Second: the underlying concept. Third: when this pattern matters in real code.",
  "example": "Show BOTH broken and fixed code in markdown code blocks with comments",
  "practiceQuestion": "A specific, testable challenge — not 'explain X' but 'what will this code output and why?'",
  "relatedTopics": ["Related Topic 1", "Related Topic 2", "Related Topic 3"]
}`;

// ── Available Topics ────────────────────────────────────────────────────────

const TOPICS = [
  {
    id: 'frontend',
    name: 'Frontend Development',
    icon: 'web',
    subtopics: ['HTML & CSS Basics', 'JavaScript ES6+', 'React.js', 'State Management', 'CSS Frameworks', 'Responsive Design', 'Web Performance', 'Browser APIs']
  },
  {
    id: 'backend',
    name: 'Backend Development',
    icon: 'dns',
    subtopics: ['Node.js & Express', 'REST API Design', 'Authentication & JWT', 'Middleware Patterns', 'Error Handling', 'File Uploads', 'WebSockets', 'Caching']
  },
  {
    id: 'dsa',
    name: 'Data Structures & Algorithms',
    icon: 'account_tree',
    subtopics: ['Arrays & Strings', 'Linked Lists', 'Stacks & Queues', 'Trees & Graphs', 'Sorting Algorithms', 'Dynamic Programming', 'Recursion', 'Time Complexity']
  },
  {
    id: 'dbms',
    name: 'Database Management',
    icon: 'storage',
    subtopics: ['SQL Fundamentals', 'Joins & Subqueries', 'Normalization', 'Indexing', 'Transactions & ACID', 'NoSQL Basics', 'Query Optimization', 'Database Design']
  },
  {
    id: 'os',
    name: 'Operating Systems',
    icon: 'memory',
    subtopics: ['Process Management', 'Threads & Concurrency', 'Memory Management', 'Deadlocks', 'CPU Scheduling', 'File Systems', 'Virtual Memory', 'Synchronization']
  },
  {
    id: 'networks',
    name: 'Computer Networks',
    icon: 'lan',
    subtopics: ['OSI Model', 'TCP/IP', 'HTTP & HTTPS', 'DNS', 'Load Balancing', 'Network Security', 'REST vs GraphQL', 'WebSockets']
  },
  {
    id: 'system-design',
    name: 'System Design',
    icon: 'architecture',
    subtopics: ['Scalability Basics', 'Load Balancers', 'Caching Strategies', 'Database Sharding', 'Microservices', 'Message Queues', 'CAP Theorem', 'Design Patterns']
  },
  {
    id: 'devops',
    name: 'DevOps & Cloud',
    icon: 'cloud',
    subtopics: ['Git & Version Control', 'Docker Basics', 'CI/CD Pipelines', 'AWS Fundamentals', 'Linux Commands', 'Kubernetes Intro', 'Monitoring & Logging', 'Infrastructure as Code']
  }
];

// ── Fallback Generators ─────────────────────────────────────────────────────

function generateFallbackChatReply(topic, message) {
  const msgLower = (message || '').toLowerCase();
  const topicData = TOPICS.find(t => t.id === topic || t.name.toLowerCase().includes((topic || '').toLowerCase()));

  let reply = '';
  let suggestedTopics = [];

  if (msgLower.includes('what is') || msgLower.includes('explain') || msgLower.includes('how does')) {
    reply = `Great question! Let me break this down for you.\n\n` +
      `**${topic || 'This concept'}** is a fundamental topic in computer science. ` +
      `Understanding it well will help you in both interviews and real-world development.\n\n` +
      `Here are the key points to understand:\n` +
      `1. **Core Idea**: Every concept builds on simpler primitives. Start by understanding the building blocks.\n` +
      `2. **Why It Matters**: This is frequently asked in technical interviews and used daily in production code.\n` +
      `3. **How to Practice**: Try implementing a small project that uses this concept.\n\n` +
      `Would you like me to go deeper into any specific aspect?`;
  } else if (msgLower.includes('code') || msgLower.includes('example') || msgLower.includes('implement')) {
    reply = `Here's a practical example to illustrate the concept:\n\n` +
      `\`\`\`javascript\n// Example: Basic implementation\nfunction demonstrate() {\n  // Step 1: Setup\n  const data = [1, 2, 3, 4, 5];\n  \n  // Step 2: Process\n  const result = data.map(item => item * 2);\n  \n  // Step 3: Output\n  console.log(result); // [2, 4, 6, 8, 10]\n  return result;\n}\n\ndemonstrate();\n\`\`\`\n\n` +
      `The key takeaway here is how we break problems into small, manageable steps. ` +
      `Try modifying this example to handle edge cases — what happens with an empty array?`;
  } else if (msgLower.includes('interview') || msgLower.includes('prepare')) {
    reply = `For interview preparation on this topic, focus on:\n\n` +
      `1. **Understand the fundamentals** — don't just memorize, understand *why*\n` +
      `2. **Practice coding** — implement from scratch without looking at solutions\n` +
      `3. **Time complexity** — always analyze Big-O of your solutions\n` +
      `4. **Edge cases** — interviewers love testing boundary conditions\n\n` +
      `A common interview pattern is to start with the brute force approach, then optimize step by step. ` +
      `This shows your thought process, which matters more than getting the optimal solution immediately.`;
  } else {
    reply = `That's an interesting question! Let me help you understand this better.\n\n` +
      `In software engineering, building strong fundamentals is crucial. ` +
      `The best developers aren't those who know every framework — they're the ones who understand core concepts deeply.\n\n` +
      `Here's my advice:\n` +
      `- **Read** the official documentation first\n` +
      `- **Build** a small project applying the concept\n` +
      `- **Explain** it to someone else (rubber duck debugging!)\n` +
      `- **Review** and iterate on your understanding\n\n` +
      `What specific aspect would you like to explore further?`;
  }

  if (topicData) {
    suggestedTopics = topicData.subtopics.slice(0, 3);
  } else {
    suggestedTopics = ['JavaScript Fundamentals', 'Data Structures Basics', 'System Design Intro'];
  }

  return { reply, suggestedTopics };
}

function generateFallbackDoubtResolution(doubt, codeSnippet, category) {
  const doubtLower = (doubt || '').toLowerCase();

  let concept = 'Programming Concept';
  let explanation = '';
  let example = '';
  let practiceQuestion = '';
  let relatedTopics = [];

  if (doubtLower.includes('closure') || doubtLower.includes('scope')) {
    concept = 'Closures & Lexical Scope';
    explanation = `A closure is a function that remembers variables from its outer (enclosing) scope even after the outer function has finished executing. This happens because JavaScript uses lexical scoping — a function's scope is determined by where it's written in the code, not where it's called.\n\nClosures are one of the most powerful features in JavaScript. They enable data privacy, function factories, and are the foundation of many design patterns like the module pattern.`;
    example = '```javascript\nfunction createCounter() {\n  let count = 0; // This variable is "closed over"\n  \n  return {\n    increment: () => ++count,\n    decrement: () => --count,\n    getCount: () => count\n  };\n}\n\nconst counter = createCounter();\nconsole.log(counter.increment()); // 1\nconsole.log(counter.increment()); // 2\nconsole.log(counter.getCount());  // 2\n// count is not accessible directly — it\'s private!\n```';
    practiceQuestion = 'Write a function `createMultiplier(x)` that returns a new function which multiplies any number passed to it by `x`. Example: `const double = createMultiplier(2); double(5)` should return `10`.';
    relatedTopics = ['Lexical Scope', 'IIFE Pattern', 'Module Pattern', 'Higher-Order Functions'];
  } else if (doubtLower.includes('async') || doubtLower.includes('await') || doubtLower.includes('promise')) {
    concept = 'Async/Await & Promises';
    explanation = `Promises represent a value that may not be available yet but will be resolved (or rejected) in the future. They provide a cleaner way to handle asynchronous operations compared to callbacks.\n\nAsync/await is syntactic sugar over Promises that makes asynchronous code look and behave like synchronous code. An \`async\` function always returns a Promise, and \`await\` pauses execution until that Promise resolves.`;
    example = '```javascript\n// Promise-based\nfunction fetchUser(id) {\n  return fetch(`/api/users/${id}`)\n    .then(res => res.json())\n    .then(user => user)\n    .catch(err => console.error(err));\n}\n\n// Async/Await equivalent (cleaner!)\nasync function fetchUser(id) {\n  try {\n    const res = await fetch(`/api/users/${id}`);\n    const user = await res.json();\n    return user;\n  } catch (err) {\n    console.error(err);\n  }\n}\n```';
    practiceQuestion = 'Write an async function that fetches data from two different API endpoints in parallel using `Promise.all()`, then combines the results into a single object.';
    relatedTopics = ['Event Loop', 'Callback Hell', 'Promise.all vs Promise.race', 'Error Handling in Async Code'];
  } else if (doubtLower.includes('recursion') || doubtLower.includes('recursive')) {
    concept = 'Recursion';
    explanation = `Recursion is when a function calls itself to solve a problem by breaking it into smaller sub-problems. Every recursive function needs two things: a base case (when to stop) and a recursive case (how to break the problem down).\n\nRecursion is especially useful for tree/graph traversal, divide-and-conquer algorithms, and problems with naturally recursive structure (like factorials, Fibonacci, or directory traversal).`;
    example = '```javascript\n// Factorial using recursion\nfunction factorial(n) {\n  // Base case\n  if (n <= 1) return 1;\n  \n  // Recursive case\n  return n * factorial(n - 1);\n}\n\nconsole.log(factorial(5)); // 120\n// 5 * 4 * 3 * 2 * 1 = 120\n```';
    practiceQuestion = 'Write a recursive function `flatten(arr)` that takes a nested array like `[1, [2, [3, 4]], 5]` and returns a flat array `[1, 2, 3, 4, 5]`.';
    relatedTopics = ['Stack Overflow & Base Cases', 'Tail Recursion', 'Memoization', 'Iterative vs Recursive Solutions'];
  } else if (doubtLower.includes('error') || doubtLower.includes('bug') || doubtLower.includes('debug')) {
    concept = 'Debugging & Error Handling';
    explanation = `Effective debugging is a critical skill. Common error types include SyntaxError (typos, missing brackets), TypeError (wrong data type), ReferenceError (undefined variables), and logical errors (code runs but gives wrong results).\n\nA systematic debugging approach: 1) Read the error message carefully, 2) Identify the exact line, 3) Check the data at that point using console.log or debugger, 4) Form a hypothesis, 5) Test the fix.`;
    example = '```javascript\n// Common error pattern & fix\n// TypeError: Cannot read property \'name\' of undefined\nconst users = [{ name: "Alice" }, null, { name: "Bob" }];\n\n// Bad: crashes on null\n// users.forEach(u => console.log(u.name));\n\n// Good: defensive coding\nusers.forEach(u => {\n  if (u?.name) {\n    console.log(u.name);\n  }\n});\n\n// Even better: filter first\nusers\n  .filter(Boolean)\n  .forEach(u => console.log(u.name));\n```';
    practiceQuestion = 'Given the code `const result = data.items.map(i => i.value.toFixed(2))`, list all the possible errors that could occur and rewrite it with proper error handling.';
    relatedTopics = ['Try-Catch Patterns', 'Optional Chaining', 'Error Boundaries in React', 'Logging Best Practices'];
  } else {
    concept = 'Software Engineering Fundamentals';
    explanation = `Understanding core programming concepts is essential for every software engineer. Whether it's data structures, algorithms, design patterns, or system architecture, strong fundamentals make you adaptable across any technology stack.\n\nThe best way to learn is through a combination of theory and practice. Read the documentation, write code, break things, fix them, and teach others what you've learned.`;
    example = '```javascript\n// A fundamental pattern: separation of concerns\n\n// Data layer\nconst fetchData = async (url) => {\n  const response = await fetch(url);\n  return response.json();\n};\n\n// Business logic\nconst processData = (data) => {\n  return data.filter(item => item.active)\n             .sort((a, b) => b.score - a.score);\n};\n\n// Presentation\nconst renderResults = (items) => {\n  return items.map(item => `${item.name}: ${item.score}`);\n};\n```';
    practiceQuestion = 'Design a simple module that separates data fetching, processing, and rendering concerns. Implement it for a "user list" feature.';
    relatedTopics = ['Clean Code Principles', 'SOLID Principles', 'Design Patterns', 'Code Review Best Practices'];
  }

  // If a code snippet was provided, mention debugging context
  if (codeSnippet && codeSnippet.trim().length > 10) {
    explanation = `Looking at your code snippet, here's what I see:\n\n${explanation}\n\nWhen analyzing code, always start by reading it top-to-bottom and identifying the data flow. Understanding what each variable holds at each point is key to finding issues.`;
  }

  return { concept, explanation, example, practiceQuestion, relatedTopics };
}

// ── Routes ──────────────────────────────────────────────────────────────────

// GET /topics — list available topics with subtopics
router.get('/topics', authenticateToken, requirePlan(1), (req, res) => {
  res.json({ topics: TOPICS });
});

// POST /chat — conversational AI tutor
router.post('/chat', authenticateToken, requirePlan(1), async (req, res, next) => {
  try {
    const { topic, message, history } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Build conversation context from history
    let conversationContext = '';
    if (Array.isArray(history) && history.length > 0) {
      const recentHistory = history.slice(-6); // Keep last 6 messages for context
      conversationContext = recentHistory
        .map(h => `${h.role === 'user' ? 'Student' : 'Tutor'}: ${h.content}`)
        .join('\n\n');
      conversationContext = `\n\nPrevious conversation:\n${conversationContext}\n\n`;
    }

    const topicContext = topic ? `The student is studying: ${topic}.\n` : '';
    const userPrompt = `${topicContext}${conversationContext}Student's current question: ${message}`;

    const aiResult = await callAI({
      systemPrompt: SYSTEM_PROMPT_TUTOR,
      userPrompt,
      maxTokens: 1024,
      temperature: 0.6,
      structuredJson: true,
      model: process.env.LM_STUDIO_MODEL_TUTOR,
      cache: false
    });

    let result;
    if (aiResult.ok) {
      const parsed = extractJSON(aiResult.data);
      if (parsed && parsed.reply) {
        result = parsed;
      } else {
        // AI returned text but not valid JSON — use the raw text as the reply
        console.warn('AI returned unparseable JSON for chat, using raw text');
        result = {
          reply: aiResult.data,
          suggestedTopics: TOPICS.find(t => t.id === topic)?.subtopics?.slice(0, 3) || ['JavaScript Basics', 'React Fundamentals', 'DSA Patterns']
        };
      }
    } else {
      console.warn('AI unavailable for chat, using fallback');
      result = generateFallbackChatReply(topic, message);
    }

    res.json({
      reply: result.reply,
      suggestedTopics: result.suggestedTopics || [],
      ai_powered: aiResult.ok
    });
  } catch (err) {
    next(err);
  }
});

// POST /doubt — structured doubt resolution
router.post('/doubt', authenticateToken, requirePlan(1), async (req, res, next) => {
  try {
    const { doubt, codeSnippet, category } = req.body;

    if (!doubt || !doubt.trim()) {
      return res.status(400).json({ error: 'Doubt description is required' });
    }

    let userPrompt = `Category: ${category || 'General'}\n\nStudent's doubt: ${doubt}`;
    if (codeSnippet && codeSnippet.trim()) {
      userPrompt += `\n\nCode snippet the student is confused about:\n\`\`\`\n${codeSnippet}\n\`\`\``;
    }

    const aiResult = await callAI({
      systemPrompt: SYSTEM_PROMPT_DOUBT,
      userPrompt,
      maxTokens: 1200,
      temperature: 0.5,
      structuredJson: true,
      model: process.env.LM_STUDIO_MODEL_TUTOR
    });

    let result;
    if (aiResult.ok) {
      const parsed = extractJSON(aiResult.data);
      if (parsed && parsed.concept && parsed.explanation) {
        result = parsed;
      } else {
        console.warn('AI returned unparseable JSON for doubt, using fallback');
        result = generateFallbackDoubtResolution(doubt, codeSnippet, category);
      }
    } else {
      console.warn('AI unavailable for doubt resolution, using fallback');
      result = generateFallbackDoubtResolution(doubt, codeSnippet, category);
    }

    res.json({
      concept: result.concept,
      explanation: result.explanation,
      example: result.example,
      practiceQuestion: result.practiceQuestion,
      relatedTopics: result.relatedTopics || [],
      ai_powered: aiResult.ok
    });
  } catch (err) {
    next(err);
  }
});

// ── Conversation History ───────────────────────────────────────────────────

const tutorHistoryService = require('../services/tutorHistoryService');

router.get('/conversations', authenticateToken, async (req, res, next) => {
  try {
    const conversations = await tutorHistoryService.getConversations(req.user.id);
    res.json({ conversations });
  } catch (err) { next(err); }
});

router.get('/conversations/:id', authenticateToken, async (req, res, next) => {
  try {
    const conversation = await tutorHistoryService.getConversation(req.params.id, req.user.id);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    res.json({ conversation });
  } catch (err) { next(err); }
});

router.post('/conversations', authenticateToken, async (req, res, next) => {
  try {
    const { topic, title, messages } = req.body;
    const result = await tutorHistoryService.saveConversation(req.user.id, topic, title, messages || []);
    res.json({ success: true, conversation: result });
  } catch (err) { next(err); }
});

router.put('/conversations/:id', authenticateToken, async (req, res, next) => {
  try {
    const { messages } = req.body;
    await tutorHistoryService.updateConversation(req.params.id, req.user.id, messages);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/conversations/:id', authenticateToken, async (req, res, next) => {
  try {
    await tutorHistoryService.deleteConversation(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
