const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../config/database');

// Submit Assessment
router.post('/assessment', authenticateToken, async (req, res, next) => {
  try {
    const { answers } = req.body;
    
    // Very simple mock evaluation logic for illustration
    const strengths = ["Problem Solving", "Growth Mindset"];
    const gaps = ["System Design", "Cloud Basics"];
    const role_matches = ["Junior Backend Developer", "SDE-1"];
    const skills = answers; 

    const result = await pool.query(
      'INSERT INTO skill_assessments (user_id, skills, strengths, gaps, role_matches) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.id, JSON.stringify(skills), JSON.stringify(strengths), JSON.stringify(gaps), JSON.stringify(role_matches)]
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Get User History
router.get('/history', authenticateToken, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM skill_assessments WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
