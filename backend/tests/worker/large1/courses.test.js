'use strict';

/**
 * routes/courses.js: happy paths, built-in fallbacks (courses/paths/enrollments/streaks), validation and
 * error paths per endpoint. Route order matters: /progress, /paths, /paths/:id are before /:id.
 */
const { makeLarge1 } = require('./helpers');

let errSpy;
beforeEach(() => {
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const C = '/api/courses';

const dbCourse = (id, extra = {}) => ({
  id,
  title: `DB Course ${id}`,
  instructor: 'DB Teacher',
  category: id % 2 ? 'Frontend' : 'Backend',
  difficulty: 'Beginner',
  duration_hrs: 10,
  lesson_count: 4,
  skills: ['Skill'],
  syllabus: [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }, { id: 'l4' }],
  ...extra,
});

/** script builder: routes each courses-table statement to a fixture (undefined = fall through). */
function tables({ courses, paths, enrollments, streak, failCourses, failEnrollments, failStreak } = {}) {
  return (sql, params) => {
    if (/^SELECT \* FROM courses ORDER BY id$/.test(sql)) {
      if (failCourses) throw new Error('no courses table');
      return { rows: courses || [] };
    }
    if (/^SELECT \* FROM learning_paths ORDER BY id$/.test(sql)) return { rows: paths || [] };
    if (/FROM course_enrollments WHERE user_id = \$1 AND course_id = \$2/.test(sql)) {
      if (failEnrollments) throw new Error('no enrollments table');
      return { rows: (enrollments || []).filter((e) => e.course_id === params[1]) };
    }
    if (/FROM course_enrollments WHERE user_id = \$1/.test(sql)) {
      if (failEnrollments) throw new Error('no enrollments table');
      return { rows: enrollments || [] };
    }
    if (/^SELECT \* FROM learning_streaks/.test(sql)) {
      if (failStreak) throw new Error('no streak table');
      return { rows: streak ? [streak] : [] };
    }
    if (/^(INSERT|UPDATE)/.test(sql)) return { rows: [], rowCount: 1 };
  };
}

describe('GET /api/courses', () => {
  it('falls back to the 15 built-in courses when the table is empty; first page of 12', async () => {
    const H = makeLarge1({ plan: 1, script: tables() });
    const res = await H.authed(C);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(12);
    expect(body.data[0].title).toBe('React Fundamentals & Hooks');
    expect(body.pagination).toEqual({ page: 1, perPage: 12, total: 15, totalPages: 2 });
    expect(H.db.calls[0].sql).toBe('SELECT * FROM courses ORDER BY id');
  });

  it('page 2 and beyond', async () => {
    const H = makeLarge1({ plan: 1, script: tables() });
    const p2 = await (await H.authed(`${C}?page=2`)).json();
    expect(p2.data.map((c) => c.id)).toEqual([13, 14, 15]);
    expect(p2.pagination.page).toBe(2);
    const p9 = await (await H.authed(`${C}?page=9`)).json();
    expect(p9.data).toEqual([]);
  });

  it('a missing table (db error) also falls back to the built-ins', async () => {
    const H = makeLarge1({ plan: 1, script: tables({ failCourses: true }) });
    const body = await (await H.authed(C)).json();
    expect(body.pagination.total).toBe(15);
  });

  it('db rows win over the built-ins', async () => {
    const H = makeLarge1({ plan: 1, script: tables({ courses: [dbCourse(1), dbCourse(2)] }) });
    const body = await (await H.authed(C)).json();
    expect(body.data.map((c) => c.title)).toEqual(['DB Course 1', 'DB Course 2']);
    expect(body.pagination).toEqual({ page: 1, perPage: 12, total: 2, totalPages: 1 });
  });

  it('filters: category / difficulty (All = no filter), case-insensitive search over title, instructor, category, skills', async () => {
    const H = makeLarge1({ plan: 1, script: tables() });
    const get = async (q) => (await (await H.authed(`${C}?${q}`)).json()).data.map((c) => c.id);
    expect(await get('category=Cloud')).toEqual([7, 15]);
    expect(await get('category=All')).toHaveLength(12);
    expect(await get('difficulty=Advanced')).toEqual([6, 10, 12, 13, 15]);
    expect(await get('difficulty=All&category=Mobile')).toEqual([8, 14]);
    expect(await get('search=REACT')).toEqual([1, 8]); // title 'React ...' and skills ['React Native', ...]
    expect(await get('search=sarah')).toEqual([1, 9]); // instructor
    expect(await get('search=devops')).toEqual([6, 11]); // category
    expect(await get('search=kafka')).toEqual([13]); // skill
    expect(await get('search=zzz-nothing')).toEqual([]);
    expect(await get('category=Cloud&difficulty=Advanced')).toEqual([15]);
  });

  it('a non-numeric page yields NaN pagination like Express (JSON null), empty data', async () => {
    const H = makeLarge1({ plan: 1, script: tables() });
    const body = await (await H.authed(`${C}?page=abc`)).json();
    expect(body.data).toEqual([]);
    expect(body.pagination.page).toBeNull();
  });

  it('repeated ?search= keys (array) -> masked 500 (toLowerCase on an array), as on Express', async () => {
    const H = makeLarge1({ plan: 1, script: tables() });
    const res = await H.authed(`${C}?search=a&search=b`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    expect(errSpy.mock.calls.flat().join(' ')).toContain('toLowerCase is not a function');
  });
});

describe('GET /api/courses/progress (not shadowed by /:id)', () => {
  it('no enrollments/streak: zeroed summary with the default streak', async () => {
    const H = makeLarge1({ plan: 1, script: tables() });
    const res = await H.authed(`${C}/progress`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: {
        activeCourses: [],
        completedCount: 0,
        totalMinutesLearned: 0,
        streak: { current: 0, longest: 0, last_date: null, daily_goal: 30 },
        enrollmentCount: 0,
      },
    });
    expect(H.db.calls.map((c) => c.sql)).toEqual([
      'SELECT * FROM course_enrollments WHERE user_id = $1 ORDER BY updated_at DESC',
      'SELECT * FROM learning_streaks WHERE user_id = $1',
      'SELECT * FROM courses ORDER BY id',
    ]);
  });

  it('active vs completed, minutes learned = round(sum(duration_hrs*60*progress/100)), streak row used', async () => {
    const streak = { current: 3, longest: 9, last_date: '2026-09-18', daily_goal: 45 };
    const H = makeLarge1({
      plan: 1,
      script: tables({
        streak,
        enrollments: [
          { course_id: 1, progress: 50, enrolled_at: 'E1' }, // React 12h -> 360 min
          { course_id: 2, progress: 100, enrolled_at: 'E2' }, // completed, 18h -> 1080 min
          { course_id: 999, progress: 10, enrolled_at: 'E3' }, // unknown course: counted as enrollment, skipped in active
        ],
      }),
    });
    const { data } = await (await H.authed(`${C}/progress`)).json();
    expect(data.activeCourses).toHaveLength(1);
    expect(data.activeCourses[0]).toMatchObject({ id: 1, title: 'React Fundamentals & Hooks', progress: 50, enrolled_at: 'E1' });
    expect(data.completedCount).toBe(1);
    expect(data.totalMinutesLearned).toBe(1440);
    expect(data.streak).toEqual(streak);
    expect(data.enrollmentCount).toBe(3);
  });

  it('missing enrollment / streak tables are tolerated', async () => {
    const H = makeLarge1({ plan: 1, script: tables({ failEnrollments: true, failStreak: true }) });
    const res = await H.authed(`${C}/progress`);
    expect(res.status).toBe(200);
    expect((await res.json()).data.enrollmentCount).toBe(0);
  });
});

describe('GET /api/courses/paths', () => {
  it('built-in paths enriched with courses, hours and progress from enrollments', async () => {
    const H = makeLarge1({ plan: 1, script: tables({ enrollments: [{ course_id: 9, progress: 100 }, { course_id: 1, progress: 50 }] }) });
    const { success, data } = await (await H.authed(`${C}/paths`)).json();
    expect(success).toBe(true);
    expect(data).toHaveLength(8);
    const fe = data[0]; // Frontend Developer: courses [9, 1, 4]
    expect(fe.title).toBe('Frontend Developer');
    expect(fe.course_ids).toEqual([9, 1, 4]);
    expect(fe.courses.map((c) => c.id)).toEqual([9, 1, 4]);
    expect(fe.total_courses).toBe(3);
    expect(fe.total_hours).toBe(8 + 12 + 10);
    expect(fe.progress).toBe(Math.round((100 + 50 + 0) / 3));
  });

  it('db path rows: course_ids may be a JSON string; unknown course ids are dropped', async () => {
    const H = makeLarge1({
      plan: 1,
      script: tables({ paths: [{ id: 1, title: 'P', course_ids: '[1, 999]' }] }),
    });
    const { data } = await (await H.authed(`${C}/paths`)).json();
    expect(data).toHaveLength(1);
    expect(data[0].course_ids).toEqual([1, 999]);
    expect(data[0].courses.map((c) => c.id)).toEqual([1]);
    expect(data[0].total_courses).toBe(1);
    expect(data[0].progress).toBe(0);
  });

  it('a path with no resolvable course has progress 0', async () => {
    const H = makeLarge1({ plan: 1, script: tables({ paths: [{ id: 1, title: 'P', course_ids: [] }] }) });
    const { data } = await (await H.authed(`${C}/paths`)).json();
    expect(data[0]).toMatchObject({ total_courses: 0, total_hours: 0, progress: 0 });
  });

  it('malformed course_ids JSON -> masked 500', async () => {
    const H = makeLarge1({ plan: 1, script: tables({ paths: [{ id: 1, course_ids: '{not json' }] }) });
    const res = await H.authed(`${C}/paths`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });
});

describe('GET /api/courses/paths/:id', () => {
  it('404 for an unknown / non-numeric path id', async () => {
    const H = makeLarge1({ plan: 1, script: tables() });
    for (const id of ['99', 'abc']) {
      const res = await H.authed(`${C}/paths/${id}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Learning path not found' });
    }
  });

  it('course statuses: completed / available / locked, and path progress', async () => {
    // Full Stack Engineer (id 3): courses [9, 1, 2, 4, 12]
    const H = makeLarge1({ plan: 1, script: tables({ enrollments: [{ course_id: 9, progress: 100 }, { course_id: 1, progress: 40 }] }) });
    const { data } = await (await H.authed(`${C}/paths/3`)).json();
    expect(data.title).toBe('Full Stack Engineer');
    expect(data.courses.map((c) => [c.id, c.progress, c.status])).toEqual([
      [9, 100, 'completed'],
      [1, 40, 'available'], // enrolled
      [2, 0, 'locked'], // previous (course 1) not completed, not enrolled
      [4, 0, 'locked'],
      [12, 0, 'locked'],
    ]);
    expect(data.total_courses).toBe(5);
    expect(data.total_hours).toBe(8 + 12 + 18 + 10 + 22);
    expect(data.progress).toBe(Math.round((100 + 40) / 5));
    // NOTE: the path itself keeps its raw course_ids field (the enriched list is under `courses`)
    expect(data.course_ids).toEqual([9, 1, 2, 4, 12]);
  });

  it('a course is available when the previous one is completed (unlocking chain)', async () => {
    const H = makeLarge1({ plan: 1, script: tables({ enrollments: [{ course_id: 9, progress: 100 }] }) });
    const { data } = await (await H.authed(`${C}/paths/1`)).json(); // [9, 1, 4]
    expect(data.courses.map((c) => c.status)).toEqual(['completed', 'available', 'locked']);
  });

  it('first course is always available even when not enrolled', async () => {
    const H = makeLarge1({ plan: 1, script: tables() });
    const { data } = await (await H.authed(`${C}/paths/2`)).json();
    expect(data.courses[0].status).toBe('available');
    expect(data.progress).toBe(0);
  });
});

describe('GET /api/courses/:id', () => {
  it('not enrolled: course + enrolled false / progress 0 / completed_lessons []', async () => {
    const H = makeLarge1({ plan: 1, script: tables() });
    const res = await H.authed(`${C}/2`);
    expect(res.status).toBe(200);
    const { success, data } = await res.json();
    expect(success).toBe(true);
    expect(data).toMatchObject({ id: 2, title: 'Node.js & Express Masterclass', enrolled: false, progress: 0, completed_lessons: [] });
    expect(data.syllabus).toHaveLength(8);
    expect(H.db.calls.map((c) => [c.sql, c.params])).toEqual([
      ['SELECT * FROM courses ORDER BY id', []],
      ['SELECT * FROM course_enrollments WHERE user_id = $1 AND course_id = $2', [1, 2]],
    ]);
  });

  it('enrolled: progress and completed lessons from the enrollment (note: enrolled is a boolean here)', async () => {
    const H = makeLarge1({ plan: 1, script: tables({ enrollments: [{ course_id: 2, progress: 25, completed_lessons: ['l1', 'l2'] }] }) });
    const { data } = await (await H.authed(`${C}/2`)).json();
    expect(data).toMatchObject({ enrolled: true, progress: 25, completed_lessons: ['l1', 'l2'] });
  });

  it('404 Course not found for an unknown or non-numeric id', async () => {
    const H = makeLarge1({ plan: 1, script: tables() });
    for (const id of ['999', 'abc', '1.5']) {
      const res = await H.authed(`${C}/${id}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Course not found' });
    }
  });

  it('a missing enrollments table is tolerated', async () => {
    const H = makeLarge1({ plan: 1, script: tables({ failEnrollments: true }) });
    const { data } = await (await H.authed(`${C}/1`)).json();
    expect(data.enrolled).toBe(false);
  });
});

describe('POST /api/courses/:id/enroll', () => {
  it('inserts idempotently and answers with the course title', async () => {
    const H = makeLarge1({ plan: 1, script: tables() });
    const res = await H.json('POST', `${C}/3/enroll`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: 'Enrolled in "Machine Learning with Python"' });
    const insert = H.db.calls.find((c) => /^INSERT INTO course_enrollments/.test(c.sql));
    expect(insert.sql).toBe(
      "INSERT INTO course_enrollments (user_id, course_id, progress, completed_lessons) VALUES ($1, $2, 0, '[]') ON CONFLICT (user_id, course_id) DO NOTHING"
    );
    expect(insert.params).toEqual([1, 3]);
  });

  it('404 for an unknown course, nothing inserted', async () => {
    const H = makeLarge1({ plan: 1, script: tables() });
    const res = await H.json('POST', `${C}/999/enroll`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Course not found' });
    expect(H.db.calls.filter((c) => /INSERT/.test(c.sql))).toEqual([]);
  });

  it('insert failure -> masked 500', async () => {
    const H = makeLarge1({
      plan: 1,
      script: (sql, p) => {
        if (/^INSERT INTO course_enrollments/.test(sql)) throw new Error('constraint');
        return tables()(sql, p);
      },
    });
    const res = await H.json('POST', `${C}/3/enroll`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
  });
});

describe('POST /api/courses/:id/progress', () => {
  const post = (H, id, body) => H.json('POST', `${C}/${id}/progress`, body);
  // course 4 has 5 syllabus lessons: 20% per lesson

  it('validation: 400 when lessonId is missing; nothing touched', async () => {
    const H = makeLarge1({ plan: 1, script: tables() });
    const res = await post(H, 4, { completed: true });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'lessonId is required' });
    expect(H.db.calls).toEqual([]);
  });

  it('404 for an unknown course', async () => {
    const H = makeLarge1({ plan: 1, script: tables() });
    const res = await post(H, 999, { lessonId: 'l1', completed: true });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Course not found' });
  });

  it('not enrolled: auto-enrolls, marks the lesson, progress = completed/total, first streak row created', async () => {
    const H = makeLarge1({ plan: 1, script: tables() });
    const res = await post(H, 4, { lessonId: 'l1', completed: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { progress: 20, completedLessons: ['l1'] } });
    const sqls = H.db.calls.map((c) => c.sql);
    expect(sqls).toEqual([
      'SELECT * FROM courses ORDER BY id',
      'SELECT * FROM course_enrollments WHERE user_id = $1 AND course_id = $2',
      "INSERT INTO course_enrollments (user_id, course_id, progress, completed_lessons) VALUES ($1, $2, 0, '[]')",
      'UPDATE course_enrollments SET progress = $1, completed_lessons = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $3 AND course_id = $4',
      'SELECT * FROM learning_streaks WHERE user_id = $1',
      'INSERT INTO learning_streaks (user_id, current, longest, last_date) VALUES ($1, 1, 1, $2)',
    ]);
    expect(H.db.calls[3].params).toEqual([20, '["l1"]', 1, 4]);
    expect(H.db.calls[5].params[0]).toBe(1);
    expect(H.db.calls[5].params[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('enrolled: does not re-enroll; completed_lessons may be a JSON string; duplicates are not added', async () => {
    const H = makeLarge1({ plan: 1, script: tables({ enrollments: [{ course_id: 4, progress: 20, completed_lessons: '["l1"]' }], streak: { current: 1, longest: 1, last_date: null } }) });
    const res = await post(H, 4, { lessonId: 'l1', completed: true });
    expect(await res.json()).toEqual({ success: true, data: { progress: 20, completedLessons: ['l1'] } });
    expect(H.db.calls.some((c) => /^INSERT INTO course_enrollments/.test(c.sql))).toBe(false);
    const add = await post(H, 4, { lessonId: 'l2', completed: true });
    expect((await add.json()).data.completedLessons).toEqual(['l1', 'l2']);
  });

  it('completed falsy removes the lesson', async () => {
    const H = makeLarge1({ plan: 1, script: tables({ enrollments: [{ course_id: 4, progress: 40, completed_lessons: ['l1', 'l2'] }], streak: { current: 1, longest: 1, last_date: null } }) });
    const res = await post(H, 4, { lessonId: 'l1', completed: false });
    expect(await res.json()).toEqual({ success: true, data: { progress: 20, completedLessons: ['l2'] } });
    const noFlag = await post(H, 4, { lessonId: 'l2' }); // completed omitted -> also a removal
    expect((await noFlag.json()).data.completedLessons).toEqual(['l1']);
  });

  it('progress rounds and can reach 100', async () => {
    const H = makeLarge1({ plan: 1, script: tables({ enrollments: [{ course_id: 4, progress: 80, completed_lessons: ['l1', 'l2', 'l3', 'l4'] }] }) });
    const res = await post(H, 4, { lessonId: 'l5', completed: true });
    expect((await res.json()).data.progress).toBe(100);
  });

  describe('streak bookkeeping (fixed clock 2026-09-19T12:00:00Z)', () => {
    beforeEach(() => jest.useFakeTimers({ now: new Date('2026-09-19T12:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'clearImmediate', 'queueMicrotask', 'hrtime', 'performance'] }));

    const run = async (streak) => {
      const H = makeLarge1({ plan: 1, script: tables({ streak }) });
      const res = await post(H, 1, { lessonId: 'l1', completed: true });
      expect(res.status).toBe(200);
      return H.db.calls.find((c) => /^UPDATE learning_streaks/.test(c.sql));
    };

    it('already counted today: current unchanged', async () => {
      const u = await run({ current: 4, longest: 6, last_date: '2026-09-19' });
      expect(u.params).toEqual([4, 6, '2026-09-19', 1]);
    });

    it('last date yesterday: current + 1, longest follows', async () => {
      const u = await run({ current: 6, longest: 6, last_date: '2026-09-18' });
      expect(u.params).toEqual([7, 7, '2026-09-19', 1]);
    });

    it('older / no last date: streak restarts at 1, longest kept', async () => {
      expect((await run({ current: 9, longest: 12, last_date: '2026-09-10' })).params).toEqual([1, 12, '2026-09-19', 1]);
      expect((await run({ current: 9, longest: 12, last_date: null })).params).toEqual([1, 12, '2026-09-19', 1]);
    });

    it('a Date object last_date (pg DATE column) is handled', async () => {
      const u = await run({ current: 2, longest: 2, last_date: new Date('2026-09-18T00:00:00Z') });
      expect(u.params).toEqual([3, 3, '2026-09-19', 1]);
    });
  });

  it('streak failures are swallowed (best effort): still 200 with progress', async () => {
    const H = makeLarge1({ plan: 1, script: tables({ failStreak: true }) });
    const res = await post(H, 4, { lessonId: 'l1', completed: true });
    expect(res.status).toBe(200);
    expect((await res.json()).data.progress).toBe(20);
  });

  it('an enrollments SELECT failure falls through to auto-enroll', async () => {
    const H = makeLarge1({ plan: 1, script: tables({ failEnrollments: true }) });
    const res = await post(H, 4, { lessonId: 'l1', completed: true });
    expect(res.status).toBe(200);
    expect(H.db.calls.some((c) => /^INSERT INTO course_enrollments/.test(c.sql))).toBe(true);
  });

  it('progress UPDATE failure -> masked 500; no JSON body -> masked 500', async () => {
    const H = makeLarge1({
      plan: 1,
      script: (sql, p) => {
        if (/^UPDATE course_enrollments/.test(sql)) throw new Error('deadlock');
        return tables()(sql, p);
      },
    });
    const res = await post(H, 4, { lessonId: 'l1', completed: true });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    const none = await makeLarge1({ plan: 1, script: tables() }).authed(`${C}/4/progress`, { method: 'POST' });
    expect(none.status).toBe(500);
  });

  it('DB course with an empty syllabus falls back to lesson_count, then to 1', async () => {
    const two = makeLarge1({ plan: 1, script: tables({ courses: [dbCourse(1, { syllabus: '[]', lesson_count: 2 })] }) });
    expect((await (await post(two, 1, { lessonId: 'a', completed: true })).json()).data.progress).toBe(50);
    const one = makeLarge1({ plan: 1, script: tables({ courses: [dbCourse(1, { syllabus: [], lesson_count: 0 })] }) });
    expect((await (await post(one, 1, { lessonId: 'a', completed: true })).json()).data.progress).toBe(100);
  });
});

describe('route order', () => {
  it('literal segments are matched before /:id (progress, paths) and the path route before the course route', async () => {
    const H = makeLarge1({ plan: 1, script: tables() });
    expect((await (await H.authed(`${C}/progress`)).json()).data).toHaveProperty('activeCourses');
    expect((await (await H.authed(`${C}/paths`)).json()).data).toHaveLength(8);
    expect((await (await H.authed(`${C}/paths/1`)).json()).data).toHaveProperty('courses');
    expect((await (await H.authed(`${C}/1`)).json()).data).toHaveProperty('syllabus');
  });

  it('trailing slash on the collection route behaves like Express non-strict routing', async () => {
    const H = makeLarge1({ plan: 1, script: tables() });
    expect((await H.authed(`${C}/`)).status).toBe(200);
  });
});
