const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../config/database');

// Upload Resume (Mock logic for the prototype)
router.post('/upload', authenticateToken, async (req, res, next) => {
  try {
    const scores = { ats: 85, impact: 70, skills: 90, clarity: 80, completeness: 85, industry_fit: 80 };
    const content = "Mock optimized text content";
    const sections = { education: true, experience: true, projects: false };
    
    const [result] = await pool.query(
      'INSERT INTO resumes (user_id, content, scores, sections, file_url) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, content, JSON.stringify(scores), JSON.stringify(sections), 'mock_url.pdf']
    );

    const [rows] = await pool.query('SELECT * FROM resumes WHERE id = ?', [result.insertId]);

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Get Scores
router.get('/scores', authenticateToken, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT scores FROM resumes WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [req.user.id]);
    res.json(rows[0] || { scores: null });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
