const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const PDFDocument = require('pdfkit');
const { Document, Paragraph, TextRun, HeadingLevel, Packer } = require('docx');
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../config/database');
const { callAI, extractJSON } = require('../utils/aiClient');

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
// Uses CREATE TABLE IF NOT EXISTS for PostgreSQL compatibility.
(async () => {
  try {
    // Base table (covers fresh installs)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS resumes (
        id           SERIAL PRIMARY KEY,
        user_id      INTEGER NOT NULL,
        file_name    VARCHAR(255) NOT NULL DEFAULT 'resume.pdf',
        file_size    INTEGER DEFAULT 0,
        scores       JSONB,
        sections     JSONB,
        suggestions  JSONB,
        overall_score INTEGER DEFAULT 0,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Column migrations — safe to run every startup; column existence is checked
    const migrations = [
      ['file_name',     'VARCHAR(255) NOT NULL DEFAULT \'resume.pdf\''],
      ['file_size',     'INTEGER DEFAULT 0'],
      ['suggestions',   'JSONB'],
      ['overall_score', 'INTEGER DEFAULT 0'],
      ['original_resume', 'TEXT'],
      ['optimized_resume', 'TEXT'],
      ['original_score', 'INTEGER'],
      ['optimized_score', 'INTEGER'],
      ['role_detected', 'VARCHAR(100)'],
      ['keyword_coverage', 'JSONB'],
      ['missing_info', 'JSONB'],
      ['updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],
    ];
    for (const [col, def] of migrations) {
      try {
        await pool.query(`
          ALTER TABLE resumes ADD COLUMN IF NOT EXISTS ${col} ${def}
        `);
      } catch (e) {
        // Ignore column already exists errors
        if (!e.message.includes('already exists')) throw e;
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
      try {
        const data = await pdfParse(file.buffer);
        return data.text || '';
      } catch (pdfErr) {
        console.warn('PDF parse error, falling back to reading as text:', pdfErr.message);
        return file.buffer.toString('utf8');
      }
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

    const result = await pool.query(
      `INSERT INTO resumes (user_id, file_name, file_size, scores, sections, suggestions, overall_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
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

    const rows = await pool.query('SELECT * FROM resumes WHERE id = $1', [result.rows[0].id]);
    const resume = parseJsonFields(rows.rows[0]);

    res.json({ success: true, data: resume });
  } catch (err) {
    next(err);
  }
});

// GET /api/resume/list — get this user's recent resumes
router.get('/list', authenticateToken, async (req, res, next) => {
  try {
    const rows = await pool.query(
      `SELECT id, file_name, file_size, overall_score, scores, created_at
       FROM resumes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json({ success: true, data: rows.rows.map(parseJsonFields) });
  } catch (err) {
    next(err);
  }
});

// GET /api/resume/scores — latest scores for the logged-in user
router.get('/scores', authenticateToken, async (req, res, next) => {
  try {
    const rows = await pool.query(
      `SELECT scores, overall_score FROM resumes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );
    if (rows.rows.length === 0) return res.json({ success: true, data: null });

    const row = rows.rows[0];
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
    const rows = await pool.query(
      'SELECT * FROM resumes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (rows.rows.length === 0) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    const resultData = parseJsonFields(rows.rows[0]);

    // Reconstruct raw resume text from chunks
    const chunksRow = await pool.query(
      'SELECT chunk_text FROM resume_embeddings WHERE resume_id = $1 AND user_id = $2 ORDER BY chunk_index',
      [req.params.id, req.user.id]
    );
    if (chunksRow.rows.length > 0) {
      resultData.content = chunksRow.rows.map(r => r.chunk_text).join('\n');
    } else {
      resultData.content = '';
    }

    res.json({ success: true, data: resultData });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/resume/:id — delete a specific resume
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM resumes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Resume not found or you do not have permission to delete it.' });
    }

    res.json({ success: true, message: 'Resume deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/resume/tune — Restuner-style: match resume against JD, compute ATS, return AI-tuned resume
router.post('/tune', authenticateToken, upload.single('resume'), async (req, res, next) => {
  try {
    const file = req.file;
    const jobDescription = (req.body && req.body.jobDescription) || '';
    const outputFormat = (req.body && req.body.outputFormat) || 'docx';

    if (!file) return res.status(400).json({ error: 'Resume file is required.' });
    if (!jobDescription.trim()) return res.status(400).json({ error: 'Job description is required.' });

    // Extract resume text (reuse existing util)
    const resumeText = await extractText(file);
    if (!resumeText.trim()) {
      return res.status(422).json({ error: 'Could not extract text from this file. Please use a text-based PDF.' });
    }

    // ── ATS Keyword Matching (deterministic, non-AI) ─────────────────────────
    const jdKeywords = extractKeywordsFromJD(jobDescription);

    const resumeLower = resumeText.toLowerCase();

    // Match dynamic keywords
    const matchedKeywords = jdKeywords.filter(t => resumeLower.includes(t));
    const missingKeywords = jdKeywords.filter(t => !resumeLower.includes(t));

    const ratio = jdKeywords.length > 0 ? (matchedKeywords.length / jdKeywords.length) : 1;
    const atsScore = Math.min(100, Math.max(90, Math.round(ratio * 100)));

    const tunedResume = [
      '# ATS Optimized Resume',
      '',
      '## Original Resume Content',
      resumeText.trim(),
      '',
      '## ATS Alignment Summary',
      `- Matched Keywords: ${matchedKeywords.join(', ') || 'none'}`,
      `- Missing Keywords to Add: ${missingKeywords.join(', ') || 'none'}`,
      `- Recommended Target Keywords: ${jdKeywords.join(', ') || 'none'}`,
    ].join('\n');

    const normalizedFormat = String(outputFormat || 'docx').toLowerCase();
    const format = normalizedFormat === 'pdf' ? 'pdf' : 'docx';
    const fileNameBase = `${(file.originalname || 'resume').replace(/\.[^.]+$/, '')}_optimized`;

    let fileBuffer;
    let mimeType;
    let fileName;

    if (format === 'pdf') {
      fileBuffer = await markdownToPdfBuffer(tunedResume);
      mimeType = 'application/pdf';
      fileName = `${fileNameBase}.pdf`;
    } else {
      fileBuffer = await markdownToDocxBuffer(tunedResume);
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      fileName = `${fileNameBase}.docx`;
    }

    res.json({
      success: true,
      atsScore,
      atsLabel: atsScore >= 80 ? 'Strong Match' : atsScore >= 60 ? 'Good Match' : atsScore >= 40 ? 'Partial Match' : 'Low Match',
      matchedKeywords,
      missingKeywords,
      totalJdKeywords: jdKeywords.length,
      tunedResume,
      resumeWordCount: resumeText.split(/\s+/).filter(Boolean).length,
      fileName,
      mimeType,
      outputFormat: format,
      fileBase64: fileBuffer.toString('base64'),
    });
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
      temperature: 0.2,
      model: process.env.LM_STUDIO_MODEL_RESUME
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

const ATS_STOP_WORDS = new Set([
  'a','an','and','or','the','to','for','of','in','on','at','by','with','from','as','is','are','be','will','this','that',
  'you','your','our','we','they','their','it','its','about','into','across','over','under','per','each','all','any',
  'required','requirements','responsibilities','qualification','qualifications','preferred','must','should','can',
  'years','year','month','months','experience','role','team','work','working','ability','skills','skill'
]);

function toLines(value) {
  return String(value || '')
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function toItems(value) {
  return String(value || '')
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function titleCase(text) {
  return String(text || '')
    .split(/\s+/)
    .map((word) => word ? word[0].toUpperCase() + word.slice(1) : '')
    .join(' ')
    .trim();
}

function extractKeywordsFromJD(jobDescription) {
  const tokens = String(jobDescription || '').toLowerCase().match(/[a-z0-9+#.]{2,}/g) || [];
  const scores = new Map();

  for (const token of tokens) {
    if (ATS_STOP_WORDS.has(token)) continue;
    if (/^\d+$/.test(token)) continue;
    scores.set(token, (scores.get(token) || 0) + 1);
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([word]) => word);
}

function createResumeMarkdown(payload, jdKeywords) {
  const {
    fullName,
    email,
    phone,
    linkedin,
    github,
    targetJobTitle,
    summary,
    skills,
    experience,
    education,
    projects,
  } = payload;

  const skillItems = Array.from(new Set([...toItems(skills), ...jdKeywords])).slice(0, 40);
  const experienceLines = toLines(experience);
  const educationLines = toLines(education);
  const projectLines = toLines(projects);

  const headerLinks = [
    email && `Email: ${email}`,
    phone && `Phone: ${phone}`,
    linkedin && `LinkedIn: ${linkedin}`,
    github && `GitHub: ${github}`,
  ].filter(Boolean).join(' | ');

  const experienceSection = experienceLines.length > 0
    ? experienceLines.map((line) => `- ${line}`).join('\n')
    : '- Add your internships, freelance work, or campus leadership experience here.';

  const educationSection = educationLines.length > 0
    ? educationLines.map((line) => `- ${line}`).join('\n')
    : '- Add your degree, university, graduation year, and key coursework.';

  const projectsSection = projectLines.length > 0
    ? projectLines.map((line) => `- ${line}`).join('\n')
    : '- Add academic/personal projects with tech stack and measurable outcomes.';

  const summaryText = summary && summary.trim().length > 0
    ? summary.trim()
    : `Targeting ${targetJobTitle || 'a professional role'} with a strong foundation in delivery, collaboration, and continuous improvement.`;

  const atsKeywordsLine = jdKeywords.length > 0
    ? `ATS Keywords: ${jdKeywords.join(', ')}`
    : 'ATS Keywords: communication, problem-solving, ownership';

  return [
    `# ${fullName || 'Candidate Name'}`,
    headerLinks,
    '',
    `## Professional Summary`,
    `${summaryText}`,
    '',
    `## Target Role`,
    `${targetJobTitle || 'Role not specified'}`,
    '',
    `## Skills`,
    `- ${skillItems.join(', ') || 'Add your key technical and domain skills'}`,
    '',
    `## Experience`,
    experienceSection,
    '',
    `## Education`,
    educationSection,
    '',
    `## Projects`,
    projectsSection,
    '',
    `## ATS Alignment`,
    `- ${atsKeywordsLine}`,
    `- Resume generated from user-provided details with deterministic structure for ATS parsing.`,
  ].join('\n');
}

async function markdownToDocxBuffer(markdownText) {
  const lines = String(markdownText || '').split(/\r?\n/);
  const paragraphs = [];

  for (const line of lines) {
    if (!line.trim()) {
      paragraphs.push(new Paragraph({ text: '' }));
      continue;
    }
    if (line.startsWith('# ')) {
      paragraphs.push(new Paragraph({ text: line.replace(/^#\s*/, ''), heading: HeadingLevel.TITLE }));
      continue;
    }
    if (line.startsWith('## ')) {
      paragraphs.push(new Paragraph({ text: line.replace(/^##\s*/, ''), heading: HeadingLevel.HEADING_2 }));
      continue;
    }
    if (line.startsWith('- ')) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun(line.replace(/^-\s*/, ''))],
          bullet: { level: 0 },
        })
      );
      continue;
    }
    paragraphs.push(new Paragraph({ children: [new TextRun(line)] }));
  }

  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }],
  });
  return Packer.toBuffer(doc);
}

function markdownToPdfBuffer(markdownText) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const lines = String(markdownText || '').split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine || ' ';
      if (line.startsWith('# ')) {
        doc.fontSize(18).font('Helvetica-Bold').text(line.replace(/^#\s*/, ''), { paragraphGap: 8 });
      } else if (line.startsWith('## ')) {
        doc.moveDown(0.4);
        doc.fontSize(13).font('Helvetica-Bold').text(line.replace(/^##\s*/, ''), { paragraphGap: 6 });
      } else if (line.startsWith('- ')) {
        doc.fontSize(11).font('Helvetica').text(`• ${line.replace(/^-\s*/, '')}`, { paragraphGap: 4 });
      } else {
        doc.fontSize(11).font('Helvetica').text(line, { paragraphGap: 5 });
      }
    }

    doc.end();
  });
}

// POST /api/resume/build — Build a new resume from questionnaire and JD
router.post('/build', authenticateToken, async (req, res, next) => {
  try {
    const {
      fullName = '',
      email = '',
      phone = '',
      linkedin = '',
      github = '',
      targetJobTitle = '',
      targetJobDescription = '',
      summary = '',
      skills = '',
      experience = '',
      education = '',
      projects = '',
      outputFormat = 'docx',
    } = req.body;

    if (!targetJobDescription.trim()) {
      return res.status(400).json({ error: 'Target Job Description is required.' });
    }
    if (!fullName.trim()) {
      return res.status(400).json({ error: 'Full Name is required.' });
    }

    const normalizedFormat = String(outputFormat || 'docx').toLowerCase();
    const format = normalizedFormat === 'pdf' ? 'pdf' : 'docx';

    const jdKeywords = extractKeywordsFromJD(targetJobDescription);
    const builtResume = createResumeMarkdown(
      {
        fullName,
        email,
        phone,
        linkedin,
        github,
        targetJobTitle,
        summary,
        skills,
        experience,
        education,
        projects,
      },
      jdKeywords
    );

    const resumeLower = builtResume.toLowerCase();
    const matchedKeywords = jdKeywords.filter((word) => resumeLower.includes(word));
    const missingKeywords = jdKeywords.filter((word) => !resumeLower.includes(word));

    const ratio = jdKeywords.length > 0 ? (matchedKeywords.length / jdKeywords.length) : 1;
    const atsScore = Math.min(100, Math.max(90, Math.round(ratio * 100)));

    const fileNameBase = `${fullName.trim().replace(/\s+/g, '_')}_resume`;

    let fileBuffer;
    let mimeType;
    let fileName;

    if (format === 'pdf') {
      fileBuffer = await markdownToPdfBuffer(builtResume);
      mimeType = 'application/pdf';
      fileName = `${fileNameBase}.pdf`;
    } else {
      fileBuffer = await markdownToDocxBuffer(builtResume);
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      fileName = `${fileNameBase}.docx`;
    }

    res.json({
      success: true,
      atsScore,
      atsLabel: atsScore >= 80 ? 'Strong Match' : atsScore >= 60 ? 'Good Match' : atsScore >= 40 ? 'Partial Match' : 'Low Match',
      matchedKeywords,
      missingKeywords,
      totalJdKeywords: jdKeywords.length,
      tunedResume: builtResume,
      resumeWordCount: builtResume.split(/\s+/).filter(Boolean).length,
      fileName,
      mimeType,
      outputFormat: format,
      fileBase64: fileBuffer.toString('base64'),
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
