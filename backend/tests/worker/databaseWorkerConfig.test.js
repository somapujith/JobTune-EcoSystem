'use strict';

/**
 * src/config/database.worker.js pool settings (S11 spike, docs/migration/s11-results.md).
 * The driver is mocked: this pins the CONFIGURATION we ship. That these values behave as claimed against a
 * real server was measured in the spike (connections per request, release latency, connect timeout).
 */
const mockPool = jest.fn();
jest.mock('@neondatabase/serverless', () => ({ Pool: function Pool(opts) { mockPool(opts); this.opts = opts; } }));

const { getPool, POOL_MAX, CONNECTION_TIMEOUT_MS } = require('../../src/config/database.worker');

describe('database.worker getPool', () => {
  beforeEach(() => mockPool.mockClear());

  it('builds one Pool per call from env.DATABASE_URL with a small max and a connect timeout', () => {
    const p1 = getPool({ DATABASE_URL: 'postgres://u:p@h/db' });
    const p2 = getPool({ DATABASE_URL: 'postgres://u:p@h/db' });
    expect(p1).not.toBe(p2); // per request, never shared across requests (workerd forbids cross-request I/O)
    expect(mockPool).toHaveBeenCalledTimes(2);
    expect(mockPool).toHaveBeenCalledWith({
      connectionString: 'postgres://u:p@h/db',
      max: POOL_MAX,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    });
  });

  it('keeps the per-request connection fan-out small but not 1 (a checked-out client must not starve the request)', () => {
    expect(POOL_MAX).toBeGreaterThanOrEqual(2);
    expect(POOL_MAX).toBeLessThanOrEqual(4); // driver default is 10
  });

  it('bounds connect/queue wait (driver default 0 waits forever)', () => {
    expect(CONNECTION_TIMEOUT_MS).toBeGreaterThan(0);
    expect(CONNECTION_TIMEOUT_MS).toBeLessThanOrEqual(30000);
  });

  it('refuses to build a pool without DATABASE_URL, without touching the driver', () => {
    expect(() => getPool({})).toThrow(/DATABASE_URL not set/);
    expect(() => getPool(undefined)).toThrow(/DATABASE_URL not set/);
    expect(mockPool).not.toHaveBeenCalled();
  });
});
