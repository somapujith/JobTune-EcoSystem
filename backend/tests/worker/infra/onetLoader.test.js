'use strict';

/**
 * services/taxonomy/onetLoader.js vs the original. The original pulls in config/database (a pg Pool), so it is
 * loaded with that module mocked, exactly like tests/onetLoader.test.js does.
 */
const fs = require('fs');
const path = require('path');

const mockPool = { query: jest.fn() };
jest.mock('../../../src/config/database', () => ({ pool: mockPool }));

const { createOnetLoader, findOccupation, getDomain } = require('../../../src/worker/services/taxonomy/onetLoader');
const original = require('../../../src/services/taxonomy/onetLoader');

const SRC = path.resolve(__dirname, '../../../src');

describe('services/taxonomy/onetLoader', () => {
  beforeEach(() => mockPool.query.mockReset());

  it('the bundled occupations copy is byte-identical to src/data/onet/occupations.json (drift guard)', () => {
    const shared = fs.readFileSync(path.join(SRC, 'data/onet/occupations.json'));
    const copy = fs.readFileSync(path.join(SRC, 'worker/services/taxonomy/occupations.json'));
    expect(copy.equals(shared)).toBe(true);
  });

  it('exports the same names as the original (via the factory)', () => {
    expect(Object.keys(createOnetLoader({ db: mockPool })).sort()).toEqual(Object.keys(original).sort());
  });

  it('findOccupation agrees with the original for a spread of titles, including empty and odd input', () => {
    const titles = [
      'Software Engineer', 'senior frontend developer (React)', 'Data Scientist', 'nurse practitioner',
      'Registered Nurse', 'Marketing Manager', 'Accountant', 'zzzz qqqq', '', null, undefined, '   ', '!!!', 'c++ / rust developer',
    ];
    for (const t of titles) {
      expect([t, findOccupation(t)]).toEqual([t, original.findOccupation(t)]);
    }
    expect(findOccupation('Software Developer').code).toBeDefined();
    expect(findOccupation('')).toBeNull();
  });

  it('getDomain agrees with the original', () => {
    for (const o of [null, undefined, 'x', 3, {}, { domain: '' }, { domain: 'IT' }, findOccupation('Software Developer')]) {
      expect(getDomain(o)).toBe(original.getDomain(o));
    }
    expect(getDomain(null)).toBe('Unknown');
  });

  it('loadONET issues the same upserts, in the same order, through the injected db', async () => {
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 });
    await original.loadONET();
    const expected = mockPool.query.mock.calls.map(([sql, params]) => [sql.replace(/\s+/g, ' ').trim(), params]);

    const db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };
    await createOnetLoader({ db }).loadONET();
    const actual = db.query.mock.calls.map(([sql, params]) => [sql.replace(/\s+/g, ' ').trim(), params]);

    expect(expected.length).toBeGreaterThan(0);
    expect(actual).toEqual(expected);
    expect(actual[0][0]).toMatch(/^INSERT INTO onet_occupations/);
    expect(actual[0][1]).toHaveLength(6);
  });

  it('loadONET stops and throws on a db error (does not swallow it)', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('DB down')) };
    await expect(createOnetLoader({ db }).loadONET()).rejects.toThrow('DB down');
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
