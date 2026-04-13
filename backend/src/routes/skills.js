const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../config/database');

// Submit Assessment
router.post('/assessment', authenticateToken, async (req, res, next) => {
  try {
    const { answers } = req.body;
    
    const strengths = ["Problem Solving", "Growth Mindset"];
    const gaps = ["System Design", "Cloud Basics"];
    const role_matches = ["Junior Backend Developer", "SDE-1"];
    const skills = answers; 

    const [result] = await pool.query(
      'INSERT INTO skill_assessments (user_id, skills, strengths, gaps, role_matches) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, JSON.stringify(skills), JSON.stringify(strengths), JSON.stringify(gaps), JSON.stringify(role_matches)]
    );

    const [rows] = await pool.query('SELECT * FROM skill_assessments WHERE id = ?', [result.insertId]);

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Get User History
router.get('/history', authenticateToken, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM skill_assessments WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
