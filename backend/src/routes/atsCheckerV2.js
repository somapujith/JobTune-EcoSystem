/**
 * ATS Checker V2 Routes
 * Resume file parsing for the V2 analyze/optimize pipeline
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { authenticateToken: auth } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

/**
 * POST /api/ats/v2/parse
 * Parse resume file (PDF/DOCX/TXT) and extract text
 */
router.post('/v2/parse', auth, requirePlan(2), upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file uploaded'
      });
    }

    let resumeText = '';

    if (req.file.mimetype === 'application/pdf') {
      // Parse PDF
      const pdf = await pdfParse(req.file.buffer);
      resumeText = pdf.text;
    } else if (req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      // Parse DOCX
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      resumeText = result.value;
    } else if (req.file.mimetype === 'text/plain') {
      // Plain text
      resumeText = req.file.buffer.toString('utf-8');
    }

    if (!resumeText || resumeText.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Could not extract text from file'
      });
    }

    return res.json({
      status: 'success',
      resumeText: resumeText.trim(),
      fileName: req.file.originalname,
      fileSize: req.file.size
    });
  } catch (error) {
    console.error('Resume parse error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to parse resume file',
      details: error.message
    });
  }
});

module.exports = router;
