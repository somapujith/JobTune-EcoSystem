'use strict';

/**
 * services/tutorHistoryService.js: public API, SQL text and parameters (recording db, no behaviour model),
 * and its registry entry.
 */
const { createTutorHistoryService } = require('../../../src/worker/services/tutorHistoryService');

const norm = (sql) => sql.replace(/\s+/g, ' ').trim();

function recordingDb(rows = []) {
  const calls = [];
  return {
    calls,
    query: jest.fn(async (sql, params) => {
      calls.push({ sql: norm(sql), params });
      return { rows };
    }),
  };
}

describe('createTutorHistoryService', () => {
  it('requires a db with query()', () => {
    expect(() => createTutorHistoryService({})).toThrow(TypeError);
    expect(() => createTutorHistoryService({ db: {} })).toThrow(TypeError);
    expect(() => createTutorHistoryService()).toThrow();
  });

  it('exposes exactly the five methods of the Express singleton, as destructurable closures', () => {
    const svc = createTutorHistoryService({ db: recordingDb() });
    expect(Object.keys(svc).sort()).toEqual(['deleteConversation', 'getConversation', 'getConversations', 'saveConversation', 'updateConversation']);
    const { getConversation } = svc;
    expect(typeof getConversation).toBe('function');
  });

  it('saveConversation: INSERT ... RETURNING id, created_at; title defaults to topic; messages JSON-encoded; returns rows[0]', async () => {
    const db = recordingDb([{ id: 7, created_at: 'ts' }]);
    const svc = createTutorHistoryService({ db });
    const messages = [{ role: 'user', content: 'x' }];
    expect(await svc.saveConversation(3, 'topic', undefined, messages)).toEqual({ id: 7, created_at: 'ts' });
    expect(db.calls[0]).toEqual({
      sql: 'INSERT INTO tutor_conversations (user_id, topic, title, messages) VALUES ($1, $2, $3, $4) RETURNING id, created_at',
      params: [3, 'topic', 'topic', JSON.stringify(messages)],
    });
    await svc.saveConversation(3, 'topic', 'Title', []);
    expect(db.calls[1].params).toEqual([3, 'topic', 'Title', '[]']);
    await svc.saveConversation(3, 'topic', '', []); // empty title also falls back to the topic
    expect(db.calls[2].params[2]).toBe('topic');
  });

  it('updateConversation: UPDATE ... WHERE id AND user_id, resolves undefined, undefined messages stay undefined', async () => {
    const db = recordingDb();
    const svc = createTutorHistoryService({ db });
    expect(await svc.updateConversation('5', 3, [{ a: 1 }])).toBeUndefined();
    expect(db.calls[0]).toEqual({
      sql: 'UPDATE tutor_conversations SET messages = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
      params: ['[{"a":1}]', '5', 3],
    });
    await svc.updateConversation('5', 3, undefined);
    expect(db.calls[1].params[0]).toBeUndefined();
  });

  it('getConversations: newest-updated first with message_count, default limit 20, returns all rows', async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const db = recordingDb(rows);
    const svc = createTutorHistoryService({ db });
    expect(await svc.getConversations(3)).toBe(rows);
    expect(db.calls[0]).toEqual({
      sql: 'SELECT id, topic, title, created_at, updated_at, jsonb_array_length(messages) as message_count FROM tutor_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2',
      params: [3, 20],
    });
    await svc.getConversations(3, 5);
    expect(db.calls[1].params).toEqual([3, 5]);
  });

  it('getConversation: SELECT * scoped to the user; row or null', async () => {
    const db = recordingDb([{ id: 9 }]);
    const svc = createTutorHistoryService({ db });
    expect(await svc.getConversation('9', 3)).toEqual({ id: 9 });
    expect(db.calls[0]).toEqual({ sql: 'SELECT * FROM tutor_conversations WHERE id = $1 AND user_id = $2', params: ['9', 3] });

    const empty = createTutorHistoryService({ db: recordingDb([]) });
    expect(await empty.getConversation('9', 3)).toBeNull();
  });

  it('deleteConversation: DELETE scoped to the user, resolves undefined', async () => {
    const db = recordingDb();
    const svc = createTutorHistoryService({ db });
    expect(await svc.deleteConversation('9', 3)).toBeUndefined();
    expect(db.calls[0]).toEqual({ sql: 'DELETE FROM tutor_conversations WHERE id = $1 AND user_id = $2', params: ['9', 3] });
  });

  it('driver errors propagate unchanged (the route turns them into the masked 500)', async () => {
    const boom = new Error('connection terminated');
    const svc = createTutorHistoryService({ db: { query: async () => { throw boom; } } });
    await expect(svc.getConversations(1)).rejects.toBe(boom);
    await expect(svc.saveConversation(1, 't', 't', [])).rejects.toBe(boom);
    await expect(svc.deleteConversation(1, 1)).rejects.toBe(boom);
  });

  it('two services over different dbs do not share state (no module-scope singleton)', async () => {
    const a = recordingDb([{ id: 1 }]);
    const b = recordingDb([{ id: 2 }]);
    const sa = createTutorHistoryService({ db: a });
    const sb = createTutorHistoryService({ db: b });
    expect(await sa.getConversation(1, 1)).toEqual({ id: 1 });
    expect(await sb.getConversation(1, 1)).toEqual({ id: 2 });
    expect(a.calls).toHaveLength(1);
    expect(b.calls).toHaveLength(1);
  });
});
