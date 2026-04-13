const express = require('express');
const router = express.Router();

router.get('/overview', (req, res) => {
  res.json({
    readiness: 45,
    skillsVerified: 12,
    profileScore: 82,
    recentActivity: [
      { id: 1, action: "Completed React Skill Assessment", date: "2 days ago" },
      { id: 2, action: "Uploaded Resume V2", date: "4 days ago" }
    ],
    actionItems: [
      { id: 1, title: "Update your GitHub README", description: "Use the GitHub Optimizer tool." }
    ]
  });
});

module.exports = router;
