const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { generateJobGuide, getJobGuide } = require('../services/guides/jobGuideGenerator');

const router = express.Router();

// POST /api/guides/generate
router.post('/generate', authenticateToken, async (req, res) => {
  const { applicationId, jobDescription, role } = req.body;

  if (!applicationId && !jobDescription) {
    return res.status(400).json({ error: 'applicationId or jobDescription is required' });
  }

  try {
    const guide = await generateJobGuide({
      applicationId: applicationId ? Number(applicationId) : undefined,
      jobDescription,
      role,
      userId: req.user.id
    });

    return res.status(200).json(guide);
  } catch (err) {
    if (err.message && err.message.toLowerCase().includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Failed to generate guide', detail: err.message });
  }
});

// GET /api/guides/:id
router.get('/:id', authenticateToken, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id must be a positive integer' });
  }

  try {
    const guide = await getJobGuide({ id, userId: req.user.id });
    return res.status(200).json(guide);
  } catch (err) {
    if (err.message && err.message.toLowerCase().includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Failed to fetch guide', detail: err.message });
  }
});

module.exports = router;
