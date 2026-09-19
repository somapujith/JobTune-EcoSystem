'use strict';

/**
 * Worker port of backend/src/routes/jobPreparation.js  (mounted at /api/job-prep).
 * Slice: mid1 (ADR-001 Phase 3).
 *
 *   POST /star-stories       authenticateToken
 *   POST /tutor              authenticateToken
 *   POST /projects           authenticateToken
 *   POST /project-blueprint  authenticateToken
 *   (no requirePlan anywhere in this file, as on Express)
 *
 * Services (injected, infra slice): getServices(c).aiClient (callAI, extractJSON).
 * Model selection: config.vars.LM_STUDIO_MODEL_INTERVIEW || 'meta-llama-3.1-8b-instruct'.
 * Errors are thrown to the app's onError (Express: next(err)).
 *
 * Preserved quirk: the prompt strings below contain a literal backslash followed by "n" (written
 * "\\n" inside template/string literals), NOT a newline. That is what Express sent to the model.
 */
const { createRouter } = require('../lib/routes');
const { authenticateToken } = require('../middleware/auth');
const { getConfig, getServices } = require('../lib/context');
const { getBody } = require('../lib/http');

const router = createRouter();

const STAR_PROMPT = `You are an expert career coach and interview prep assistant. 
The user will provide a topic or theme (like "Leadership", "Conflict", "Tight deadline").
Your task is to generate 2 highly professional, engaging STAR (Situation, Task, Action, Result) stories that a software developer or tech professional might use in an interview for that topic.
Make them realistic, impactful, and easy to read.

Return ONLY a valid JSON object in this exact format:
{
  "stories": [
    {
      "title": "A catchy title for the story",
      "situation": "The context and background",
      "task": "The specific challenge or goal",
      "action": "The specific actions taken (focus on 'I' instead of 'We')",
      "result": "The measurable positive outcome"
    }
  ]
}`;

// POST /api/job-prep/star-stories
router.post('/star-stories', authenticateToken, async (c) => {
  const { topic } = getBody(c);
  if (!topic) {
    return c.json({ error: 'Topic is required' }, 400);
  }

  const { aiClient } = getServices(c);
  const aiResult = await aiClient.callAI({
    systemPrompt: STAR_PROMPT,
    userPrompt: `Generate 2 STAR stories for the topic: ${topic}`,
    maxTokens: 1000,
    model: getConfig(c).vars.LM_STUDIO_MODEL_INTERVIEW || 'meta-llama-3.1-8b-instruct'
  });

  if (!aiResult.ok) {
    // Fallback response if AI is down
    return c.json({
      success: true,
      data: {
        stories: [
          {
            title: "Leading a critical migration",
            situation: "Our legacy monolith was experiencing 5-second load times during peak hours.",
            task: "I was tasked with migrating the most heavily used microservice to a new Node.js architecture within 3 weeks.",
            action: "I mapped out the endpoints, led a daily standup with 2 other devs to ensure no duplicate work, and implemented Redis caching to reduce database load.",
            result: "We successfully launched on time with zero downtime, and response times dropped from 5 seconds to 120ms, increasing user retention by 15%."
          }
        ]
      }
    });
  }

  const parsed = aiClient.extractJSON(aiResult.data);
  if (!parsed || !parsed.stories) {
    return c.json({
      success: true,
      data: {
        stories: [
          {
            title: "Leading a critical migration",
            situation: "Our legacy monolith was experiencing 5-second load times during peak hours.",
            task: "I was tasked with migrating the most heavily used microservice to a new Node.js architecture within 3 weeks.",
            action: "I mapped out the endpoints, led a daily standup with 2 other devs to ensure no duplicate work, and implemented Redis caching to reduce database load.",
            result: "We successfully launched on time with zero downtime, and response times dropped from 5 seconds to 120ms, increasing user retention by 15%."
          }
        ]
      }
    });
  }
  return c.json({ success: true, data: parsed });
});

const TUTOR_PROMPT = `You are a friendly, encouraging AI Tutor for a beginner learning software development.
The user is following a 'Zero to Hero' career roadmap.
Answer their technical questions simply, concisely, and with encouragement. If they ask for code, provide small, easy-to-understand examples.
Keep your responses under 3 paragraphs to fit nicely in a chat UI.`;

// POST /api/job-prep/tutor
router.post('/tutor', authenticateToken, async (c) => {
  const { message, history } = getBody(c);

  if (!message) {
    return c.json({ error: 'Message is required' }, 400);
  }

  // Construct conversation history for the prompt
  let userPrompt = "Previous conversation:\\n";
  if (history && history.length > 0) {
    history.forEach(msg => {
      userPrompt += `${msg.role === 'assistant' ? 'Tutor' : 'Student'}: ${msg.content}\\n`;
    });
  }
  userPrompt += `\\nStudent's new question: ${message}\\n\\nReply as the Tutor:`;

  const aiResult = await getServices(c).aiClient.callAI({
    systemPrompt: TUTOR_PROMPT,
    userPrompt: userPrompt,
    maxTokens: 500,
    model: getConfig(c).vars.LM_STUDIO_MODEL_INTERVIEW || 'meta-llama-3.1-8b-instruct'
  });

  if (!aiResult.ok) {
    return c.json({ success: true, data: { reply: "I'm having a little trouble connecting right now, but keep up the great work! Try asking again in a moment." } });
  }

  return c.json({ success: true, data: { reply: aiResult.data.trim() } });
});

const PROJECT_PROMPT = `You are a Senior Developer. The user will provide a target job role and their current skills. 
Suggest 3 hyper-targeted, unique portfolio projects that will bridge their skill gap and impress recruiters for that specific role.
Return ONLY valid JSON in this exact format:
{
  "projects": [
    {
      "title": "Project Name",
      "description": "Short 1-2 sentence description",
      "skills_gained": ["Skill 1", "Skill 2"]
    }
  ]
}`;

// POST /api/job-prep/projects
router.post('/projects', authenticateToken, async (c) => {
  const { role, skills } = getBody(c);

  if (!role) {
    return c.json({ error: 'Target role is required' }, 400);
  }

  const userPrompt = `Target Role: ${role}\\nCurrent Skills: ${skills || 'Basic knowledge'}\\nSuggest 3 projects.`;

  const { aiClient } = getServices(c);
  const aiResult = await aiClient.callAI({
    systemPrompt: PROJECT_PROMPT,
    userPrompt: userPrompt,
    maxTokens: 800,
    model: getConfig(c).vars.LM_STUDIO_MODEL_INTERVIEW || 'meta-llama-3.1-8b-instruct'
  });

  if (!aiResult.ok) {
    return c.json({ success: true, data: { projects: [
      { title: "Task Manager Pro", description: "A robust task manager with real-time updates.", skills_gained: ["React", "WebSockets"] },
      { title: "E-commerce Dashboard", description: "Admin panel for managing inventory and orders.", skills_gained: ["Node.js", "SQL"] }
    ]}});
  }

  const parsed = aiClient.extractJSON(aiResult.data);
  if (!parsed || !parsed.projects) {
    return c.json({ success: true, data: { projects: [
      { title: "Task Manager Pro", description: "A robust task manager with real-time updates.", skills_gained: ["React", "WebSockets"] },
      { title: "E-commerce Dashboard", description: "Admin panel for managing inventory and orders.", skills_gained: ["Node.js", "SQL"] }
    ]}});
  }
  return c.json({ success: true, data: parsed });
});

const BLUEPRINT_PROMPT = `You are a Software Architect. Provide a comprehensive blueprint to build the requested project.
Return ONLY valid JSON in this exact format:
{
  "blueprint": {
    "architecture": "Describe the architecture (e.g. MERN stack, MVC).",
    "setup_commands": ["npm create vite@latest", "npm install tailwindcss"],
    "steps": ["Step 1: Setup DB", "Step 2: Create API"],
    "readme_draft": "# Project Name\\n\\nDescription of project."
  }
}`;

// POST /api/job-prep/project-blueprint
router.post('/project-blueprint', authenticateToken, async (c) => {
  const { projectTitle } = getBody(c);

  if (!projectTitle) {
    return c.json({ error: 'Project title is required' }, 400);
  }

  const { aiClient } = getServices(c);
  const aiResult = await aiClient.callAI({
    systemPrompt: BLUEPRINT_PROMPT,
    userPrompt: `Generate a blueprint for: ${projectTitle}`,
    maxTokens: 1000,
    model: getConfig(c).vars.LM_STUDIO_MODEL_INTERVIEW || 'meta-llama-3.1-8b-instruct'
  });

  if (!aiResult.ok) {
    return c.json({ success: true, data: { blueprint: {
      architecture: "Standard React Frontend with Node/Express Backend",
      setup_commands: ["npx create-react-app frontend", "npm init -y"],
      steps: ["Initialize git", "Setup Express server", "Build React UI", "Connect to DB"],
      readme_draft: "# " + projectTitle + "\\n\\nA great project."
    }}});
  }

  const parsed = aiClient.extractJSON(aiResult.data);
  if (!parsed || !parsed.blueprint) {
    return c.json({ success: true, data: { blueprint: {
      architecture: "Standard React Frontend with Node/Express Backend",
      setup_commands: ["npx create-react-app frontend", "npm init -y"],
      steps: ["Initialize git", "Setup Express server", "Build React UI", "Connect to DB"],
      readme_draft: "# " + projectTitle + "\\n\\nA great project."
    }}});
  }
  return c.json({ success: true, data: parsed });
});

module.exports = router;
