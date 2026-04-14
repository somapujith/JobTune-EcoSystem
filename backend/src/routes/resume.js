const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../config/database');
const { callAI } = require('../utils/aiClient');

// Memory storage — no disk writes needed for mock analysis
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and DOCX files are allowed'));
    }
  },
});

// Ensure the resumes table exists with all required columns.
// Uses ADD COLUMN per-column so existing tables get migrated automatically.
(async () => {
  try {
    // Base table (covers fresh installs)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS resumes (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        user_id      INT NOT NULL,
        file_name    VARCHAR(255) NOT NULL DEFAULT 'resume.pdf',
        file_size    INT DEFAULT 0,
        scores       JSON,
        sections     JSON,
        suggestions  JSON,
        overall_score INT DEFAULT 0,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Column migrations — safe to run every startup; ER_DUP_FIELDNAME is ignored
    const migrations = [
      ['file_name',     'VARCHAR(255) NOT NULL DEFAULT "resume.pdf"'],
      ['file_size',     'INT DEFAULT 0'],
      ['suggestions',   'JSON'],
      ['overall_score', 'INT DEFAULT 0'],
    ];
    for (const [col, def] of migrations) {
      try {
        await pool.query(`ALTER TABLE resumes ADD COLUMN ${col} ${def}`);
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') throw e;
      }
    }
  } catch (err) {
    console.error('Resume table migration error:', err.message);
  }
})();

// ── Extract plain text from the uploaded file buffer ─────────────────────────
async function extractText(file) {
  if (!file) return '';
  try {
    if (file.mimetype === 'application/pdf') {
      const data = await pdfParse(file.buffer);
      return data.text || '';
    }
  } catch (e) {
    console.error('PDF parse error:', e.message);
  }
  // For DOCX or parse failures fall back to empty string
  return '';
}

// ── Detect which sections are actually present in the resume text ─────────────
function detectSections(text) {
  const upper = text.toUpperCase();
  const has = (keywords) => keywords.some((kw) => upper.includes(kw));

  return {
    summary:        has(['SUMMARY', 'OBJECTIVE', 'PROFILE', 'ABOUT ME', 'PROFESSIONAL SUMMARY']),
    experience:     has(['EXPERIENCE', 'WORK EXPERIENCE', 'EMPLOYMENT', 'PROFESSIONAL EXPERIENCE', 'INTERNSHIP', 'INTERNSHIPS']),
    education:      has(['EDUCATION', 'ACADEMIC', 'QUALIFICATIONS', 'QUALIFICATION']),
    skills:         has(['SKILLS', 'TECHNICAL SKILLS', 'SKILL SUMMARY', 'SKILLS SUMMARY', 'COMPETENCIES', 'TECHNOLOGIES']),
    projects:       has(['PROJECTS', 'PROJECT', 'PERSONAL PROJECTS', 'KEY PROJECTS', 'ACADEMIC PROJECTS']),
    certifications: has(['CERTIFICATION', 'CERTIFICATIONS', 'CERTIFICATES', 'CERTIFICATE', 'COURSES', 'TRAINING']),
  };
}

// ── Score the resume based on real content signals ───────────────────────────
function scoreResume(text, sections, fileName) {
  const upper = text.toUpperCase();
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  // Action verbs check
  const actionVerbs = ['BUILT','DEVELOPED','DESIGNED','IMPLEMENTED','LED','CREATED','OPTIMIZED',
    'IMPROVED','MANAGED','ACHIEVED','DELIVERED','LAUNCHED','AUTOMATED','ENGINEERED',
    'ARCHITECTED','DEPLOYED','REDUCED','INCREASED','COLLABORATED','MENTORED'];
  const verbCount = actionVerbs.filter((v) => upper.includes(v)).length;

  // Quantification — numbers with % or multipliers
  const metricMatches = (text.match(/\d+\s*(%|x\b|times|hours|days|weeks|months|users|customers|ms\b)/gi) || []).length;

  // Tech keywords — use simple includes so no regex special-char issues
  const techKeywords = ['PYTHON','JAVASCRIPT','REACT','NODE.JS','NODE','SQL','AWS','DOCKER',
    'GIT','TYPESCRIPT','JAVA','C++','FLASK','MONGODB','MACHINE LEARNING','API','REST',
    'XGBOOST','SCIKIT','TENSORFLOW','PYTORCH','KUBERNETES','LINUX'];
  const techCount = techKeywords.filter((k) => upper.includes(k)).length;

  // Section count for completeness
  const sectionCount = Object.values(sections).filter(Boolean).length;

  // ATS: tech keywords presence + section structure
  const ats = Math.min(98, 50 + techCount * 3 + sectionCount * 3 + (wordCount > 200 ? 5 : 0));

  // Impact: action verbs + metrics
  const impact = Math.min(95, 40 + verbCount * 4 + metricMatches * 6);

  // Skills: tech keyword density
  const skills = Math.min(98, 50 + techCount * 4 + (sections.skills ? 10 : 0));

  // Clarity: reasonable word count + good section count
  const clarity = Math.min(95, 45 + sectionCount * 5 + (wordCount > 150 && wordCount < 800 ? 15 : 5) + (verbCount > 3 ? 10 : 0));

  // Completeness: how many of the 6 key sections are present
  const completeness = Math.min(98, Math.round((sectionCount / 6) * 100));

  // Industry fit: tech keywords + certifications + projects
  const industry_fit = Math.min(95, 40 + techCount * 3 + (sections.certifications ? 10 : 0) + (sections.projects ? 10 : 0));

  const scores = {
    ats:           Math.max(40, ats),
    impact:        Math.max(35, impact),
    skills:        Math.max(40, skills),
    clarity:       Math.max(40, clarity),
    completeness:  Math.max(30, completeness),
    industry_fit:  Math.max(35, industry_fit),
  };

  const overall = Math.round(
    Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length
  );

  return { scores, overall, verbCount, metricMatches, techCount, sectionCount };
}

// ── Build contextual improvement suggestions ──────────────────────────────────
function buildSuggestions(scores, sections, verbCount, metricMatches, techCount) {
  const suggestions = [];

  // ATS
  suggestions.push({
    type: scores.ats >= 75 ? 'success' : 'warning',
    category: 'ATS Compatibility',
    message: scores.ats >= 75
      ? `Good ATS compatibility — ${techCount} technical keyword${techCount !== 1 ? 's' : ''} detected in your resume.`
      : 'Add more industry-specific technical keywords to improve ATS pass-through rate.',
  });

  // Impact / metrics
  suggestions.push({
    type: metricMatches >= 2 ? 'success' : 'warning',
    category: 'Impact & Metrics',
    message: metricMatches >= 2
      ? `${metricMatches} quantified achievement${metricMatches !== 1 ? 's' : ''} found — great use of numbers to show impact.`
      : 'Quantify your achievements (e.g., "improved accuracy by 15–20%") so recruiters can see concrete impact.',
  });

  // Action verbs
  suggestions.push({
    type: verbCount >= 5 ? 'success' : 'info',
    category: 'Action Verbs',
    message: verbCount >= 5
      ? `Strong use of action verbs (${verbCount} detected) makes your bullet points impactful.`
      : 'Start more bullet points with strong action verbs like Built, Designed, Optimized, Deployed.',
  });

  // Missing sections
  const missing = Object.entries(sections).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length === 0) {
    suggestions.push({ type: 'success', category: 'Section Coverage', message: 'All key resume sections are present — excellent structure.' });
  } else {
    suggestions.push({
      type: 'warning',
      category: 'Missing Sections',
      message: `Consider adding: ${missing.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')} to strengthen your resume.`,
    });
  }

  // Skills grouping
  suggestions.push({
    type: sections.skills ? 'info' : 'warning',
    category: 'Skills Section',
    message: sections.skills
      ? 'Skills section detected. Group by category (Languages, Frameworks, Tools, Soft Skills) for faster scanning.'
      : 'Add a dedicated Skills section with technical and soft skills grouped by category.',
  });

  // Certifications
  suggestions.push({
    type: sections.certifications ? 'success' : 'info',
    category: 'Certifications',
    message: sections.certifications
      ? 'Certifications section found — these add strong credibility to your profile.'
      : 'Adding certifications or online course completions can boost your industry credibility.',
  });

  return suggestions;
}

// POST /api/resume/upload — analyze a resume file
router.post('/upload', authenticateToken, upload.single('resume'), async (req, res, next) => {
  try {
    const file = req.file;
    const fileName = file ? file.originalname : (req.body && req.body.fileName) || 'resume.pdf';
    const fileSize = file ? file.size : 0;

    // Extract real text from the uploaded file
    const text = await extractText(file);

    // Detect actual sections present in the resume
    const sections = detectSections(text);

    // Score based on content signals
    const { scores, overall, verbCount, metricMatches, techCount } = scoreResume(text, sections, fileName);

    // Build contextual suggestions
    const suggestions = buildSuggestions(scores, sections, verbCount, metricMatches, techCount);

    const [result] = await pool.query(
      `INSERT INTO resumes (user_id, file_name, file_size, scores, sections, suggestions, overall_score)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        fileName,
        fileSize,
        JSON.stringify(scores),
        JSON.stringify(sections),
        JSON.stringify(suggestions),
        overall,
      ]
    );

    const [rows] = await pool.query('SELECT * FROM resumes WHERE id = ?', [result.insertId]);
    const resume = parseJsonFields(rows[0]);

    res.json({ success: true, data: resume });
  } catch (err) {
    next(err);
  }
});

// GET /api/resume/list — get this user's recent resumes
router.get('/list', authenticateToken, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, file_name, file_size, overall_score, scores, created_at
       FROM resumes WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json({ success: true, data: rows.map(parseJsonFields) });
  } catch (err) {
    next(err);
  }
});

// GET /api/resume/scores — latest scores for the logged-in user
router.get('/scores', authenticateToken, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT scores, overall_score FROM resumes WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );
    if (rows.length === 0) return res.json({ success: true, data: null });

    const row = rows[0];
    res.json({
      success: true,
      data: {
        scores: parseJson(row.scores),
        overall_score: row.overall_score,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/resume/:id — get a specific resume with full analysis
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM resumes WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Resume not found' });
    }
    res.json({ success: true, data: parseJsonFields(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// POST /api/resume/ai-edit — AI-powered resume editing via OpenAI
router.post('/ai-edit', authenticateToken, async (req, res, next) => {
  try {
    const { instruction, resumeText, context } = req.body;

    if (!instruction || typeof instruction !== 'string' || instruction.trim().length === 0) {
      return res.status(400).json({ error: 'instruction is required' });
    }

    const systemPrompt = `You are an expert resume coach and professional writer with 15+ years of experience helping candidates land jobs at top companies. Your role is to provide specific, actionable improvements to resumes.

When given a resume or resume section and an instruction:
1. Provide clear, concrete suggestions or rewritten content
2. Use strong action verbs, quantified achievements, and industry-relevant keywords
3. Keep suggestions concise, professional, and ATS-friendly
4. Format your response in clear sections when relevant
5. If rewriting content, provide the improved version directly`;

    const userMessage = resumeText
      ? `Here is my resume content:\n\n${resumeText.slice(0, 4000)}\n\n---\n\nInstruction: ${instruction}`
      : `Instruction: ${instruction}${context ? `\n\nContext: ${context}` : ''}`;

    const aiResult = await callAI({ 
      systemPrompt, 
      userPrompt: userMessage, 
      maxTokens: 256, 
      temperature: 0.2 
    });
 
    if (aiResult.ok && aiResult.data) {
      return res.json({ success: true, data: { suggestion: aiResult.data } });
    }

    res.status(502).json({ 
      error: aiResult.error || 'AI service unavailable. Please try again later.' 
    });
  } catch (err) {
    next(err);
  }
});

function parseJson(value) {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

function parseJsonFields(row) {
  if (!row) return row;
  return {
    ...row,
    scores:      parseJson(row.scores),
    sections:    parseJson(row.sections),
    suggestions: parseJson(row.suggestions),
  };
}

module.exports = router;
