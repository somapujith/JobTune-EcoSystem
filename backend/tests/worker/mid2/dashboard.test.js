'use strict';

/**
 * routes/dashboard.js  (GET /overview, authenticateToken only).
 * Every number below was worked out by hand from backend/src/routes/dashboard.js, not by running the port.
 * The fake db returns ONLY the columns each SELECT asks for (as Postgres would), which exposes three
 * pre-existing quirks the Express unit test hides by mocking richer rows; they are asserted here as preserved
 * (plus a fourth, in generateActionItems: jobsApplied is passed as a boolean, so `true < 5` keeps the jobs item forever):
 *   - recentActivity ids are "resume-undefined" / "interview-undefined" (id is not selected),
 *   - the interview activity date is "NaN years ago" (created_at is not selected),
 *   - skill_assessments has no score/scores column, so a user with any assessment always gets skillScore 65.
 */
const { build, quietConsole, USER_ID, OTHER_USER_ID } = require('./helpers');

quietConsole();

const DAY = 24 * 60 * 60 * 1000;
const ago = (days, extraMs = 60 * 60 * 1000) => new Date(Date.now() - days * DAY - extraMs);

const KEY_ORDER = [
  'profile', 'readinessScore', 'resumeScore', 'resumeHistory', 'interviewsCompleted', 'avgInterviewScore', 'skillScore',
  'jobsApplied', 'jobsInterviewing', 'offers', 'rejected', 'replyRate', 'recentActivity', 'actionItems', 'streak',
  'daysActive', 'toolsUsed', 'profileCompletion', 'completionStatus', 'lastUpdated',
];

function seedFullUser(H) {
  H.db.add('resumes', { id: 1, user_id: USER_ID, overall_score: 80, created_at: ago(2) });
  H.db.add('resumes', { id: 2, user_id: USER_ID, overall_score: 60, created_at: ago(10) });
  H.db.add('mock_interviews', { id: 1, user_id: USER_ID, score: 70, created_at: ago(1) });
  H.db.add('mock_interviews', { id: 2, user_id: USER_ID, score: 90, created_at: ago(5) });
  for (const status of ['applied', 'interview', 'interviewing', 'offer', 'rejected', 'applied']) {
    H.db.add('job_applications', { user_id: USER_ID, status });
  }
  H.db.add('skill_assessments', { id: 1, user_id: USER_ID, created_at: ago(3), skills: {}, strengths: [], gaps: [], role_matches: [] });
  H.db.add('onboarding_responses', {
    user_id: USER_ID, career_goal: 'SDE', experience_level: 'junior', pain_points: ['time'], field_of_interest: 'web',
  });
  H.db.add('learning_streaks', { user_id: USER_ID, current: 5, longest: 0, daily_goal: 0 });
  H.db.add('daily_activity', { user_id: USER_ID, activity_date: '2026-01-01', tool_name: 'resume' });
  H.db.add('daily_activity', { user_id: USER_ID, activity_date: '2026-01-01', tool_name: 'tutor' });
  H.db.add('daily_activity', { user_id: USER_ID, activity_date: '2026-01-02', tool_name: 'resume' });
}

describe('GET /api/dashboard/overview', () => {
  it('aggregates a fully populated user (no plan required: authenticateToken only)', async () => {
    const H = build(); // deliberately no subscription
    seedFullUser(H);

    const res = await H.get('/api/dashboard/overview');
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(Object.keys(body)).toEqual(KEY_ORDER);
    expect(body).toMatchObject({
      profile: { career_goal: 'SDE', experience_level: 'junior', pain_points: ['time'], field_of_interest: 'web' },
      readinessScore: 75, // round((80 + 80 + 65) / 3)
      resumeScore: 80,
      resumeHistory: [60, 80], // last 5, oldest first
      interviewsCompleted: 2,
      avgInterviewScore: 80, // round((70 + 90) / 2)
      skillScore: 65, // assessment exists but the row has no score/scores column
      jobsApplied: 6,
      jobsInterviewing: 2, // 'interview' + 'interviewing'
      offers: 1,
      rejected: 1,
      replyRate: 50, // round((2 + 1) / 6 * 100)
      streak: { current: 5, longest: 0, dailyGoal: 30 }, // longest 0 and daily_goal 0 fall to 0 / 30 through ||
      daysActive: 2,
      toolsUsed: 2,
      profileCompletion: 50, // resume + assessment; no linkedin analysis, no roadmap
      completionStatus: {
        hasSkillAssessment: true,
        hasCareerRoadmap: false,
        hasLearningPath: false,
        hasCourseProgress: false,
        hasPractice: false,
        hasProfile: true,
        hasInterviewPrep: true,
        hasJobApplications: true,
      },
    });
    expect(Object.keys(body.completionStatus)).toEqual([
      'hasSkillAssessment', 'hasCareerRoadmap', 'hasLearningPath', 'hasCourseProgress', 'hasPractice', 'hasProfile',
      'hasInterviewPrep', 'hasJobApplications',
    ]);
    expect(new Date(body.lastUpdated).toISOString()).toBe(body.lastUpdated);
    expect(Math.abs(Date.now() - new Date(body.lastUpdated).getTime())).toBeLessThan(5000);
  });

  it('action items: no resume item (profile.resumeScore is always undefined) and the jobs item is never dropped (jobsApplied is a boolean, true < 5)', async () => {
    const H = build();
    seedFullUser(H);
    const body = await (await H.get('/api/dashboard/overview')).json();
    // hasResume true, hasInterviews true, skillScore 65 (not < 65); 6 applications, but the route passes
    // `jobsApplied: jobStats.total > 0` (a boolean), and `true < 5` is true, so the jobs item stays.
    expect(body.actionItems).toEqual([
      { id: 'jobs', title: 'Increase Job Applications', description: 'Apply to at least 5 more positions this week.', priority: 'medium' },
      { id: 'linkedin', title: 'Update LinkedIn Profile', description: 'Use the LinkedIn Optimizer to improve profile visibility.', priority: 'medium' },
      { id: 'github', title: 'Enhance GitHub Presence', description: 'Use the GitHub Optimizer to improve repository visibility.', priority: 'low' },
    ]);
  });

  it('recent activity keeps the "undefined" ids and the "NaN years ago" date (columns not selected), plus a real relative date', async () => {
    const H = build();
    seedFullUser(H);
    const body = await (await H.get('/api/dashboard/overview')).json();
    expect(body.recentActivity).toEqual([
      { id: 'resume-undefined', action: 'Uploaded Resume (Score: 80/100)', date: '2 days ago' },
      { id: 'interview-undefined', action: 'Completed Mock Interview (Score: 70/100)', date: 'NaN years ago' },
    ]);
  });

  it.each([
    [0, 'Today'],
    [1, 'Yesterday'],
    [3, '3 days ago'],
    [14, '2 weeks ago'],
    [65, '2 months ago'],
    [800, '2 years ago'],
  ])('resume created %s day(s) ago is reported as "%s"', async (days, label) => {
    const H = build();
    H.db.add('resumes', { id: 1, user_id: USER_ID, overall_score: 50, created_at: ago(days, days === 0 ? 1000 : 60 * 60 * 1000) });
    const body = await (await H.get('/api/dashboard/overview')).json();
    expect(body.recentActivity[0].date).toBe(label);
  });

  it('a brand new user gets zeros, nulls and the top 4 default action items', async () => {
    const H = build();
    const res = await H.get('/api/dashboard/overview');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(KEY_ORDER);
    expect(body).toMatchObject({
      profile: null,
      readinessScore: 0,
      resumeScore: 0,
      resumeHistory: [],
      interviewsCompleted: 0,
      avgInterviewScore: 0,
      skillScore: 0,
      jobsApplied: 0,
      jobsInterviewing: 0,
      offers: 0,
      rejected: 0,
      replyRate: 0,
      recentActivity: [],
      streak: { current: 0, longest: 0, dailyGoal: 30 },
      daysActive: 0,
      toolsUsed: 0,
      profileCompletion: 0,
      completionStatus: {
        hasSkillAssessment: false, hasCareerRoadmap: false, hasLearningPath: false, hasCourseProgress: false,
        hasPractice: false, hasProfile: false, hasInterviewPrep: false, hasJobApplications: false,
      },
    });
    // 6 candidates, sorted high, high, medium x3, low, top 4 (stable sort keeps insertion order within a priority)
    expect(body.actionItems.map((a) => [a.id, a.priority])).toEqual([
      ['resume', 'high'], ['interview', 'high'], ['skills', 'medium'], ['jobs', 'medium'],
    ]);
  });

  it('other users\' rows are never counted, and every statement is parameterised with the caller\'s id only', async () => {
    const H = build();
    seedFullUser(H);
    H.db.add('resumes', { id: 9, user_id: OTHER_USER_ID, overall_score: 99, created_at: ago(0, 1000) });
    H.db.add('mock_interviews', { id: 9, user_id: OTHER_USER_ID, score: 100, created_at: ago(0, 1000) });
    const body = await (await H.get('/api/dashboard/overview')).json();
    expect(body.resumeScore).toBe(80);
    expect(body.interviewsCompleted).toBe(2);

    // 7 direct statements + 4 profile-completion EXISTS + 8 completion-status EXISTS
    expect(H.db.mid2Calls).toHaveLength(19);
    expect(H.db.mid2Calls.every((c) => c.params.length === 1 && c.params[0] === USER_ID)).toBe(true);
    expect(new Set(H.db.mid2Calls.map((c) => c.sql)).size).toBe(16); // the resumes, skill_assessments and career_roadmaps EXISTS checks each appear twice
    expect(H.db.mid2Calls[0].sql).toBe('SELECT overall_score, created_at FROM resumes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10');
    expect(H.db.mid2Calls.map((c) => c.sql)).toContain('SELECT EXISTS(SELECT 1 FROM course_enrollments WHERE user_id = $1 AND progress > 0) AS e');
  });

  it('optional tables that do not exist degrade to defaults instead of failing', async () => {
    const H = build();
    H.db.add('resumes', { id: 1, user_id: USER_ID, overall_score: 40, created_at: ago(1) });
    for (const t of ['job_applications', 'skill_assessments', 'onboarding_responses', 'learning_streaks', 'daily_activity', 'linkedin_analyses', 'career_roadmaps', 'course_enrollments', 'practice_submissions']) {
      H.db.dropTable(t);
    }
    const res = await H.get('/api/dashboard/overview');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      profile: null, jobsApplied: 0, skillScore: 0, streak: { current: 0, longest: 0, dailyGoal: 30 },
      daysActive: 0, toolsUsed: 0, profileCompletion: 0,
      readinessScore: 13, // round((40 + 0 + 0) / 3)
    });
    // per-table EXISTS checks fail independently: the resumes-based ones still succeed
    expect(body.completionStatus).toMatchObject({ hasProfile: true, hasSkillAssessment: false, hasInterviewPrep: false });
    expect(console.warn).toHaveBeenCalled();
  });

  it('profile completion is all-or-nothing: one missing table among the four EXISTS checks zeroes it (preserved Promise.all)', async () => {
    const H = build();
    H.db.add('resumes', { id: 1, user_id: USER_ID, overall_score: 40, created_at: ago(1) });
    H.db.add('skill_assessments', { id: 1, user_id: USER_ID, created_at: ago(1), skills: {} });
    H.db.dropTable('linkedin_analyses');
    const body = await (await H.get('/api/dashboard/overview')).json();
    expect(body.profileCompletion).toBe(0);
    expect(body.completionStatus.hasSkillAssessment).toBe(true);
  });

  it.each(['resumes', 'mock_interviews'])('a missing REQUIRED table (%s) is the route-level 500', async (table) => {
    const H = build();
    H.db.dropTable(table);
    const res = await H.get('/api/dashboard/overview');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to fetch dashboard data' });
  });

  it('skill score comes from a score column, or the mean of a scores JSON string, when such columns exist', async () => {
    const withScore = build();
    withScore.db.add('skill_assessments', { id: 1, user_id: USER_ID, created_at: ago(1), score: 70 });
    expect((await (await withScore.get('/api/dashboard/overview')).json()).skillScore).toBe(70);

    const withScores = build();
    withScores.db.add('skill_assessments', { id: 1, user_id: USER_ID, created_at: ago(1), scores: '{"a":50,"b":70}' });
    expect((await (await withScores.get('/api/dashboard/overview')).json()).skillScore).toBe(60);
  });

  it('interview scores that are null count as 0 in the average', async () => {
    const H = build();
    H.db.add('mock_interviews', { id: 1, user_id: USER_ID, score: null, created_at: ago(1) });
    H.db.add('mock_interviews', { id: 2, user_id: USER_ID, score: 90, created_at: ago(2) });
    const body = await (await H.get('/api/dashboard/overview')).json();
    expect(body.avgInterviewScore).toBe(45);
    expect(body.recentActivity[0].action).toBe('Completed Mock Interview (Score: 0/100)');
  });

  it('a low readiness user with applications below 5 gets the jobs item, and the resume item never appears', async () => {
    const H = build();
    H.db.add('resumes', { id: 1, user_id: USER_ID, overall_score: 10, created_at: ago(1) });
    H.db.add('mock_interviews', { id: 1, user_id: USER_ID, score: 10, created_at: ago(1) });
    H.db.add('job_applications', { user_id: USER_ID, status: 'applied' });
    const body = await (await H.get('/api/dashboard/overview')).json();
    // hasResume true and resumeScore < 70 is compared as undefined < 70 (false): no resume item; skillScore 0 < 65: skills item
    expect(body.actionItems.map((a) => a.id)).toEqual(['skills', 'jobs', 'linkedin', 'github']);
  });
});
