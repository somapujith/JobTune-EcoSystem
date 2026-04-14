const express = require('express');
const router = express.Router();

router.post('/linkedin/analyze', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'LinkedIn URL is required' });

  res.json({
    score: 72,
    metrics: [
      { label: 'Headline Impact', val: 60, status: 'warning' },
      { label: 'About Section Depth', val: 85, status: 'good' },
      { label: 'Experience Keywords', val: 70, status: 'warning' },
      { label: 'Skills & Endorsements', val: 90, status: 'good' }
    ],
    suggestions: [
      "Your headline is too generic. Try including your tech stack and value proposition.",
      "Add quantified metrics to your experience section (e.g., 'Improved loading time by 20%').",
      "Request endorsements from colleagues for your top skills."
    ]
  });
});

router.post('/github/analyze', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'GitHub username is required' });

  res.json({
    score: 65,
    repoCount: 12,
    stars: 4,
    readmeExists: false,
    issues: [
      "No profile README found. This is a critical missed opportunity.",
      "8 of 12 repositories lack a basic README.md",
      "Only 2 repositories have a description or tags."
    ]
  });
});

module.exports = router;
