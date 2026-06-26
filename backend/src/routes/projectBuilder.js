const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { callAI, extractJSON } = require('../utils/aiClient');
const { pool } = require('../config/database');

// ── Ensure workspace table exists ─────────────────────────────────────────────
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_workspace (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        plan JSONB NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'Planning',
        tasks JSONB NOT NULL DEFAULT '[]',
        notes TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } catch (err) {
    console.warn('project_workspace table init:', err.message);
  }
})();

// ── Helpers ───────────────────────────────────────────────────────────────────

const PROJECT_TEMPLATES = [
  {
    id: 'todo',
    name: 'Todo App',
    icon: 'checklist',
    description: 'A full-featured task management application with CRUD, filtering, and persistence.',
    suggestedStack: ['React', 'Node.js', 'PostgreSQL'],
  },
  {
    id: 'ecommerce',
    name: 'E-commerce Store',
    icon: 'shopping_cart',
    description: 'Online store with product catalog, cart, checkout, and order management.',
    suggestedStack: ['Next.js', 'Stripe', 'PostgreSQL'],
  },
  {
    id: 'blog',
    name: 'Blog Platform',
    icon: 'edit_note',
    description: 'Content management system with markdown support, categories, and comments.',
    suggestedStack: ['React', 'Express', 'MongoDB'],
  },
  {
    id: 'social',
    name: 'Social Media App',
    icon: 'group',
    description: 'Social network with profiles, posts, likes, follows, and real-time feed.',
    suggestedStack: ['React', 'Node.js', 'PostgreSQL', 'Socket.io'],
  },
  {
    id: 'portfolio',
    name: 'Portfolio Website',
    icon: 'web',
    description: 'Personal portfolio with project showcase, about section, and contact form.',
    suggestedStack: ['Next.js', 'Tailwind CSS', 'Vercel'],
  },
  {
    id: 'dashboard',
    name: 'Analytics Dashboard',
    icon: 'dashboard',
    description: 'Data visualization dashboard with charts, filters, and real-time updates.',
    suggestedStack: ['React', 'Chart.js', 'Express', 'PostgreSQL'],
  },
  {
    id: 'chat',
    name: 'Chat Application',
    icon: 'chat',
    description: 'Real-time messaging app with rooms, direct messages, and notifications.',
    suggestedStack: ['React', 'Socket.io', 'Node.js', 'Redis'],
  },
  {
    id: 'api',
    name: 'REST API',
    icon: 'api',
    description: 'Production-ready RESTful API with authentication, rate limiting, and documentation.',
    suggestedStack: ['Express', 'PostgreSQL', 'JWT', 'Swagger'],
  },
];

function generateFallbackPlan(description, difficulty, template) {
  const templateData = template ? PROJECT_TEMPLATES.find(t => t.id === template) : null;
  const name = templateData ? templateData.name : 'Custom Project';
  const desc = templateData ? templateData.description : description;
  const stack = templateData ? templateData.suggestedStack : ['React', 'Node.js', 'PostgreSQL'];

  return {
    name,
    description: desc,
    difficulty: difficulty || 'Intermediate',
    techStack: {
      frontend: stack.filter(s => ['React', 'Next.js', 'Vue.js', 'Tailwind CSS'].includes(s)),
      backend: stack.filter(s => ['Node.js', 'Express', 'Socket.io'].includes(s)),
      database: stack.filter(s => ['PostgreSQL', 'MongoDB', 'Redis'].includes(s)),
      tools: stack.filter(s => ['JWT', 'Swagger', 'Stripe', 'Chart.js', 'Vercel'].includes(s)),
      reasoning: 'This stack provides a solid foundation for building modern web applications with a focus on developer productivity and scalability.',
    },
    folderStructure: [
      { path: 'src/', type: 'dir', depth: 0 },
      { path: 'src/components/', type: 'dir', depth: 1 },
      { path: 'src/components/Header.jsx', type: 'file', depth: 2 },
      { path: 'src/components/Footer.jsx', type: 'file', depth: 2 },
      { path: 'src/pages/', type: 'dir', depth: 1 },
      { path: 'src/pages/Home.jsx', type: 'file', depth: 2 },
      { path: 'src/pages/Dashboard.jsx', type: 'file', depth: 2 },
      { path: 'src/hooks/', type: 'dir', depth: 1 },
      { path: 'src/hooks/useAuth.js', type: 'file', depth: 2 },
      { path: 'src/utils/', type: 'dir', depth: 1 },
      { path: 'src/utils/api.js', type: 'file', depth: 2 },
      { path: 'server/', type: 'dir', depth: 0 },
      { path: 'server/index.js', type: 'file', depth: 1 },
      { path: 'server/routes/', type: 'dir', depth: 1 },
      { path: 'server/routes/api.js', type: 'file', depth: 2 },
      { path: 'server/models/', type: 'dir', depth: 1 },
      { path: 'server/middleware/', type: 'dir', depth: 1 },
      { path: 'package.json', type: 'file', depth: 0 },
      { path: 'README.md', type: 'file', depth: 0 },
      { path: '.env', type: 'file', depth: 0 },
    ],
    databaseSchema: [
      {
        table: 'users',
        columns: [
          { name: 'id', type: 'SERIAL PRIMARY KEY' },
          { name: 'email', type: 'VARCHAR(255) UNIQUE NOT NULL' },
          { name: 'password_hash', type: 'VARCHAR(255) NOT NULL' },
          { name: 'name', type: 'VARCHAR(100)' },
          { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()' },
        ],
        relationships: [],
      },
      {
        table: 'items',
        columns: [
          { name: 'id', type: 'SERIAL PRIMARY KEY' },
          { name: 'user_id', type: 'INTEGER REFERENCES users(id)' },
          { name: 'title', type: 'VARCHAR(255) NOT NULL' },
          { name: 'description', type: 'TEXT' },
          { name: 'status', type: "VARCHAR(50) DEFAULT 'active'" },
          { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()' },
        ],
        relationships: ['user_id -> users.id'],
      },
    ],
    apiEndpoints: [
      { method: 'POST', path: '/api/auth/register', description: 'Register a new user' },
      { method: 'POST', path: '/api/auth/login', description: 'Authenticate and receive token' },
      { method: 'GET', path: '/api/items', description: 'List all items for current user' },
      { method: 'POST', path: '/api/items', description: 'Create a new item' },
      { method: 'PUT', path: '/api/items/:id', description: 'Update an existing item' },
      { method: 'DELETE', path: '/api/items/:id', description: 'Delete an item' },
    ],
    features: [
      { name: 'User Authentication', priority: 'High', description: 'JWT-based login and registration' },
      { name: 'CRUD Operations', priority: 'High', description: 'Create, read, update, delete items' },
      { name: 'Responsive Design', priority: 'Medium', description: 'Mobile-first responsive layout' },
      { name: 'Search & Filter', priority: 'Medium', description: 'Search and filter items' },
      { name: 'Dark Mode', priority: 'Low', description: 'Toggle between light and dark themes' },
    ],
    implementationSteps: [
      { step: 1, title: 'Project Setup', description: 'Initialize the project with your chosen framework and install dependencies.', tasks: ['Run create-react-app or Vite init', 'Set up folder structure', 'Install core dependencies'] },
      { step: 2, title: 'Database & Models', description: 'Design and create database tables, set up ORM or query builder.', tasks: ['Create database schema', 'Set up connection pool', 'Write model functions'] },
      { step: 3, title: 'Authentication', description: 'Implement user registration and login with JWT tokens.', tasks: ['Create auth routes', 'Hash passwords with bcrypt', 'Generate and verify JWT tokens'] },
      { step: 4, title: 'Core API', description: 'Build the main CRUD API endpoints.', tasks: ['Create route handlers', 'Add input validation', 'Write middleware for auth'] },
      { step: 5, title: 'Frontend Components', description: 'Build the UI components and connect to the API.', tasks: ['Create layout components', 'Build forms and lists', 'Set up API client'] },
      { step: 6, title: 'Testing & Polish', description: 'Write tests, handle edge cases, and polish the UI.', tasks: ['Write unit tests', 'Add error handling', 'Optimize performance'] },
    ],
  };
}

function generateFallbackReadme(projectPlan) {
  const name = projectPlan?.name || 'My Project';
  const desc = projectPlan?.description || 'A web application built with modern technologies.';
  const stack = projectPlan?.techStack || {};
  const allTech = [
    ...(stack.frontend || []),
    ...(stack.backend || []),
    ...(stack.database || []),
    ...(stack.tools || []),
  ];

  return `# ${name}

${desc}

## Tech Stack

${allTech.map(t => `- ${t}`).join('\n')}

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
${(stack.database || []).includes('PostgreSQL') ? '- PostgreSQL 14+' : ''}

### Installation

\`\`\`bash
# Clone the repository
git clone https://github.com/yourusername/${name.toLowerCase().replace(/\s+/g, '-')}.git
cd ${name.toLowerCase().replace(/\s+/g, '-')}

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Start development server
npm run dev
\`\`\`

## Features

${(projectPlan?.features || []).map(f => `- **${f.name}**: ${f.description}`).join('\n')}

## API Documentation

| Method | Endpoint | Description |
|--------|----------|-------------|
${(projectPlan?.apiEndpoints || []).map(e => `| ${e.method} | \`${e.path}\` | ${e.description} |`).join('\n')}

## Project Structure

\`\`\`
${(projectPlan?.folderStructure || []).map(f => {
  const indent = '  '.repeat(f.depth);
  return `${indent}${f.path.split('/').pop() || f.path}`;
}).join('\n')}
\`\`\`

## Contributing

1. Fork the repository
2. Create your feature branch (\`git checkout -b feature/amazing-feature\`)
3. Commit your changes (\`git commit -m 'Add amazing feature'\`)
4. Push to the branch (\`git push origin feature/amazing-feature\`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.
`;
}

function generateFallbackDeployment(projectPlan, platform) {
  const name = projectPlan?.name || 'My Project';

  const guides = {
    vercel: {
      platform: 'Vercel',
      steps: [
        { title: 'Install Vercel CLI', command: 'npm i -g vercel', description: 'Install the Vercel CLI globally.' },
        { title: 'Login to Vercel', command: 'vercel login', description: 'Authenticate with your Vercel account.' },
        { title: 'Configure Project', command: 'vercel', description: 'Run the Vercel command in your project root to set up the project.' },
        { title: 'Set Environment Variables', command: 'vercel env add', description: 'Add your environment variables (DATABASE_URL, JWT_SECRET, etc.).' },
        { title: 'Deploy to Production', command: 'vercel --prod', description: 'Deploy your project to production.' },
      ],
      notes: [
        'Vercel is best suited for frontend (Next.js, React) and serverless functions.',
        'For a full-stack app, deploy the backend separately on Railway or Render.',
        'Add a vercel.json for custom routing if needed.',
      ],
    },
    railway: {
      platform: 'Railway',
      steps: [
        { title: 'Create Railway Account', command: null, description: 'Sign up at railway.app and connect your GitHub repository.' },
        { title: 'Install Railway CLI', command: 'npm i -g @railway/cli', description: 'Install the Railway CLI.' },
        { title: 'Login', command: 'railway login', description: 'Authenticate with your Railway account.' },
        { title: 'Initialize Project', command: 'railway init', description: 'Link your local project to a Railway project.' },
        { title: 'Add PostgreSQL', command: 'railway add', description: 'Select PostgreSQL from the available plugins to add a database.' },
        { title: 'Deploy', command: 'railway up', description: 'Deploy your application. Railway auto-detects Node.js projects.' },
      ],
      notes: [
        'Railway provides free PostgreSQL databases with generous limits.',
        'Environment variables are auto-injected from connected services.',
        'Use railway.toml for custom build and start commands.',
      ],
    },
    render: {
      platform: 'Render',
      steps: [
        { title: 'Create Render Account', command: null, description: 'Sign up at render.com and connect your GitHub repository.' },
        { title: 'Create Web Service', command: null, description: 'Click "New +" and select "Web Service". Choose your repository.' },
        { title: 'Configure Build', command: 'npm install && npm run build', description: 'Set the build command in your Render dashboard.' },
        { title: 'Configure Start', command: 'npm start', description: 'Set the start command for your service.' },
        { title: 'Add Database', command: null, description: 'Create a new PostgreSQL database from the Render dashboard and link it.' },
        { title: 'Set Environment Variables', command: null, description: 'Add DATABASE_URL, JWT_SECRET, and other variables in the dashboard.' },
      ],
      notes: [
        'Render offers free tier with auto-deploys from GitHub.',
        'Static sites deploy instantly; web services may take a few minutes.',
        'Use render.yaml for infrastructure-as-code configuration.',
      ],
    },
  };

  return guides[platform] || guides.vercel;
}

// ── POST /generate — Generate project plan from description ───────────────────
router.post('/generate', authenticateToken, requirePlan(1), async (req, res) => {
  try {
    const { description, difficulty, template } = req.body;

    if (!description && !template) {
      return res.status(400).json({ error: 'Project description or template is required.' });
    }

    const templateData = template ? PROJECT_TEMPLATES.find(t => t.id === template) : null;
    const projectDesc = description || (templateData ? templateData.description : '');
    const difficultyLevel = difficulty || 'Intermediate';

    const systemPrompt = `You are a senior software architect. Output ONLY valid JSON — no markdown, no explanation. Design a complete project plan for a ${difficultyLevel}-level developer.`;

    const userPrompt = `Create a detailed project plan for: "${projectDesc}"
Difficulty: ${difficultyLevel}
${templateData ? `Template: ${templateData.name} (${templateData.suggestedStack.join(', ')})` : ''}

JSON schema:
{
  "name": "string",
  "description": "string",
  "difficulty": "${difficultyLevel}",
  "techStack": {
    "frontend": ["string"],
    "backend": ["string"],
    "database": ["string"],
    "tools": ["string"],
    "reasoning": "string explaining why this stack"
  },
  "folderStructure": [{"path":"string","type":"dir|file","depth":number}],
  "databaseSchema": [{"table":"string","columns":[{"name":"string","type":"string"}],"relationships":["string"]}],
  "apiEndpoints": [{"method":"GET|POST|PUT|DELETE","path":"string","description":"string"}],
  "features": [{"name":"string","priority":"High|Medium|Low","description":"string"}],
  "implementationSteps": [{"step":number,"title":"string","description":"string","tasks":["string"]}]
}`;

    const aiResult = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 1200,
      temperature: 0.5,
      model: process.env.LM_STUDIO_MODEL_PROJECT || process.env.LM_STUDIO_MODEL,
      structuredJson: true,
    });

    let plan;
    let aiPowered = false;

    if (aiResult.ok) {
      plan = extractJSON(aiResult.data);
      if (plan?.name && plan?.techStack) {
        aiPowered = true;
      } else {
        console.warn('Failed to parse project plan JSON, using fallback');
        plan = generateFallbackPlan(projectDesc, difficultyLevel, template);
      }
    } else {
      console.warn('AI project plan generation failed, using fallback:', aiResult.error);
      plan = generateFallbackPlan(projectDesc, difficultyLevel, template);
    }

    res.json({ plan, aiPowered });
  } catch (err) {
    console.error('Project plan generation error:', err.message);
    res.status(500).json({ error: 'Failed to generate project plan.' });
  }
});

// ── POST /readme — Generate README from project plan ──────────────────────────
router.post('/readme', authenticateToken, requirePlan(1), async (req, res) => {
  try {
    const { projectPlan } = req.body;
    if (!projectPlan) {
      return res.status(400).json({ error: 'Project plan is required.' });
    }

    const systemPrompt = `You are a technical writer. Generate a professional, comprehensive README.md in markdown format. Include all standard sections. Output ONLY the markdown content.`;

    const userPrompt = `Generate a professional README.md for this project:
Name: ${projectPlan.name}
Description: ${projectPlan.description}
Tech Stack: ${JSON.stringify(projectPlan.techStack)}
Features: ${JSON.stringify(projectPlan.features)}
API Endpoints: ${JSON.stringify(projectPlan.apiEndpoints)}
Folder Structure: ${JSON.stringify(projectPlan.folderStructure)}`;

    const aiResult = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 1200,
      temperature: 0.4,
      model: process.env.LM_STUDIO_MODEL_PROJECT || process.env.LM_STUDIO_MODEL,
    });

    let readme;
    let aiPowered = false;

    if (aiResult.ok && aiResult.data) {
      readme = aiResult.data;
      aiPowered = true;
    } else {
      console.warn('AI README generation failed, using fallback');
      readme = generateFallbackReadme(projectPlan);
    }

    res.json({ readme, aiPowered });
  } catch (err) {
    console.error('README generation error:', err.message);
    res.status(500).json({ error: 'Failed to generate README.' });
  }
});

// ── POST /deployment — Generate deployment guide ──────────────────────────────
router.post('/deployment', authenticateToken, requirePlan(1), async (req, res) => {
  try {
    const { projectPlan, platform } = req.body;
    if (!projectPlan) {
      return res.status(400).json({ error: 'Project plan is required.' });
    }

    const validPlatforms = ['vercel', 'railway', 'render'];
    const selectedPlatform = validPlatforms.includes(platform) ? platform : 'vercel';

    const systemPrompt = `You are a DevOps engineer. Output ONLY valid JSON — no markdown, no explanation. Create a deployment guide.`;

    const userPrompt = `Create a deployment guide for deploying "${projectPlan.name}" to ${selectedPlatform}.
Tech stack: ${JSON.stringify(projectPlan.techStack)}

JSON schema:
{
  "platform": "${selectedPlatform}",
  "steps": [{"title":"string","command":"string|null","description":"string"}],
  "notes": ["string"]
}`;

    const aiResult = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 800,
      temperature: 0.4,
      model: process.env.LM_STUDIO_MODEL_PROJECT || process.env.LM_STUDIO_MODEL,
      structuredJson: true,
    });

    let guide;
    let aiPowered = false;

    if (aiResult.ok) {
      guide = extractJSON(aiResult.data);
      if (guide?.steps?.length) {
        aiPowered = true;
      } else {
        guide = generateFallbackDeployment(projectPlan, selectedPlatform);
      }
    } else {
      guide = generateFallbackDeployment(projectPlan, selectedPlatform);
    }

    res.json({ guide, aiPowered });
  } catch (err) {
    console.error('Deployment guide generation error:', err.message);
    res.status(500).json({ error: 'Failed to generate deployment guide.' });
  }
});

// ── GET /workspace — Get user's saved projects ───────────────────────────────
router.get('/workspace', authenticateToken, requirePlan(1), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, plan, status, tasks, notes, created_at, updated_at FROM project_workspace WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.user.id]
    );
    res.json({ projects: rows });
  } catch (err) {
    console.error('Workspace fetch error:', err.message);
    res.json({ projects: [] });
  }
});

// ── POST /workspace — Save a project ─────────────────────────────────────────
router.post('/workspace', authenticateToken, requirePlan(1), async (req, res) => {
  try {
    const { name, plan, status, tasks, notes } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Project name is required.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO project_workspace (user_id, name, plan, status, tasks, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, plan, status, tasks, notes, created_at, updated_at`,
      [
        req.user.id,
        name,
        JSON.stringify(plan || {}),
        status || 'Planning',
        JSON.stringify(tasks || []),
        notes || '',
      ]
    );

    res.json({ project: rows[0] });
  } catch (err) {
    console.error('Workspace save error:', err.message);
    res.status(500).json({ error: 'Failed to save project.' });
  }
});

// ── PUT /workspace/:id — Update a project ────────────────────────────────────
router.put('/workspace/:id', authenticateToken, requirePlan(1), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, tasks, notes } = req.body;

    const updates = [];
    const values = [];
    let idx = 1;

    if (status !== undefined) {
      updates.push(`status = $${idx++}`);
      values.push(status);
    }
    if (tasks !== undefined) {
      updates.push(`tasks = $${idx++}`);
      values.push(JSON.stringify(tasks));
    }
    if (notes !== undefined) {
      updates.push(`notes = $${idx++}`);
      values.push(notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id, req.user.id);

    const { rows } = await pool.query(
      `UPDATE project_workspace SET ${updates.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING id, name, plan, status, tasks, notes, created_at, updated_at`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    res.json({ project: rows[0] });
  } catch (err) {
    console.error('Workspace update error:', err.message);
    res.status(500).json({ error: 'Failed to update project.' });
  }
});

// ── GET /templates — Get project templates ────────────────────────────────────
router.get('/templates', authenticateToken, requirePlan(1), (req, res) => {
  res.json({ templates: PROJECT_TEMPLATES });
});

module.exports = router;
