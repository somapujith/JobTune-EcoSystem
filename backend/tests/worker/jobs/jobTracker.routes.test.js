'use strict';

/**
 * routes/jobTracker.js (Worker) vs backend/src/routes/jobTracker.js (Express):
 * auth/tier parity, response bodies, status codes, SQL and parameters, preserved quirks.
 */
const { makeJobsHarness } = require('./jobsHarness');

const UPGRADE_403 = (currentPlan) => ({
  error: 'This feature requires a higher subscription plan.',
  code: 'PLAN_UPGRADE_REQUIRED',
  requiredPlan: 'Zero to Hero',
  currentPlan,
});

const SELECT_SQL = "SELECT ja.*, COUNT(*) OVER() AS total, SUM(CASE WHEN status = 'interview' THEN 1 ELSE 0 END) OVER() AS interviews, SUM(CASE WHEN status = 'offer' THEN 1 ELSE 0 END) OVER() AS offers FROM job_applications ja WHERE user_id = $1 ORDER BY applied_at DESC";
const INSERT_SQL = 'INSERT INTO job_applications (user_id, company, role, job_description, job_url, status, notes, source) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *';
const UPDATE_SQL = 'UPDATE job_applications SET status = COALESCE($1, status), notes = COALESCE($2, notes), updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND user_id = $4 RETURNING *';
const DELETE_SQL = 'DELETE FROM job_applications WHERE id = $1 AND user_id = $2 RETURNING id';

describe('jobTracker routes (worker)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('auth and plan gating (manifest: GET auth only, POST auth+tier3, PATCH/DELETE auth only)', () => {
    it.each([
      ['GET', '/api/jobs'],
      ['POST', '/api/jobs'],
      ['PATCH', '/api/jobs/1'],
      ['DELETE', '/api/jobs/1'],
    ])('%s %s -> 401 without a token, and no SQL is issued', async (method, path) => {
      const H = makeJobsHarness();
      const res = await H.call(method, path, method === 'PATCH' || method === 'POST' ? {} : undefined, { auth: false });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
      expect(H.appCalls).toEqual([]);
    });

    it.each([[1, 'Learn & Build'], [2, 'Tune & Polish']])('POST /api/jobs at tier %i -> 403 PLAN_UPGRADE_REQUIRED, nothing inserted', async (tier, name) => {
      const H = makeJobsHarness({ tier });
      const res = await H.call('POST', '/api/jobs', { company: 'A', role: 'B' });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual(UPGRADE_403(name));
      expect(H.appCalls).toEqual([]);
    });

    it('POST /api/jobs with no subscription at all -> 403 with currentPlan null', async () => {
      const H = makeJobsHarness({ tier: null });
      const res = await H.call('POST', '/api/jobs', { company: 'A', role: 'B' });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual(UPGRADE_403(null));
    });

    it('POST /api/jobs at tier 3 (threshold) is allowed', async () => {
      const H = makeJobsHarness({ tier: 3, script: () => ({ rows: [{ id: 1 }] }) });
      expect((await H.call('POST', '/api/jobs', { company: 'A', role: 'B' })).status).toBe(201);
    });

    it('GET, PATCH and DELETE have NO plan gate: a user with no subscription is served', async () => {
      const H = makeJobsHarness({ tier: null, script: () => ({ rows: [{ id: 1 }] }) });
      expect((await H.call('GET', '/api/jobs')).status).toBe(200);
      expect((await H.call('PATCH', '/api/jobs/1', { notes: 'n' })).status).toBe(200);
      expect((await H.call('DELETE', '/api/jobs/1')).status).toBe(204);
    });
  });

  describe('GET /api/jobs', () => {
    it('returns {success,data:{jobs,stats}} with the window columns stripped and stats computed', async () => {
      const H = makeJobsHarness({
        script: () => ({
          rows: [
            { id: 1, user_id: 7, company: 'Acme', status: 'applied', total: '4', interviews: '1', offers: '1' },
            { id: 2, user_id: 7, company: 'Beta', status: 'interview', total: '4', interviews: '1', offers: '1' },
          ],
        }),
      });
      const res = await H.call('GET', '/api/jobs');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        success: true,
        data: {
          jobs: [
            { id: 1, user_id: 7, company: 'Acme', status: 'applied' },
            { id: 2, user_id: 7, company: 'Beta', status: 'interview' },
          ],
          stats: { total: 4, interviews: 1, offers: 1, replyRate: 50 },
        },
      });
      expect(H.appCalls).toEqual([{ sql: SELECT_SQL, params: [7] }]);
    });

    it('empty result -> zero stats (no division by zero)', async () => {
      const H = makeJobsHarness({ script: () => ({ rows: [] }) });
      const body = await (await H.call('GET', '/api/jobs')).json();
      expect(body).toEqual({ success: true, data: { jobs: [], stats: { total: 0, interviews: 0, offers: 0, replyRate: 0 } } });
    });

    it('trailing slash is served too (Express non-strict routing)', async () => {
      const H = makeJobsHarness({ script: () => ({ rows: [] }) });
      expect((await H.call('GET', '/api/jobs/')).status).toBe(200);
    });

    it('database error -> 500 {success:false,error:<message>} (raw message is returned, as on Express)', async () => {
      const H = makeJobsHarness({ script: () => { throw new Error('connection refused'); } });
      const res = await H.call('GET', '/api/jobs');
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ success: false, error: 'connection refused' });
    });
  });

  describe('POST /api/jobs', () => {
    it('creates with all fields, 201 {success:true,data:row}, exact SQL and parameter order', async () => {
      const row = { id: 9, company: 'Acme', role: 'Dev' };
      const H = makeJobsHarness({ script: () => ({ rows: [row] }) });
      const res = await H.call('POST', '/api/jobs', {
        company: 'Acme', role: 'Dev', job_description: 'jd', job_url: 'https://x.test', status: 'interview', notes: 'n', source: 'linkedin',
      });
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ success: true, data: row });
      expect(H.appCalls).toEqual([{ sql: INSERT_SQL, params: [7, 'Acme', 'Dev', 'jd', 'https://x.test', 'interview', 'n', 'linkedin'] }]);
    });

    it('defaults: status "applied", the rest null', async () => {
      const H = makeJobsHarness({ script: () => ({ rows: [{ id: 1 }] }) });
      await H.call('POST', '/api/jobs', { company: 'Acme', role: 'Dev' });
      expect(H.appCalls[0].params).toEqual([7, 'Acme', 'Dev', null, null, 'applied', null, null]);
    });

    it('does not validate status on create (Express accepted any status here)', async () => {
      const H = makeJobsHarness({ script: () => ({ rows: [{ id: 1 }] }) });
      const res = await H.call('POST', '/api/jobs', { company: 'A', role: 'B', status: 'whatever' });
      expect(res.status).toBe(201);
      expect(H.appCalls[0].params[5]).toBe('whatever');
    });

    it.each([
      [{ role: 'Dev' }, 'company is required'],
      [{ company: 'Acme' }, 'role is required'],
      [{}, 'company is required'],
      [{ company: '', role: 'x' }, 'company is required'],
    ])('validation %j -> 400 %s', async (body, message) => {
      const H = makeJobsHarness();
      const res = await H.call('POST', '/api/jobs', body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ success: false, error: message });
      expect(H.appCalls).toEqual([]);
    });

    it('no JSON body -> masked 500 (destructuring undefined outside the try block, like Express 5)', async () => {
      const H = makeJobsHarness();
      const res = await H.call('POST', '/api/jobs', undefined);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });

    it('database error -> 500 {success:false,error:<message>}', async () => {
      const H = makeJobsHarness({ script: () => { throw new Error('insert failed'); } });
      const res = await H.call('POST', '/api/jobs', { company: 'A', role: 'B' });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ success: false, error: 'insert failed' });
    });
  });

  describe('PATCH /api/jobs/:id', () => {
    it('updates status/notes, 200 {success:true,data:row}, params [status, notes, id, userId]', async () => {
      const row = { id: 5, status: 'offer', notes: 'hi' };
      const H = makeJobsHarness({ script: () => ({ rows: [row] }) });
      const res = await H.call('PATCH', '/api/jobs/5', { status: 'offer', notes: 'hi' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, data: row });
      expect(H.appCalls).toEqual([{ sql: UPDATE_SQL, params: ['offer', 'hi', 5, 7] }]);
    });

    it('omitted status/notes become null (COALESCE keeps the stored value); empty-string notes are passed through', async () => {
      const H = makeJobsHarness({ script: () => ({ rows: [{ id: 5 }] }) });
      await H.call('PATCH', '/api/jobs/5', {});
      await H.call('PATCH', '/api/jobs/5', { notes: '' });
      expect(H.appCalls.map((c) => c.params)).toEqual([[null, null, 5, 7], [null, '', 5, 7]]);
    });

    it.each(['applied', 'interview', 'offer', 'rejected'])('accepts status %s', async (status) => {
      const H = makeJobsHarness({ script: () => ({ rows: [{ id: 5 }] }) });
      expect((await H.call('PATCH', '/api/jobs/5', { status })).status).toBe(200);
    });

    it.each([['bogus'], [''], [null], [5]])('invalid status %j -> 400 with the list of valid values', async (status) => {
      const H = makeJobsHarness();
      const res = await H.call('PATCH', '/api/jobs/5', { status });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ success: false, error: 'status must be one of: applied, interview, offer, rejected' });
      expect(H.appCalls).toEqual([]);
    });

    it('unknown id or someone else\'s row (no row returned) -> 404 "Job application not found"', async () => {
      const H = makeJobsHarness({ script: () => ({ rows: [] }) });
      const res = await H.call('PATCH', '/api/jobs/5', { status: 'offer' });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ success: false, error: 'Job application not found' });
    });

    it('non-numeric id is parsed to NaN and still reaches the database (preserved; Postgres rejects it -> 500)', async () => {
      const H = makeJobsHarness({ script: () => { throw new Error('invalid input syntax for type integer: "NaN"'); } });
      const res = await H.call('PATCH', '/api/jobs/abc', { notes: 'x' });
      expect(H.appCalls[0].params[2]).toBeNaN();
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ success: false, error: 'invalid input syntax for type integer: "NaN"' });
    });

    it('id with a numeric prefix uses parseInt (12abc -> 12)', async () => {
      const H = makeJobsHarness({ script: () => ({ rows: [{ id: 12 }] }) });
      await H.call('PATCH', '/api/jobs/12abc', { notes: 'x' });
      expect(H.appCalls[0].params[2]).toBe(12);
    });

    it('no JSON body -> masked 500 (destructuring undefined outside the try block)', async () => {
      const H = makeJobsHarness();
      const res = await H.call('PATCH', '/api/jobs/5', undefined);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal Server Error' });
    });
  });

  describe('DELETE /api/jobs/:id', () => {
    it('deletes -> 204 with an empty body, params [id, userId]', async () => {
      const H = makeJobsHarness({ script: () => ({ rows: [{ id: 5 }] }) });
      const res = await H.call('DELETE', '/api/jobs/5');
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
      expect(H.appCalls).toEqual([{ sql: DELETE_SQL, params: [5, 7] }]);
    });

    it('not found -> 404 {success:false,error:"Job application not found"}', async () => {
      const H = makeJobsHarness({ script: () => ({ rows: [] }) });
      const res = await H.call('DELETE', '/api/jobs/5');
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ success: false, error: 'Job application not found' });
    });

    it('database error -> 500 {success:false,error:<message>}', async () => {
      const H = makeJobsHarness({ script: () => { throw new Error('boom'); } });
      const res = await H.call('DELETE', '/api/jobs/5');
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ success: false, error: 'boom' });
    });
  });
});
