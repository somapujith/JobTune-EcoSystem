const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../config/database');

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

// Generate deterministic-ish mock analysis scores from the filename
function generateAnalysis(fileName) {
  const seed = fileName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const rand = (min, max, offset = 0) => min + ((seed + offset) % (max - min + 1));

  const scores = {
    ats:           rand(62, 95, 1),
    impact:        rand(55, 90, 2),
    skills:        rand(65, 95, 3),
    clarity:       rand(60, 92, 4),
    completeness:  rand(58, 88, 5),
    industry_fit:  rand(50, 85, 6),
  };

  const overall = Math.round(
    Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length
  );

  const suggestions = [
    {
      type: overall >= 80 ? 'success' : 'warning',
      category: 'ATS Compatibility',
      message:
        overall >= 80
          ? 'Great ATS compatibility — your keywords align well with common job descriptions.'
          : 'Add more industry-specific keywords to improve ATS pass-through rate.',
    },
    {
      type: scores.impact >= 75 ? 'success' : 'warning',
      category: 'Impact Statements',
      message:
        scores.impact >= 75
          ? 'Strong impact statements with quantifiable achievements detected.'
          : 'Quantify achievements with numbers (e.g., "increased sales by 30%") for stronger impact.',
    },
    {
      type: 'info',
      category: 'Action Verbs',
      message: 'Start bullet points with strong action verbs (Led, Built, Designed, Optimized) to boost readability.',
    },
    {
      type: scores.clarity >= 75 ? 'success' : 'info',
      category: 'Structure & Clarity',
      message:
        scores.clarity >= 75
          ? 'Clear, well-structured sections detected. Good readability score.'
          : 'Consider using consistent formatting and clear section headers to improve clarity.',
    },
    {
      type: scores.completeness >= 70 ? 'success' : 'warning',
      category: 'Completeness',
      message:
        scores.completeness >= 70
          ? 'Resume covers all essential sections effectively.'
          : 'Consider adding a Summary, Projects, or Certifications section to boost completeness.',
    },
    {
      type: 'info',
      category: 'Skills Section',
      message: 'Group skills by category (Technical, Tools, Soft Skills) for faster recruiter scanning.',
    },
  ];

  const sections = {
    summary:      (seed % 3) !== 0,
    experience:   true,
    education:    true,
    skills:       true,
    projects:     (seed % 2) === 0,
    certifications: (seed % 5) === 0,
  };

  return { scores, overall, suggestions, sections };
}

// POST /api/resume/upload — analyze a resume file
router.post('/upload', authenticateToken, upload.single('resume'), async (req, res, next) => {
  try {
    const file = req.file;
    const fileName = file ? file.originalname : (req.body && req.body.fileName) || 'resume.pdf';
    const fileSize = file ? file.size : 0;

    const { scores, overall, suggestions, sections } = generateAnalysis(fileName);

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
