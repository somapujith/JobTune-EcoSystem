'use strict';

/**
 * routes/admin.js (file-level authenticateToken + requireAdmin guard, 4 endpoints) and
 * routes/adminPanels.js (per-route authenticateToken + requireRole, 12 endpoints).
 * Fake db: proves route/guard logic, not SQL. Guards fail closed: no path reaches a handler without a
 * verified role read from the users table.
 */
const { buildApp, jsonInit, signToken } = require('./helpers/authHarness');

const ADMIN_ONLY = { error: 'Access denied. Admins only.' };
const INSUFFICIENT = { error: 'Insufficient permissions' };

let H;
const users = {};
const tokens = {};

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  H = buildApp();
  for (const role of ['admin', 'user', 'university', 'faculty', 'recruiter', 'student']) {
    users[role] = H.db.seedUser({ email: `${role}@example.com`, password: `${role}-password`, role, name: `${role} person` });
    tokens[role] = signToken({ id: users[role].id });
  }
});
afterEach(() => jest.restoreAllMocks());

const admin = (method, path, opts = {}) => H.request(`/api/admin${path}`, jsonInit({ method, ...opts }));
const panels = (method, path, opts = {}) => H.request(`/api/admin-panels${path}`, jsonInit({ method, ...opts }));
const roleLookups = () => H.db.calls.filter((c) => c.sql === 'SELECT role FROM users WHERE id = $1');

describe('/api/admin: file-level guard runs before every route', () => {
  const endpoints = [
    // every row has 3 cells: it.each would hand a missing 3rd argument to the test as its done() callback
    ['GET', '/stats', undefined],
    ['GET', '/users', undefined],
    ['GET', '/audit-logs', undefined],
    ['PUT', '/users/1/role', { role: 'user' }],
    ['GET', '/does-not-exist', undefined], // unknown path under the prefix is guarded too (Express router.use)
    ['DELETE', '/users', undefined], // and so is an unrouted method
    ['GET', '', undefined], // the bare prefix
  ];

  it.each(endpoints)('%s /api/admin%s without a token: 401 and NO role lookup happens', async (method, path, body) => {
    const res = await admin(method, path, { body });
    expect([res.status, await res.json()]).toEqual([401, { error: 'Unauthorized' }]);
    expect(roleLookups()).toHaveLength(0);
  });

  it.each(endpoints)('%s /api/admin%s as a non-admin user: 403 "Access denied. Admins only."', async (method, path, body) => {
    const res = await admin(method, path, { token: tokens.user, body });
    expect([res.status, await res.json()]).toEqual([403, ADMIN_ONLY]);
  });

  it('other privileged roles (university/faculty/recruiter/student) are NOT admins here either', async () => {
    for (const role of ['university', 'faculty', 'recruiter', 'student']) {
      expect((await admin('GET', '/stats', { token: tokens[role] })).status).toBe(403);
    }
  });

  it('a valid token for a user id with no row: 403 (not 500, not through)', async () => {
    const res = await admin('GET', '/users', { token: signToken({ id: 987654 }) });
    expect([res.status, await res.json()]).toEqual([403, ADMIN_ONLY]);
  });

  it('role must be exactly "admin" (case-sensitive; null and odd values denied)', async () => {
    for (const role of ['ADMIN', 'Admin', 'administrator', '', null]) {
      users.user.role = role;
      expect((await admin('GET', '/stats', { token: tokens.user })).status).toBe(403);
    }
  });

  it('an unknown path under the prefix reaches the default 404 only for an admin', async () => {
    const res = await admin('GET', '/does-not-exist', { token: tokens.admin });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(await res.text()).toContain('Cannot GET /api/admin/does-not-exist');
  });

  it('role lookup failure: 500 {"error":"Database error"}, handler NOT reached (fails closed)', async () => {
    H.db.failWhen((sql) => sql === 'SELECT role FROM users WHERE id = $1', new Error('connection reset'));
    for (const [method, path, body] of endpoints.slice(0, 4)) {
      const res = await admin(method, path, { token: tokens.admin, body });
      expect([res.status, await res.json()]).toEqual([500, { error: 'Database error' }]);
    }
    expect(H.db.calls.filter((c) => /COUNT\(\*\)|UPDATE users|FROM users ORDER/.test(c.sql))).toHaveLength(0);
  });

  it('the JWT carries no role: it is read from the users table on EVERY request (a demoted admin loses access at once)', async () => {
    expect((await admin('GET', '/stats', { token: tokens.admin })).status).toBe(200);
    users.admin.role = 'user';
    expect((await admin('GET', '/stats', { token: tokens.admin })).status).toBe(403);
    expect(roleLookups()).toHaveLength(2);
  });

  it('a session-bound admin token is checked by authenticateToken first (revoked session => 401 SESSION_SUPERSEDED)', async () => {
    const t = signToken({ id: users.admin.id, sessionId: 12345 });
    const res = await admin('GET', '/stats', { token: t });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('SESSION_SUPERSEDED');
    expect(roleLookups()).toHaveLength(0);
  });

  it('the guard is scoped to /api/admin: /api/admin-panels/* keeps its own (no file-level guard there)', async () => {
    const res = await panels('GET', '/does-not-exist');
    expect(res.status).toBe(404); // unauthenticated unknown path is a plain 404, as in Express
    expect(roleLookups()).toHaveLength(0);
  });
});

describe('/api/admin endpoints (as admin)', () => {
  it('GET /stats: {totalUsers, activeAdmins, totalAuditLogs, recentLogs} straight from the COUNT rows (strings)', async () => {
    H.db.state.audit_logs.push(
      { id: 1, user_id: null, action: 'A', resource: 'r', details: '{}', ip_address: null, created_at: new Date(H.db.now - 1000) },
      { id: 2, user_id: null, action: 'A', resource: 'r', details: '{}', ip_address: null, created_at: new Date(H.db.now - 10 * 86400000) }
    );
    const res = await admin('GET', '/stats', { token: tokens.admin });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ totalUsers: '6', activeAdmins: '1', totalAuditLogs: '2', recentLogs: '1' });
  });

  it('GET /stats: a database failure is 500 {"error":"Error fetching stats"} (own handler, not the masked one)', async () => {
    H.db.failWhen((sql) => /COUNT\(\*\) as total_logs/.test(sql), new Error('boom'));
    const res = await admin('GET', '/stats', { token: tokens.admin });
    expect([res.status, await res.json()]).toEqual([500, { error: 'Error fetching stats' }]);
  });

  it('GET /users: bare array of {id, name, email, role, created_at}; never password hashes', async () => {
    const res = await admin('GET', '/users', { token: tokens.admin });
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(Array.isArray(list)).toBe(true);
    expect(list).toHaveLength(6);
    expect(Object.keys(list[0]).sort()).toEqual(['created_at', 'email', 'id', 'name', 'role']);
    expect(JSON.stringify(list)).not.toMatch(/password/);
  });

  it('GET /users: failure is 500 {"error":"Error fetching users"}', async () => {
    H.db.failWhen((sql) => /FROM users ORDER BY created_at DESC/.test(sql), new Error('boom'));
    const res = await admin('GET', '/users', { token: tokens.admin });
    expect([res.status, await res.json()]).toEqual([500, { error: 'Error fetching users' }]);
  });

  describe('GET /audit-logs', () => {
    beforeEach(() => {
      const t = (ms) => new Date(H.db.now - ms);
      H.db.state.audit_logs.push(
        { id: 1, user_id: users.user.id, action: 'API_REQUEST', resource: 'system', details: '{"method":"GET","statusCode":200}', ip_address: '203.0.113.7', created_at: t(3000) },
        { id: 2, user_id: users.admin.id, action: 'API_REQUEST', resource: 'system', details: 'not json {', ip_address: null, created_at: t(2000) },
        { id: 3, user_id: null, action: 'API_REQUEST', resource: 'system', details: { already: 'object' }, ip_address: null, created_at: t(1000) }
      );
    });

    it('newest first, joined with the user name/email, details parsed back to objects', async () => {
      const res = await admin('GET', '/audit-logs', { token: tokens.admin });
      expect(res.status).toBe(200);
      const logs = await res.json();
      expect(logs.map((l) => l.id)).toEqual([3, 2, 1]);
      expect(Object.keys(logs[2])).toEqual(['id', 'user_id', 'user_name', 'user_email', 'action', 'resource', 'details', 'ip_address', 'created_at']);
      expect(logs[2]).toMatchObject({ user_name: 'user person', user_email: 'user@example.com', ip_address: '203.0.113.7', details: { method: 'GET', statusCode: 200 } });
    });

    it('unparseable details become {raw}, with a warning; object details pass through; null user has null name', async () => {
      const logs = await (await admin('GET', '/audit-logs', { token: tokens.admin })).json();
      expect(logs[1].details).toEqual({ raw: 'not json {' });
      expect(logs[0].details).toEqual({ already: 'object' });
      expect(logs[0]).toMatchObject({ user_id: null, user_name: null, user_email: null });
      expect(console.warn.mock.calls.some((c) => c[0] === 'Failed to parse audit log details:')).toBe(true);
    });

    it('?user_id= filters through a $1 parameter (never interpolated)', async () => {
      const res = await admin('GET', `/audit-logs?user_id=${users.user.id}`, { token: tokens.admin });
      expect((await res.json()).map((l) => l.id)).toEqual([1]);
      const q = H.db.calls.find((c) => /LEFT JOIN users u/.test(c.sql));
      expect(q.sql).toContain('WHERE a.user_id = $1');
      expect(q.params).toEqual([String(users.user.id)]);
    });

    it('an injection attempt in user_id stays a bound parameter', async () => {
      const evil = encodeURIComponent("1; DROP TABLE users; --");
      await admin('GET', `/audit-logs?user_id=${evil}`, { token: tokens.admin });
      const q = H.db.calls.find((c) => /LEFT JOIN users u/.test(c.sql));
      expect(q.sql).not.toContain('DROP TABLE');
      expect(q.params).toEqual(['1; DROP TABLE users; --']);
    });

    it('failure: 500 {"error":"Error fetching audit logs"}', async () => {
      H.db.failWhen((sql) => /LEFT JOIN users u/.test(sql), new Error('boom'));
      const res = await admin('GET', '/audit-logs', { token: tokens.admin });
      expect([res.status, await res.json()]).toEqual([500, { error: 'Error fetching audit logs' }]);
    });
  });

  describe('PUT /users/:id/role', () => {
    const put = (id, body, token = tokens.admin) => admin('PUT', `/users/${id}/role`, { token, body });

    it('400 "Invalid role" for anything but user|admin (validated before the id)', async () => {
      for (const role of ['superuser', 'ADMIN', '', null, undefined, 1, ['admin']]) {
        const res = await put(users.user.id, { role });
        expect([res.status, await res.json()]).toEqual([400, { error: 'Invalid role' }]);
      }
      const res = await put('abc', { role: 'nope' });
      expect(await res.json()).toEqual({ error: 'Invalid role' });
    });

    it('400 "Invalid user id" for a non-numeric or zero id', async () => {
      for (const id of ['abc', '0', 'NaN']) {
        const res = await put(id, { role: 'user' });
        expect([res.status, await res.json()]).toEqual([400, { error: 'Invalid user id' }]);
      }
    });

    it('parseInt semantics are preserved: "12abc" targets user 12', async () => {
      const u = H.db.seedUser({ email: 'twelve@example.com', password: 'twelve-password' });
      expect(u.id).toBe(7);
      H.db.state.users.push({ ...u, id: 12, email: 'id12@example.com' });
      const res = await put('12abc', { role: 'admin' });
      expect(res.status).toBe(200);
      expect(H.db.state.users.find((x) => x.id === 12).role).toBe('admin');
    });

    it('400 "Cannot remove your own admin role"; promoting yourself (already admin) is allowed', async () => {
      const res = await put(users.admin.id, { role: 'user' });
      expect([res.status, await res.json()]).toEqual([400, { error: 'Cannot remove your own admin role' }]);
      expect(users.admin.role).toBe('admin');
      expect((await put(users.admin.id, { role: 'admin' })).status).toBe(200);
    });

    it('404 "User not found" for an id with no row', async () => {
      const res = await put(4242, { role: 'admin' });
      expect([res.status, await res.json()]).toEqual([404, { error: 'User not found' }]);
    });

    it('200 {"message":"User role updated successfully"} and the role really changes (grant then revoke)', async () => {
      const res = await put(users.user.id, { role: 'admin' });
      expect([res.status, await res.json()]).toEqual([200, { message: 'User role updated successfully' }]);
      expect(users.user.role).toBe('admin');
      expect((await admin('GET', '/stats', { token: tokens.user })).status).toBe(200); // now an admin
      expect((await put(users.user.id, { role: 'user' })).status).toBe(200);
      expect(users.user.role).toBe('user');
    });

    it('uses a bound-parameter UPDATE: SQL text is the Express one', async () => {
      await put(users.user.id, { role: 'admin' });
      const q = H.db.calls.find((c) => /^UPDATE users SET role/.test(c.sql));
      expect(q.sql).toBe('UPDATE users SET role = $1 WHERE id = $2 RETURNING id');
      expect(q.params).toEqual(['admin', users.user.id]);
    });

    it('a non-admin can never change roles (guard, not handler, answers)', async () => {
      const res = await put(users.user.id, { role: 'admin' }, tokens.user);
      expect([res.status, await res.json()]).toEqual([403, ADMIN_ONLY]);
      expect(users.user.role).toBe('user');
    });

    it('a body-less request is a masked 500 (destructured OUTSIDE the try, like Express)', async () => {
      const res = await admin('PUT', `/users/${users.user.id}/role`, { token: tokens.admin });
      expect([res.status, await res.json()]).toEqual([500, { error: 'Internal Server Error' }]);
    });

    it('update failure: 500 {"error":"Error updating user role"}', async () => {
      H.db.failWhen((sql) => /^UPDATE users SET role/.test(sql), new Error('boom'));
      const res = await put(users.user.id, { role: 'admin' });
      expect([res.status, await res.json()]).toEqual([500, { error: 'Error updating user role' }]);
    });
  });
});

describe('/api/admin-panels: authenticateToken -> requireRole on every endpoint', () => {
  // [method, path, body, roles allowed, success status]
  const table = [
    ['GET', '/university/overview', undefined, ['admin', 'university'], 200],
    ['GET', '/university/students', undefined, ['admin', 'university'], 200],
    ['GET', '/university/departments', undefined, ['admin', 'university'], 200],
    ['GET', '/faculty/courses', undefined, ['admin', 'faculty'], 200],
    ['GET', '/faculty/assignments', undefined, ['admin', 'faculty'], 200],
    ['POST', '/faculty/assignments', { title: 'T', dueDate: '2030-01-01', courseId: 1 }, ['admin', 'faculty'], 201],
    ['GET', '/faculty/students', undefined, ['admin', 'faculty'], 200],
    ['GET', '/recruiter/search', undefined, ['admin', 'recruiter'], 200],
    ['GET', '/recruiter/shortlist', undefined, ['admin', 'recruiter'], 200],
    ['POST', '/recruiter/shortlist', { studentId: 3 }, ['admin', 'recruiter'], 200],
    ['POST', '/recruiter/jobs', { title: 'Engineer', company: 'Acme' }, ['admin', 'recruiter'], 201],
    ['GET', '/recruiter/jobs', undefined, ['admin', 'recruiter'], 200],
  ];
  const everyRole = ['admin', 'university', 'faculty', 'recruiter', 'user', 'student'];

  it('covers all 12 endpoints of the Express file', () => expect(table).toHaveLength(12));

  describe.each(table)('%s /api/admin-panels%s', (method, path, body, allowed, okStatus) => {
    it('no token: 401 and no role lookup', async () => {
      const res = await panels(method, path, { body });
      expect([res.status, await res.json()]).toEqual([401, { error: 'Unauthorized' }]);
      expect(roleLookups()).toHaveLength(0);
    });

    it.each(everyRole)('role %s', async (role) => {
      const res = await panels(method, path, { token: tokens[role], body });
      if (allowed.includes(role)) {
        expect(res.status).toBe(okStatus);
      } else {
        expect([res.status, await res.json()]).toEqual([403, INSUFFICIENT]);
      }
    });

    it('a token whose user row is gone: 403 "Insufficient permissions"', async () => {
      const res = await panels(method, path, { token: signToken({ id: 987654 }), body });
      expect([res.status, await res.json()]).toEqual([403, INSUFFICIENT]);
    });

    it('role lookup failure: 500 {"error":"Authorization check failed"}, handler not reached', async () => {
      H.db.failWhen((sql) => sql === 'SELECT role FROM users WHERE id = $1', new Error('boom'));
      const res = await panels(method, path, { token: tokens.admin, body });
      expect([res.status, await res.json()]).toEqual([500, { error: 'Authorization check failed' }]);
    });
  });

  it('admin is allowed everywhere; the role is read live, so demoting takes effect immediately', async () => {
    expect((await panels('GET', '/university/overview', { token: tokens.admin })).status).toBe(200);
    users.admin.role = 'user';
    expect((await panels('GET', '/university/overview', { token: tokens.admin })).status).toBe(403);
  });

  it('a role granted at runtime works without re-issuing the token', async () => {
    expect((await panels('GET', '/faculty/courses', { token: tokens.user })).status).toBe(403);
    users.user.role = 'faculty';
    expect((await panels('GET', '/faculty/courses', { token: tokens.user })).status).toBe(200);
  });
});

describe('/api/admin-panels handlers (demo data, same results as Express)', () => {
  describe('university', () => {
    it('overview: KPIs computed from the 20 demo students; range echoed', async () => {
      const res = await panels('GET', '/university/overview', { token: tokens.university });
      const body = await res.json();
      expect(Object.keys(body)).toEqual(['kpis', 'weeklyActivity', 'courseCompletion', 'skillDistribution', 'placementReadiness', 'recentActivity', 'dateRange']);
      expect(body.kpis).toEqual({
        totalStudents: { value: '20', change: '+8.2%', trend: 'up' },
        activeUsers: { value: '580', change: '+12.5%', trend: 'up' },
        avgSkillScore: { value: '60', change: '+3.1%', trend: 'up' },
        placementRate: { value: '50%', change: '-2.3%', trend: 'down' },
      });
      expect(body.dateRange).toBe('Last 30 Days');
      expect(body.weeklyActivity).toHaveLength(8);
      expect(body.recentActivity).toHaveLength(8);
      const custom = await (await panels('GET', '/university/overview?range=Last%207%20Days', { token: tokens.admin })).json();
      expect(custom.dateRange).toBe('Last 7 Days');
    });

    it('students: filters, search, pagination (pageSize 20; invalid page -> 1)', async () => {
      const get = async (qs) => (await panels('GET', `/university/students${qs}`, { token: tokens.university })).json();
      const all = await get('');
      expect([all.total, all.page, all.pageSize, all.students.length]).toEqual([20, 1, 20, 20]);
      expect((await get('?department=Computer%20Science')).total).toBe(7);
      expect((await get('?status=at-risk')).total).toBe(7);
      expect((await get('?status=ready')).total).toBe(10);
      expect((await get('?search=MEERA')).students.map((s) => s.name)).toEqual(['Meera Krishnan']);
      expect((await get('?search=data%20science')).total).toBe(3);
      expect((await get('?page=2')).students).toEqual([]);
      expect((await get('?page=abc')).page).toBe(1);
      expect((await get('?page=0')).page).toBe(1);
      expect((await get('?page=-1')).page).toBe(-1); // parseInt(-1) is truthy: preserved
    });

    it('a repeated query key becomes an array and the handler answers its own 500 (search.toLowerCase)', async () => {
      const res = await panels('GET', '/university/students?search=a&search=b', { token: tokens.university });
      expect([res.status, await res.json()]).toEqual([500, { error: 'Failed to fetch students' }]);
    });

    it('departments', async () => {
      const body = await (await panels('GET', '/university/departments', { token: tokens.university })).json();
      expect(body.departments).toHaveLength(6);
      expect(body.departments[0]).toEqual({ name: 'Computer Science', studentCount: 245, avgScore: 74, placementRate: 82, topSkills: ['Python', 'React', 'ML'] });
    });
  });

  describe('faculty', () => {
    it('courses', async () => {
      const body = await (await panels('GET', '/faculty/courses', { token: tokens.faculty })).json();
      expect(body.courses.map((c) => c.code)).toEqual(['CS301', 'CS405', 'CS202', 'CS303']);
    });

    it('students: optional course filter', async () => {
      const all = await (await panels('GET', '/faculty/students', { token: tokens.faculty })).json();
      expect(all.students).toHaveLength(12);
      const some = await (await panels('GET', '/faculty/students?course=CS301', { token: tokens.faculty })).json();
      expect(some.students.map((s) => s.id)).toEqual([1, 2, 6, 10]);
    });

    it('POST assignments: 400 when title/dueDate/courseId missing', async () => {
      for (const body of [{}, { title: 'T', dueDate: '2030-01-01' }, { title: 'T', courseId: 1 }, { dueDate: '2030-01-01', courseId: 1 }]) {
        const res = await panels('POST', '/faculty/assignments', { token: tokens.faculty, body });
        expect([res.status, await res.json()]).toEqual([400, { error: 'Title, due date, and course are required' }]);
      }
    });

    it('POST assignments: 201 {assignment} derived from the course; then listed by GET', async () => {
      const before = (await (await panels('GET', '/faculty/assignments', { token: tokens.faculty })).json()).assignments.length;
      const res = await panels('POST', '/faculty/assignments', { token: tokens.faculty, body: { title: 'Trees', description: 'd', dueDate: '2030-02-02', courseId: '2', maxMarks: '40' } });
      expect(res.status).toBe(201);
      const { assignment } = await res.json();
      expect(assignment).toEqual({
        id: expect.any(Number), title: 'Trees', description: 'd', courseId: 2, courseName: 'CS405', dueDate: '2030-02-02',
        submissions: 0, total: 48, status: 'upcoming', maxMarks: 40,
      });
      const after = (await (await panels('GET', '/faculty/assignments', { token: tokens.faculty })).json()).assignments;
      expect(after).toHaveLength(before + 1);
      expect(after[after.length - 1].title).toBe('Trees');
    });

    it('POST assignments: unknown course -> courseName "N/A", total 0; default maxMarks 100; description ""', async () => {
      const res = await panels('POST', '/faculty/assignments', { token: tokens.faculty, body: { title: 'X', dueDate: '2030-03-03', courseId: 99 } });
      expect((await res.json()).assignment).toMatchObject({ courseName: 'N/A', total: 0, maxMarks: 100, description: '', courseId: 99 });
    });

    it('POST assignments: a body-less request hits the handler\'s own catch: 500 "Failed to create assignment"', async () => {
      const res = await panels('POST', '/faculty/assignments', { token: tokens.faculty });
      expect([res.status, await res.json()]).toEqual([500, { error: 'Failed to create assignment' }]);
    });
  });

  describe('recruiter', () => {
    const search = async (qs) => (await panels('GET', `/recruiter/search${qs}`, { token: tokens.recruiter })).json();

    it('search: filters (department, minScore, year, skills AND, free text) and pagination', async () => {
      expect((await search('')).total).toBe(20);
      expect((await search('?department=Design')).total).toBe(3);
      expect((await search('?minScore=90')).students.map((s) => s.name)).toEqual(['Meera Krishnan', 'Pooja Rao']);
      expect((await search('?year=2026')).total).toBe(5);
      expect((await search('?skills=python,react')).students.map((s) => s.name)).toEqual(['Aditya Verma', 'Kunal Desai']);
      expect((await search('?skills=%20PYTHON%20')).total).toBe(5);
      expect((await search('?search=tensorflow')).students.map((s) => s.name)).toEqual(['Meera Krishnan']);
      expect((await search('?page=2')).students).toEqual([]);
    });

    it('shortlist: per-user default pipeline, moves, invalid status -> "Shortlisted", and 400 without studentId', async () => {
      // fresh user ids (7, 8): the pipeline store is module-level state shared by every test in this file
      const r1 = H.db.seedUser({ email: 'r7@example.com', password: 'recruiter-seven', role: 'recruiter' });
      const r2 = H.db.seedUser({ email: 'r8@example.com', password: 'recruiter-eight', role: 'recruiter' });
      const t = signToken({ id: r1.id });
      const first = await (await panels('GET', '/recruiter/shortlist', { token: t })).json();
      expect(first).toEqual({ pipeline: { Shortlisted: [1, 2, 6, 9], Contacted: [3, 4], Interviewed: [10], Offered: [12] } });

      const moved = await panels('POST', '/recruiter/shortlist', { token: t, body: { studentId: 2, status: 'Offered' } });
      expect(moved.status).toBe(200);
      expect(await moved.json()).toEqual({
        pipeline: { Shortlisted: [1, 6, 9], Contacted: [3, 4], Interviewed: [10], Offered: [12, 2] },
        message: 'Student moved to Offered',
      });
      const bogus = await (await panels('POST', '/recruiter/shortlist', { token: t, body: { studentId: 3, status: 'Hired' } })).json();
      expect(bogus.message).toBe('Student moved to Shortlisted');
      expect(bogus.pipeline.Contacted).toEqual([4]);

      const noId = await panels('POST', '/recruiter/shortlist', { token: t, body: {} });
      expect([noId.status, await noId.json()]).toEqual([400, { error: 'Student ID is required' }]);

      // the store is keyed by user id: another recruiter still sees the default pipeline
      const other = await (await panels('GET', '/recruiter/shortlist', { token: signToken({ id: r2.id }) })).json();
      expect(other.pipeline.Offered).toEqual([12]);
    });

    it('jobs: 400 without title/company; 201 {job} with defaults, postedBy and today\'s date; GET lists it', async () => {
      const bad = await panels('POST', '/recruiter/jobs', { token: tokens.recruiter, body: { title: 'Only title' } });
      expect([bad.status, await bad.json()]).toEqual([400, { error: 'Job title and company are required' }]);

      const before = (await (await panels('GET', '/recruiter/jobs', { token: tokens.recruiter })).json()).jobs.length;
      const res = await panels('POST', '/recruiter/jobs', { token: tokens.recruiter, body: { title: 'SRE', company: 'Acme' } });
      expect(res.status).toBe(201);
      const { job } = await res.json();
      expect(job).toEqual({
        id: expect.any(Number), title: 'SRE', company: 'Acme', description: '', requirements: '', location: 'Not specified',
        salaryRange: 'Not disclosed', applications: 0, status: 'active', posted: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), postedBy: users.recruiter.id,
      });
      const after = (await (await panels('GET', '/recruiter/jobs', { token: tokens.recruiter })).json()).jobs;
      expect(after).toHaveLength(before + 1);
    });

    it('jobs/shortlist POST with no body: the handlers\' own 500s', async () => {
      const a = await panels('POST', '/recruiter/jobs', { token: tokens.recruiter });
      expect([a.status, await a.json()]).toEqual([500, { error: 'Failed to post job' }]);
      const b = await panels('POST', '/recruiter/shortlist', { token: tokens.recruiter });
      expect([b.status, await b.json()]).toEqual([500, { error: 'Failed to update shortlist' }]);
    });
  });
});
