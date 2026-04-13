const express = require('express');
const router = express.Router();

router.get('/resources', (req, res) => {
  res.json([
    { id: 1, title: 'Complete React Guide', type: 'Video', category: 'Frontend' }
  ]);
});

module.exports = router;
