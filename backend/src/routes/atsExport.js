const express = require('express');
const router = express.Router();
const ResumeExport = require('../services/resumeExport');
const ResumeDatabase = require('../services/resumeDatabase');
const { authenticateToken } = require('../middleware/auth');

// Export resume as DOCX
router.post('/export/docx', authenticateToken, async (req, res, next) => {
  try {
    const { resumeId } = req.body;
    const userId = req.user.id;

    if (!resumeId) {
      return res.status(400).json({ error: 'Resume ID required' });
    }

    // Get resume from database
    const resume = await ResumeDatabase.getResume(resumeId, userId);
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    const resumeText = resume.optimized_resume || resume.original_resume;

    // Generate DOCX
    const docxBuffer = await ResumeExport.toDOCX(resumeText, 'modern');

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="optimized-resume.docx"`);

    // Save export record
    await ResumeDatabase.saveExport(resumeId, 'docx', `resume_${userId}_${Date.now()}.docx`);

    res.send(docxBuffer);
  } catch (err) {
    console.error('Export error:', err);
    next(err);
  }
});

// Export resume as TXT
router.post('/export/txt', authenticateToken, async (req, res, next) => {
  try {
    const { resumeId } = req.body;
    const userId = req.user.id;

    if (!resumeId) {
      return res.status(400).json({ error: 'Resume ID required' });
    }

    // Get resume from database
    const resume = await ResumeDatabase.getResume(resumeId, userId);
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    const resumeText = resume.optimized_resume || resume.original_resume;

    // Generate TXT
    const txtBuffer = ResumeExport.toTXT(resumeText);

    // Set response headers
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="optimized-resume.txt"`);

    // Save export record
    await ResumeDatabase.saveExport(resumeId, 'txt', `resume_${userId}_${Date.now()}.txt`);

    res.send(txtBuffer);
  } catch (err) {
    console.error('Export error:', err);
    next(err);
  }
});

// Get user's resume history
router.get('/history', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;

    const resumes = await ResumeDatabase.getUserResumes(userId, limit);

    res.json({
      data: {
        resumes,
        count: resumes.length
      }
    });
  } catch (err) {
    console.error('History query error:', err);
    next(err);
  }
});

module.exports = router;
