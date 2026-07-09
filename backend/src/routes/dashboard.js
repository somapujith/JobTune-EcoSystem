const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../config/database');

// GET /api/dashboard/overview - Real user data aggregation
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Queries 1-6 are independent, so they run concurrently via Promise.all.
    // pool.query is still invoked synchronously in array order (tests rely on
    // mock call ordering); only the awaits overlap. Queries against tables
    // that may not exist swallow their own errors so a missing table can't
    // sink the whole dashboard, while resumes/mock_interviews failures still
    // propagate to the outer catch (500).
    const [resumes, interviews, jobsResult, skillsResult, streakResult, activityStats] = await Promise.all([
      // 1. Resume scores (history + latest)
      pool.query(
        'SELECT overall_score, created_at FROM resumes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
        [userId]
      ),
      // 2. Mock interview data
      pool.query(
        'SELECT score FROM mock_interviews WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      ),
      // 3. Job applications (table may not exist)
      pool.query(
        'SELECT status FROM job_applications WHERE user_id = $1',
        [userId]
      ).catch(err => {
        console.warn('Job applications table not found or error:', err.message);
        return null;
      }),
      // 4. Latest skill assessment (table may not exist)
      pool.query(
        'SELECT * FROM skill_assessments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [userId]
      ).catch(err => {
        console.warn('Skill assessments score not available:', err.message);
        return null;
      }),
      // 7. Streak data (learning_streaks table may not exist)
      pool.query(
        'SELECT current, longest, daily_goal FROM learning_streaks WHERE user_id = $1',
        [userId]
      ).catch(() => null),
      // 8. Activity stats (daily_activity table may not exist)
      pool.query(
        `SELECT COUNT(DISTINCT activity_date) AS days_active,
                COUNT(DISTINCT tool_name) AS tools_used
         FROM daily_activity WHERE user_id = $1`,
        [userId]
      ).catch(() => null)
    ]);

    // 1. Resume scores (history + latest)
    const resumeScores = resumes.rows.map(r => r.overall_score);
    const latestResumeScore = resumeScores[0] || 0;

    // 2. Mock interview data
    const avgInterviewScore = interviews.rows.length > 0
      ? Math.round(interviews.rows.reduce((sum, i) => sum + (i.score || 0), 0) / interviews.rows.length)
      : 0;

    // 3. Job applications
    let jobStats = { total: 0, interviews: 0, offers: 0, rejected: 0, replyRate: 0 };
    if (jobsResult) {
      jobStats.total = jobsResult.rows.length;
      jobStats.interviews = jobsResult.rows.filter(j => j.status === 'interview' || j.status === 'interviewing').length;
      jobStats.offers = jobsResult.rows.filter(j => j.status === 'offer').length;
      jobStats.rejected = jobsResult.rows.filter(j => j.status === 'rejected').length;
      jobStats.replyRate = jobStats.total > 0
        ? Math.round(((jobStats.interviews + jobStats.offers) / jobStats.total) * 100)
        : 0;
    }

    // 4. Skill assessment score (if available)
    let skillScore = 0;
    try {
      if (skillsResult && skillsResult.rows.length > 0) {
        // Try to extract score from available columns
        if (skillsResult.rows[0].score) {
          skillScore = skillsResult.rows[0].score;
        } else if (skillsResult.rows[0].scores) {
          const scoresData = typeof skillsResult.rows[0].scores === 'string'
            ? JSON.parse(skillsResult.rows[0].scores)
            : skillsResult.rows[0].scores;
          skillScore = Math.round(Object.values(scoresData).reduce((a, b) => a + b, 0) / Object.keys(scoresData).length);
        } else {
          // Default to 65 if we have skills assessment but no explicit score
          skillScore = 65;
        }
      }
    } catch (err) {
      console.warn('Skill assessments score not available:', err.message);
      skillScore = 0;
    }

    // 5. Recent activity log
    const recentActivity = [];
    if (resumes.rows.length > 0) {
      recentActivity.push({
        id: `resume-${resumes.rows[0].id}`,
        action: `Uploaded Resume (Score: ${resumeScores[0]}/100)`,
        date: formatDate(resumes.rows[0].created_at)
      });
    }
    if (interviews.rows.length > 0) {
      recentActivity.push({
        id: `interview-${interviews.rows[0].id}`,
        action: `Completed Mock Interview (Score: ${interviews.rows[0].score || 0}/100)`,
        date: formatDate(interviews.rows[0].created_at)
      });
    }

    // 6. AI-powered action items (based on readiness)
    const readinessScore = Math.round((latestResumeScore + avgInterviewScore + skillScore) / 3);
    const actionItems = generateActionItems(readinessScore, {
      hasResume: resumes.rows.length > 0,
      hasInterviews: interviews.rows.length > 0,
      jobsApplied: jobStats.total > 0,
      skillScore
    });

    // 7. Streak data from learning_streaks
    let streak = { current: 0, longest: 0, dailyGoal: 30 };
    if (streakResult && streakResult.rows.length > 0) {
      streak = {
        current: streakResult.rows[0].current || 0,
        longest: streakResult.rows[0].longest || 0,
        dailyGoal: streakResult.rows[0].daily_goal || 30
      };
    }

    // 8. Activity stats from daily_activity
    let daysActive = 0;
    let toolsUsed = 0;
    if (activityStats && activityStats.rows.length > 0) {
      daysActive = parseInt(activityStats.rows[0].days_active) || 0;
      toolsUsed = parseInt(activityStats.rows[0].tools_used) || 0;
    }

    // 9. Profile completion percentage
    let profileCompletion = 0;
    try {
      const [hasResume, hasAssessment, hasLinkedin, hasRoadmap] = await Promise.all([
        pool.query('SELECT EXISTS(SELECT 1 FROM resumes WHERE user_id = $1) AS e', [userId]),
        pool.query('SELECT EXISTS(SELECT 1 FROM skill_assessments WHERE user_id = $1) AS e', [userId]),
        pool.query('SELECT EXISTS(SELECT 1 FROM linkedin_analyses WHERE user_id = $1) AS e', [userId]),
        pool.query('SELECT EXISTS(SELECT 1 FROM career_roadmaps WHERE user_id = $1) AS e', [userId])
      ]);
      if (hasResume.rows[0].e) profileCompletion += 25;
      if (hasAssessment.rows[0].e) profileCompletion += 25;
      if (hasLinkedin.rows[0].e) profileCompletion += 25;
      if (hasRoadmap.rows[0].e) profileCompletion += 25;
    } catch (err) {
      // Some tables may not exist
    }

    // 10. Completion status for learning journey steps
    const completionStatus = {
      hasSkillAssessment: false,
      hasCareerRoadmap: false,
      hasLearningPath: false,
      hasCourseProgress: false,
      hasPractice: false,
      hasProfile: false,
      hasInterviewPrep: false,
      hasJobApplications: false
    };

    const statusChecks = [
      { key: 'hasSkillAssessment', query: 'SELECT EXISTS(SELECT 1 FROM skill_assessments WHERE user_id = $1) AS e' },
      { key: 'hasCareerRoadmap', query: 'SELECT EXISTS(SELECT 1 FROM career_roadmaps WHERE user_id = $1) AS e' },
      { key: 'hasLearningPath', query: 'SELECT EXISTS(SELECT 1 FROM course_enrollments WHERE user_id = $1) AS e' },
      { key: 'hasCourseProgress', query: 'SELECT EXISTS(SELECT 1 FROM course_enrollments WHERE user_id = $1 AND progress > 0) AS e' },
      { key: 'hasPractice', query: 'SELECT EXISTS(SELECT 1 FROM practice_submissions WHERE user_id = $1) AS e' },
      { key: 'hasProfile', query: 'SELECT EXISTS(SELECT 1 FROM resumes WHERE user_id = $1) AS e' },
      { key: 'hasInterviewPrep', query: 'SELECT EXISTS(SELECT 1 FROM mock_interviews WHERE user_id = $1) AS e' },
      { key: 'hasJobApplications', query: 'SELECT EXISTS(SELECT 1 FROM job_applications WHERE user_id = $1) AS e' }
    ];

    await Promise.allSettled(
      statusChecks.map(async ({ key, query }) => {
        try {
          const result = await pool.query(query, [userId]);
          completionStatus[key] = result.rows[0].e;
        } catch (err) {
          // Table may not exist, keep default false
        }
      })
    );

    // 11. Return comprehensive dashboard data
    res.json({
      readinessScore,
      resumeScore: latestResumeScore,
      resumeHistory: resumeScores.slice(0, 5).reverse(), // Last 5 scores, oldest first
      interviewsCompleted: interviews.rows.length,
      avgInterviewScore,
      skillScore,
      jobsApplied: jobStats.total,
      jobsInterviewing: jobStats.interviews,
      offers: jobStats.offers,
      rejected: jobStats.rejected,
      replyRate: jobStats.replyRate,
      recentActivity: recentActivity.slice(0, 5),
      actionItems,
      streak,
      daysActive,
      toolsUsed,
      profileCompletion,
      completionStatus,
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
