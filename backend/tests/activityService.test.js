const mockQuery = jest.fn();

jest.mock('../src/config/database', () => ({
  pool: { query: mockQuery },
}));

const activityService = require('../src/services/activityService');

describe('activityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── trackActivity ──────────────────────────────────────────────────────────

  describe('trackActivity()', () => {
    it('calls pool.query with correct UPSERT SQL and parameters', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ user_id: 1, tool_name: 'resume', activity_type: 'view', activity_count: 1 }],
      });

      await activityService.trackActivity(1, 'resume', 'view', { page: 'builder' });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO daily_activity');
      expect(sql).toContain('ON CONFLICT');
      expect(sql).toContain('activity_count + 1');
      expect(params).toEqual([1, 'resume', 'view', JSON.stringify({ page: 'builder' })]);
    });

    it('returns the upserted row', async () => {
      const row = { user_id: 1, tool_name: 'resume', activity_type: 'view', activity_count: 2 };
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await activityService.trackActivity(1, 'resume', 'view');
      expect(result).toEqual(row);
    });

    it('defaults metadata to empty object when omitted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{}] });

      await activityService.trackActivity(1, 'quiz', 'start');

      const [, params] = mockQuery.mock.calls[0];
      expect(params[3]).toBe('{}');
    });

    it('propagates database errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB down'));
      await expect(activityService.trackActivity(1, 'x', 'y')).rejects.toThrow('DB down');
    });
  });

  // ─── getHeatmapData ─────────────────────────────────────────────────────────

  describe('getHeatmapData()', () => {
    it('returns formatted array of {date, count} objects', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { date: '2026-06-01', count: 5 },
          { date: '2026-06-02', count: 3 },
        ],
      });

      const data = await activityService.getHeatmapData(1, 6);
      expect(data).toEqual([
        { date: '2026-06-01', count: 5 },
        { date: '2026-06-02', count: 3 },
      ]);
    });

    it('handles Date objects in the date column', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ date: new Date('2026-06-15T00:00:00Z'), count: 2 }],
      });

      const data = await activityService.getHeatmapData(1);
      expect(data[0].date).toBe('2026-06-15');
      expect(data[0].count).toBe(2);
    });

    it('passes months parameter to the query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await activityService.getHeatmapData(42, 3);

      const [sql, params] = mockQuery.mock.calls[0];
      expect(params).toEqual([42, 3]);
      expect(sql).toContain('INTERVAL');
    });

    it('defaults to 12 months when months is omitted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await activityService.getHeatmapData(1);

      const [, params] = mockQuery.mock.calls[0];
      expect(params[1]).toBe(12);
    });

    it('returns empty array when no data exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const data = await activityService.getHeatmapData(1, 12);
      expect(data).toEqual([]);
    });
  });

  // ─── getWeeklyActivity ──────────────────────────────────────────────────────

  describe('getWeeklyActivity()', () => {
    it('returns 7 entries for Mon-Sun', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const data = await activityService.getWeeklyActivity(1);
      expect(data).toHaveLength(7);
    });

    it('fills missing days with count 0', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const data = await activityService.getWeeklyActivity(1);
      for (const entry of data) {
        expect(entry.count).toBe(0);
      }
    });

    it('correctly maps day names Mon through Sun', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const data = await activityService.getWeeklyActivity(1);
      const dayNames = data.map(d => d.day);
      expect(dayNames).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    });

    it('each entry has day, date, and count fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const data = await activityService.getWeeklyActivity(1);
      for (const entry of data) {
        expect(entry).toHaveProperty('day');
        expect(entry).toHaveProperty('date');
        expect(entry).toHaveProperty('count');
      }
    });

    it('merges queried counts into the correct day', async () => {
      // We need to figure out what Monday's date is relative to today
      const now = new Date();
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - mondayOffset);
      monday.setHours(0, 0, 0, 0);

      // Simulate activity on Wednesday (index 2)
      const wed = new Date(monday);
      wed.setDate(monday.getDate() + 2);
      const wedStr = wed.toISOString().split('T')[0];

      mockQuery.mockResolvedValueOnce({
        rows: [{ date: wedStr, count: 7 }],
      });

      const data = await activityService.getWeeklyActivity(1);
      const wedEntry = data.find(d => d.day === 'Wed');
      expect(wedEntry.count).toBe(7);

      // Other days should remain 0
      const monEntry = data.find(d => d.day === 'Mon');
      expect(monEntry.count).toBe(0);
    });

    it('passes the computed monday date to the query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await activityService.getWeeklyActivity(99);

      const [sql, params] = mockQuery.mock.calls[0];
      expect(params[0]).toBe(99);
      expect(typeof params[1]).toBe('string');
      // Should be a valid date string
      expect(params[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  // ─── getStats ───────────────────────────────────────────────────────────────

  describe('getStats()', () => {
    it('returns object with expected fields', async () => {
      // Core stats query
      mockQuery.mockResolvedValueOnce({
        rows: [{ days_active: '10', tools_used: '4', total_activities: '50' }],
      });
      // Streak query
      mockQuery.mockResolvedValueOnce({
        rows: [{ current: 3, longest: 12, daily_goal: 20 }],
      });
      // Today query
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: 5 }],
      });

      const stats = await activityService.getStats(1);

      expect(stats).toEqual({
        daysActive: 10,
        toolsUsed: 4,
        totalActivities: 50,
        currentStreak: 3,
        longestStreak: 12,
        dailyGoal: 20,
        dailyGoalProgress: 25, // (5/20)*100 = 25
      });
    });

    it('handles missing learning_streaks table gracefully', async () => {
      // Core stats query
      mockQuery.mockResolvedValueOnce({
        rows: [{ days_active: '5', tools_used: '2', total_activities: '15' }],
      });
      // Streak query throws (table doesn't exist)
      mockQuery.mockRejectedValueOnce(new Error('relation "learning_streaks" does not exist'));
      // Today query
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: 0 }],
      });

      const stats = await activityService.getStats(1);

      expect(stats.currentStreak).toBe(0);
      expect(stats.longestStreak).toBe(0);
      expect(stats.dailyGoal).toBe(30);
    });

    it('returns defaults when core query returns no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [{ count: 0 }] });

      const stats = await activityService.getStats(1);

      expect(stats.daysActive).toBe(0);
      expect(stats.toolsUsed).toBe(0);
      expect(stats.totalActivities).toBe(0);
    });

    it('calculates dailyGoalProgress as a percentage', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ days_active: '1', tools_used: '1', total_activities: '10' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ current: 1, longest: 1, daily_goal: 10 }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: 7 }],
      });

      const stats = await activityService.getStats(1);
      expect(stats.dailyGoalProgress).toBe(70); // (7/10)*100
    });

    it('caps dailyGoalProgress at 100', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ days_active: '1', tools_used: '1', total_activities: '50' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ current: 1, longest: 1, daily_goal: 5 }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: 20 }],
      });

      const stats = await activityService.getStats(1);
      expect(stats.dailyGoalProgress).toBe(100);
    });

    it('falls back to dailyGoal 30 when daily_goal is 0 (falsy)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ days_active: '1', tools_used: '1', total_activities: '5' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ current: 1, longest: 1, daily_goal: 0 }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: 5 }],
      });

      const stats = await activityService.getStats(1);
      // daily_goal 0 is falsy, so it falls back to default 30
      expect(stats.dailyGoal).toBe(30);
      // 5/30 * 100 = 16.67 -> rounds to 17
      expect(stats.dailyGoalProgress).toBe(17);
    });

    it('handles today query failure gracefully', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ days_active: '1', tools_used: '1', total_activities: '5' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockRejectedValueOnce(new Error('query failed'));

      const stats = await activityService.getStats(1);
      expect(stats.dailyGoalProgress).toBe(0);
    });
  });

  // ─── getAchievements ────────────────────────────────────────────────────────

  describe('getAchievements()', () => {
    it('returns array of {key, unlockedAt} objects', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { key: 'first_login', unlocked_at: '2026-06-01T00:00:00Z' },
          { key: 'first_resume', unlocked_at: '2026-06-05T00:00:00Z' },
        ],
      });

      const achievements = await activityService.getAchievements(1);

      expect(achievements).toEqual([
        { key: 'first_login', unlockedAt: '2026-06-01T00:00:00Z' },
        { key: 'first_resume', unlockedAt: '2026-06-05T00:00:00Z' },
      ]);
    });

    it('returns empty array when no achievements unlocked', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const achievements = await activityService.getAchievements(1);
      expect(achievements).toEqual([]);
    });

    it('queries with correct SQL and userId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await activityService.getAchievements(42);

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('student_achievements');
      expect(sql).toContain('ORDER BY unlocked_at DESC');
      expect(params).toEqual([42]);
    });
  });

  // ─── checkAndUnlockAchievements ─────────────────────────────────────────────

  describe('checkAndUnlockAchievements()', () => {
    it('returns empty array when student_achievements table does not exist', async () => {
      // First query fetches existing achievements — throws because table missing
      mockQuery.mockRejectedValueOnce(new Error('relation "student_achievements" does not exist'));

      const result = await activityService.checkAndUnlockAchievements(1);
      expect(result).toEqual([]);
    });

    it('returns newly unlocked achievement keys', async () => {
      // Fetch existing achievements (none yet)
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // first_login check: daily_activity has rows
      mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      // INSERT first_login
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // first_resume check: no rows
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // first_assessment check: no rows
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // first_interview check: no rows
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // streak_7 check: no rows
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // streak_30 check: no rows
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // first_course check: no rows
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // 5_tools check
      mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 5 }] });
      // INSERT 5_tools
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // 10_tools check
      mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 5 }] });
      // first_practice check: no rows
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // profile_complete: 3 parallel queries
      mockQuery.mockResolvedValueOnce({ rows: [] }); // resumes
      mockQuery.mockResolvedValueOnce({ rows: [] }); // skill_assessments
      mockQuery.mockResolvedValueOnce({ rows: [] }); // linkedin_analyses

      const result = await activityService.checkAndUnlockAchievements(1);
      expect(result).toContain('first_login');
      expect(result).toContain('5_tools');
      expect(result).not.toContain('first_resume');
    });

    it('skips already unlocked achievements', async () => {
      // Fetch existing achievements
      mockQuery.mockResolvedValueOnce({
        rows: [{ achievement_key: 'first_login' }],
      });
      // first_resume check: no rows
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // first_assessment check: no rows
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // first_interview check: no rows
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // streak_7 check: no rows
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // streak_30 check: no rows
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // first_course check: no rows
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // 5_tools check
      mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 2 }] });
      // 10_tools check
      mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 2 }] });
      // first_practice check: no rows
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // profile_complete: 3 parallel queries
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await activityService.checkAndUnlockAchievements(1);

      // first_login was already unlocked, so should NOT appear
      expect(result).not.toContain('first_login');
      // No INSERT for first_login should have been called
      const insertCalls = mockQuery.mock.calls.filter(([sql]) =>
        sql.includes('INSERT INTO student_achievements')
      );
      expect(insertCalls).toHaveLength(0);
    });

    it('handles individual check failures gracefully (table missing)', async () => {
      // Fetch existing achievements
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // first_login check: passes
      mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      // INSERT first_login
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // first_resume check: table missing
      mockQuery.mockRejectedValueOnce(new Error('relation "resumes" does not exist'));
      // first_assessment check: table missing
      mockQuery.mockRejectedValueOnce(new Error('relation "skill_assessments" does not exist'));
      // first_interview check: table missing
      mockQuery.mockRejectedValueOnce(new Error('relation "mock_interviews" does not exist'));
      // streak_7 check: table missing
      mockQuery.mockRejectedValueOnce(new Error('relation "learning_streaks" does not exist'));
      // streak_30 check: table missing
      mockQuery.mockRejectedValueOnce(new Error('relation "learning_streaks" does not exist'));
      // first_course check: table missing
      mockQuery.mockRejectedValueOnce(new Error('relation "course_enrollments" does not exist'));
      // 5_tools check: works
      mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 2 }] });
      // 10_tools check: works
      mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 2 }] });
      // first_practice check: table missing
      mockQuery.mockRejectedValueOnce(new Error('relation "practice_submissions" does not exist'));
      // profile_complete check: one of the Promise.all queries fails
      mockQuery.mockRejectedValueOnce(new Error('relation "resumes" does not exist'));

      const result = await activityService.checkAndUnlockAchievements(1);

      // Should still unlock first_login despite other failures
      expect(result).toContain('first_login');
      // Should not throw
    });
  });
});
