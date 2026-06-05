const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

router.get('/ideas', authenticateToken, (req, res) => {
  res.json([
    { id: 1, title: 'E-Commerce Dashboard', diff: 'Intermediate', time: '10 hrs', tech: ['React', 'Chart.js', 'Tailwind'], category: 'Frontend' },
    { id: 2, title: 'Real-time Chat App', diff: 'Advanced', time: '15 hrs', tech: ['Node.js', 'Socket.io', 'Express'], category: 'Full Stack' },
  ]);
});

module.exports = router;
