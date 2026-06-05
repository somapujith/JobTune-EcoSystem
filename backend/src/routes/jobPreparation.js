const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { callAI, extractJSON } = require('../utils/aiClient');

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
router.post('/star-stories', authenticateToken, async (req, res, next) => {
  try {
    const { topic } = req.body;
    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    const aiResult = await callAI({
      systemPrompt: STAR_PROMPT,
      userPrompt: `Generate 2 STAR stories for the topic: ${topic}`,
      maxTokens: 1000,
      model: process.env.LM_STUDIO_MODEL_INTERVIEW || 'meta-llama-3.1-8b-instruct'
    });

    if (!aiResult.ok) {
      // Fallback response if AI is down
      return res.json({
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

    const parsed = extractJSON(aiResult.data);
    if (!parsed || !parsed.stories) {
      return res.json({
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
    res.json({ success: true, data: parsed });

  } catch (err) {
    next(err);
  }
});

const TUTOR_PROMPT = `You are a friendly, encouraging AI Tutor for a beginner learning software development.
The user is following a 'Zero to Hero' career roadmap.
Answer their technical questions simply, concisely, and with encouragement. If they ask for code, provide small, easy-to-understand examples.
Keep your responses under 3 paragraphs to fit nicely in a chat UI.`;

// POST /api/job-prep/tutor
router.post('/tutor', authenticateToken, async (req, res, next) => {
  try {
    const { message, history } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Construct conversation history for the prompt
    let userPrompt = "Previous conversation:\\n";
    if (history && history.length > 0) {
      history.forEach(msg => {
        userPrompt += `${msg.role === 'assistant' ? 'Tutor' : 'Student'}: ${msg.content}\\n`;
      });
    }
    userPrompt += `\\nStudent's new question: ${message}\\n\\nReply as the Tutor:`;

    const aiResult = await callAI({
      systemPrompt: TUTOR_PROMPT,
      userPrompt: userPrompt,
      maxTokens: 500,
      model: process.env.LM_STUDIO_MODEL_INTERVIEW || 'meta-llama-3.1-8b-instruct'
    });

    if (!aiResult.ok) {
      return res.json({ success: true, data: { reply: "I'm having a little trouble connecting right now, but keep up the great work! Try asking again in a moment." } });
    }

    res.json({ success: true, data: { reply: aiResult.data.trim() } });
  } catch (err) {
    next(err);
  }
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
router.post('/projects', authenticateToken, async (req, res, next) => {
  try {
    const { role, skills } = req.body;
    
    if (!role) {
      return res.status(400).json({ error: 'Target role is required' });
    }

    const userPrompt = `Target Role: ${role}\\nCurrent Skills: ${skills || 'Basic knowledge'}\\nSuggest 3 projects.`;

    const aiResult = await callAI({
      systemPrompt: PROJECT_PROMPT,
      userPrompt: userPrompt,
      maxTokens: 800,
      model: process.env.LM_STUDIO_MODEL_INTERVIEW || 'meta-llama-3.1-8b-instruct'
    });

    if (!aiResult.ok) {
      return res.json({ success: true, data: { projects: [
        { title: "Task Manager Pro", description: "A robust task manager with real-time updates.", skills_gained: ["React", "WebSockets"] },
        { title: "E-commerce Dashboard", description: "Admin panel for managing inventory and orders.", skills_gained: ["Node.js", "SQL"] }
      ]}});
    }

    const parsed = extractJSON(aiResult.data);
    if (!parsed || !parsed.projects) {
      return res.json({ success: true, data: { projects: [
        { title: "Task Manager Pro", description: "A robust task manager with real-time updates.", skills_gained: ["React", "WebSockets"] },
        { title: "E-commerce Dashboard", description: "Admin panel for managing inventory and orders.", skills_gained: ["Node.js", "SQL"] }
      ]}});
    }
    res.json({ success: true, data: parsed });
  } catch (err) {
    next(err);
  }
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
router.post('/project-blueprint', authenticateToken, async (req, res, next) => {
  try {
    const { projectTitle } = req.body;
    
    if (!projectTitle) {
      return res.status(400).json({ error: 'Project title is required' });
    }

    const aiResult = await callAI({
      systemPrompt: BLUEPRINT_PROMPT,
      userPrompt: `Generate a blueprint for: ${projectTitle}`,
      maxTokens: 1000,
      model: process.env.LM_STUDIO_MODEL_INTERVIEW || 'meta-llama-3.1-8b-instruct'
    });

    if (!aiResult.ok) {
      return res.json({ success: true, data: { blueprint: {
        architecture: "Standard React Frontend with Node/Express Backend",
        setup_commands: ["npx create-react-app frontend", "npm init -y"],
        steps: ["Initialize git", "Setup Express server", "Build React UI", "Connect to DB"],
        readme_draft: "# " + projectTitle + "\\n\\nA great project."
      }}});
    }

    const parsed = extractJSON(aiResult.data);
    if (!parsed || !parsed.blueprint) {
      return res.json({ success: true, data: { blueprint: {
        architecture: "Standard React Frontend with Node/Express Backend",
        setup_commands: ["npx create-react-app frontend", "npm init -y"],
        steps: ["Initialize git", "Setup Express server", "Build React UI", "Connect to DB"],
        readme_draft: "# " + projectTitle + "\\n\\nA great project."
      }}});
    }
    res.json({ success: true, data: parsed });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
