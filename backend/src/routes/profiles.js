const express = require('express');
const router = express.Router();

router.post('/linkedin/analyze', (req, res) => {
  res.json({
    score: 72,
    suggestions: ["Improve headline", "Add metrics to experience"]
  });
});

router.post('/github/analyze', (req, res) => {
  res.json({
    score: 65,
    issues: ["No profile README"]
  });
});

module.exports = router;
