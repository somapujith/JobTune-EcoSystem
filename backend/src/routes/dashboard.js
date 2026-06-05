const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../config/database');

// GET /api/dashboard/overview - Real user data aggregation
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Fetch resume scores (history + latest)
    const [resumes] = await pool.query(
      'SELECT overall_score, created_at FROM resumes WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
      [userId]
    );
    const resumeScores = resumes.map(r => r.overall_score);
    const latestResumeScore = resumeScores[0] || 0;

    // 2. Fetch mock interview data
    const [interviews] = await pool.query(
      'SELECT score FROM mock_interviews WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    const avgInterviewScore = interviews.length > 0
      ? Math.round(interviews.reduce((sum, i) => sum + (i.score || 0), 0) / interviews.length)
      : 0;

    // 3. Fetch job applications (assumes job_applications table exists)
    let jobStats = { total: 0, interviews: 0, offers: 0, rejected: 0, replyRate: 0 };
    try {
      const [jobs] = await pool.query(
        'SELECT status FROM job_applications WHERE user_id = ?',
        [userId]
      );
      jobStats.total = jobs.length;
      jobStats.interviews = jobs.filter(j => j.status === 'interview' || j.status === 'interviewing').length;
      jobStats.offers = jobs.filter(j => j.status === 'offer').length;
      jobStats.rejected = jobs.filter(j => j.status === 'rejected').length;
      jobStats.replyRate = jobStats.total > 0
        ? Math.round(((jobStats.interviews + jobStats.offers) / jobStats.total) * 100)
        : 0;
    } catch (err) {
      console.warn('Job applications table not found or error:', err.message);
    }

    // 4. Skill assessment score (if available)
    let skillScore = 0;
    try {
      const [skills] = await pool.query(
        'SELECT scores FROM skill_assessments WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
        [userId]
      );
      if (skills.length > 0 && skills[0].scores) {
        const scoresData = typeof skills[0].scores === 'string'
          ? JSON.parse(skills[0].scores)
          : skills[0].scores;
        skillScore = Math.round(Object.values(scoresData).reduce((a, b) => a + b, 0) / Object.keys(scoresData).length);
      }
    } catch (err) {
      console.warn('Skill assessments table not found or error:', err.message);
    }

    // 5. Recent activity log
    const recentActivity = [];
    if (resumes.length > 0) {
      recentActivity.push({
        id: `resume-${resumes[0].id}`,
        action: `Uploaded Resume (Score: ${resumeScores[0]}/100)`,
        date: formatDate(resumes[0].created_at)
      });
    }
    if (interviews.length > 0) {
      recentActivity.push({
        id: `interview-${interviews[0].id}`,
        action: `Completed Mock Interview (Score: ${interviews[0].score || 0}/100)`,
        date: formatDate(interviews[0].created_at)
      });
    }

    // 6. AI-powered action items (based on readiness)
    const readinessScore = Math.round((latestResumeScore + avgInterviewScore + skillScore) / 3);
    const actionItems = generateActionItems(readinessScore, {
      hasResume: resumes.length > 0,
      hasInterviews: interviews.length > 0,
      jobsApplied: jobStats.total > 0,
      skillScore
    });

    // 7. Return comprehensive dashboard data
    res.json({
      readinessScore,
      resumeScore: latestResumeScore,
      resumeHistory: resumeScores.slice(0, 5).reverse(), // Last 5 scores, oldest first
      interviewsCompleted: interviews.length,
      avgInterviewScore,
      skillScore,
      jobsApplied: jobStats.total,
      jobsInterviewing: jobStats.interviews,
      offers: jobStats.offers,
      rejected: jobStats.rejected,
      replyRate: jobStats.replyRate,
      recentActivity: recentActivity.slice(0, 5),
      actionItems,
      lastUpdated: new Date().toISOString()
    });
  } catch (err) {
    console.error('Dashboard overview error:', err.message);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Helper: Format date to human-readable string
function formatDate(date) {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

// Helper: Generate prioritized action items based on profile readiness
function generateActionItems(readinessScore, profile) {
  const items = [];

  if (!profile.hasResume || profile.resumeScore < 70) {
    items.push({
      id: 'resume',
      title: 'Optimize Your Resume',
      description: 'Use the Resume Optimizer to improve ATS score and highlight impact.',
      priority: 'high'
    });
  }

  if (!profile.hasInterviews) {
    items.push({
      id: 'interview',
      title: 'Practice Mock Interviews',
      description: 'Complete at least 3 mock interviews to build confidence.',
      priority: 'high'
    });
  }

  if (profile.skillScore < 65) {
    items.push({
      id: 'skills',
      title: 'Assess & Improve Skills',
      description: 'Take skill assessments to identify gaps and get learning paths.',
      priority: 'medium'
    });
  }

  if (!profile.jobsApplied || profile.jobsApplied < 5) {
    items.push({
      id: 'jobs',
      title: 'Increase Job Applications',
      description: 'Apply to at least 5 more positions this week.',
      priority: 'medium'
    });
  }

  // LinkedIn optimization
  items.push({
    id: 'linkedin',
    title: 'Update LinkedIn Profile',
    description: 'Use the LinkedIn Optimizer to improve profile visibility.',
    priority: 'medium'
  });

  // GitHub optimization
  items.push({
    id: 'github',
    title: 'Enhance GitHub Presence',
    description: 'Use the GitHub Optimizer to improve repository visibility.',
    priority: 'low'
  });

  // Return top 4 items prioritized
  return items
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, 4);
}

module.exports = router;
