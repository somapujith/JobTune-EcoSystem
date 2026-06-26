const { pool } = require('../config/database');

class ActivityService {
  /**
   * Track a user activity. UPSERTs into daily_activity, incrementing count on conflict.
   */
  async trackActivity(userId, toolName, activityType, metadata = {}) {
    const result = await pool.query(
      `INSERT INTO daily_activity (user_id, activity_date, tool_name, activity_type, metadata)
       VALUES ($1, CURRENT_DATE, $2, $3, $4)
       ON CONFLICT (user_id, activity_date, tool_name, activity_type)
       DO UPDATE SET activity_count = daily_activity.activity_count + 1,
                     metadata = $4
       RETURNING *`,
      [userId, toolName, activityType, JSON.stringify(metadata)]
    );
    return result.rows[0];
  }

  /**
   * Get heatmap data for the last N months, grouped by date.
   * Returns [{date: '2026-01-15', count: 5}, ...]
   */
  async getHeatmapData(userId, months = 12) {
    const result = await pool.query(
      `SELECT activity_date AS date, SUM(activity_count)::INTEGER AS count
       FROM daily_activity
       WHERE user_id = $1
         AND activity_date >= CURRENT_DATE - ($2 || ' months')::INTERVAL
       GROUP BY activity_date
       ORDER BY activity_date ASC`,
      [userId, months]
    );
    return result.rows.map(r => ({
      date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date),
      count: r.count
    }));
  }

  /**
   * Get activity for the current week (Mon-Sun).
   * Returns [{day: 'Mon', date: '2026-06-22', count: 3}, ...] with missing days filled as 0.
   */
  async getWeeklyActivity(userId) {
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Calculate start of current week (Monday)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - mondayOffset);
    monday.setHours(0, 0, 0, 0);

    const mondayStr = monday.toISOString().split('T')[0];

    const result = await pool.query(
      `SELECT activity_date AS date, SUM(activity_count)::INTEGER AS count
       FROM daily_activity
       WHERE user_id = $1
         AND activity_date >= $2::DATE
         AND activity_date < $2::DATE + INTERVAL '7 days'
       GROUP BY activity_date
       ORDER BY activity_date ASC`,
      [userId, mondayStr]
    );

    // Build a map of date -> count
    const countMap = {};
    for (const row of result.rows) {
      const dateStr = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date);
      countMap[dateStr] = row.count;
    }

    // Fill all 7 days
    const weekData = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      weekData.push({
        day: dayNames[i],
        date: dateStr,
        count: countMap[dateStr] || 0
      });
    }

    return weekData;
  }

  /**
   * Get overall stats for a user.
   */
  async getStats(userId) {
    // Core stats from daily_activity
    const coreResult = await pool.query(
      `SELECT
         COUNT(DISTINCT activity_date) AS days_active,
         COUNT(DISTINCT tool_name) AS tools_used,
         COALESCE(SUM(activity_count), 0)::INTEGER AS total_activities
       FROM daily_activity
       WHERE user_id = $1`,
      [userId]
    );

    const core = coreResult.rows[0] || { days_active: 0, tools_used: 0, total_activities: 0 };

    // Streak data from learning_streaks (may not exist)
    let currentStreak = 0;
    let longestStreak = 0;
    let dailyGoal = 30;
    try {
      const streakResult = await pool.query(
        'SELECT current, longest, daily_goal FROM learning_streaks WHERE user_id = $1',
        [userId]
      );
      if (streakResult.rows.length > 0) {
        currentStreak = streakResult.rows[0].current || 0;
        longestStreak = streakResult.rows[0].longest || 0;
        dailyGoal = streakResult.rows[0].daily_goal || 30;
      }
    } catch (err) {
      // learning_streaks table may not exist
    }

    // Today's activity count for daily goal progress
    let todayCount = 0;
    try {
      const todayResult = await pool.query(
        `SELECT COALESCE(SUM(activity_count), 0)::INTEGER AS count
         FROM daily_activity
         WHERE user_id = $1 AND activity_date = CURRENT_DATE`,
        [userId]
      );
      todayCount = todayResult.rows[0].count || 0;
    } catch (err) {
      // ignore
    }

    const dailyGoalProgress = dailyGoal > 0 ? Math.min(Math.round((todayCount / dailyGoal) * 100), 100) : 0;

    return {
      daysActive: parseInt(core.days_active) || 0,
      toolsUsed: parseInt(core.tools_used) || 0,
      totalActivities: parseInt(core.total_activities) || 0,
      currentStreak,
      longestStreak,
      dailyGoal,
      dailyGoalProgress
    };
  }

  /**
   * Get all achievements for a user.
   */
  async getAchievements(userId) {
    const result = await pool.query(
      'SELECT achievement_key AS key, unlocked_at FROM student_achievements WHERE user_id = $1 ORDER BY unlocked_at DESC',
      [userId]
    );
    return result.rows.map(r => ({
      key: r.key,
      unlockedAt: r.unlocked_at
    }));
  }

  /**
   * Check achievement criteria and unlock new achievements. Returns newly unlocked keys.
   */
  async checkAndUnlockAchievements(userId) {
    const newlyUnlocked = [];

    // Get already-unlocked achievements
    let existing = [];
    try {
      const res = await pool.query(
        'SELECT achievement_key FROM student_achievements WHERE user_id = $1',
        [userId]
      );
      existing = res.rows.map(r => r.achievement_key);
    } catch (err) {
      // table may not exist yet
      return newlyUnlocked;
    }

    const checks = [
      {
        key: 'first_login',
        check: async () => {
          const r = await pool.query('SELECT 1 FROM daily_activity WHERE user_id = $1 LIMIT 1', [userId]);
          return r.rows.length > 0;
        }
      },
      {
        key: 'first_resume',
        check: async () => {
          const r = await pool.query('SELECT 1 FROM resumes WHERE user_id = $1 LIMIT 1', [userId]);
          return r.rows.length > 0;
        }
      },
      {
        key: 'first_assessment',
        check: async () => {
          const r = await pool.query('SELECT 1 FROM skill_assessments WHERE user_id = $1 LIMIT 1', [userId]);
          return r.rows.length > 0;
        }
      },
      {
        key: 'first_interview',
        check: async () => {
          const r = await pool.query('SELECT 1 FROM mock_interviews WHERE user_id = $1 LIMIT 1', [userId]);
          return r.rows.length > 0;
        }
      },
      {
        key: 'streak_7',
        check: async () => {
          const r = await pool.query(
            'SELECT current, longest FROM learning_streaks WHERE user_id = $1',
            [userId]
          );
          if (r.rows.length === 0) return false;
          return (r.rows[0].longest >= 7) || (r.rows[0].current >= 7);
        }
      },
      {
        key: 'streak_30',
        check: async () => {
          const r = await pool.query(
            'SELECT longest FROM learning_streaks WHERE user_id = $1',
            [userId]
          );
          if (r.rows.length === 0) return false;
          return r.rows[0].longest >= 30;
        }
      },
      {
        key: 'first_course',
        check: async () => {
          const r = await pool.query(
            'SELECT 1 FROM course_enrollments WHERE user_id = $1 AND progress = 100 LIMIT 1',
            [userId]
          );
          return r.rows.length > 0;
        }
      },
      {
        key: '5_tools',
        check: async () => {
          const r = await pool.query(
            'SELECT COUNT(DISTINCT tool_name)::INTEGER AS cnt FROM daily_activity WHERE user_id = $1',
            [userId]
          );
          return (r.rows[0].cnt || 0) >= 5;
        }
      },
      {
        key: '10_tools',
        check: async () => {
          const r = await pool.query(
            'SELECT COUNT(DISTINCT tool_name)::INTEGER AS cnt FROM daily_activity WHERE user_id = $1',
            [userId]
          );
          return (r.rows[0].cnt || 0) >= 10;
        }
      },
      {
        key: 'first_practice',
        check: async () => {
          const r = await pool.query(
            'SELECT 1 FROM practice_submissions WHERE user_id = $1 AND passed = true LIMIT 1',
            [userId]
          );
          return r.rows.length > 0;
        }
      },
      {
        key: 'profile_complete',
        check: async () => {
          const [resume, assessment, linkedin] = await Promise.all([
            pool.query('SELECT 1 FROM resumes WHERE user_id = $1 LIMIT 1', [userId]),
            pool.query('SELECT 1 FROM skill_assessments WHERE user_id = $1 LIMIT 1', [userId]),
            pool.query('SELECT 1 FROM linkedin_analyses WHERE user_id = $1 LIMIT 1', [userId])
          ]);
          return resume.rows.length > 0 && assessment.rows.length > 0 && linkedin.rows.length > 0;
        }
      }
    ];

    for (const { key, check } of checks) {
      if (existing.includes(key)) continue;
      try {
        const met = await check();
        if (met) {
          await pool.query(
            'INSERT INTO student_achievements (user_id, achievement_key) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [userId, key]
          );
          newlyUnlocked.push(key);
        }
      } catch (err) {
        // Table may not exist, skip this achievement check
      }
    }

    return newlyUnlocked;
  }
}

module.exports = new ActivityService();
