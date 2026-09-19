'use strict';

const { AICache, createAiCache, getIsolateAiCache, MAX_ENTRIES, DEFAULT_TTL_MS } = require('../../../src/worker/services/aiCache');
const ExpressAiCache = require('../../../src/utils/aiCache'); // singleton instance of the original

describe('services/aiCache (per-isolate LRU; port of utils/aiCache.js)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('has the original limits', () => {
    expect(MAX_ENTRIES).toBe(500);
    expect(DEFAULT_TTL_MS).toBe(3600000);
  });

  it('get/set round trip and miss accounting, same as the original', () => {
    const c = new AICache();
    expect(c.get('s', 'u', 100, 0.4)).toBeNull();
    c.set('s', 'u', 100, 0.4, 'answer');
    expect(c.get('s', 'u', 100, 0.4)).toBe('answer');
    expect(c.getStats()).toEqual({ size: 1, hits: 1, misses: 1, hitRate: 50 });
  });

  it('keys on system + user + maxTokens + temperature only', () => {
    const c = new AICache();
    c.set('s', 'u', 100, 0.4, 'v');
    expect(c.get('s', 'u', 100, 0.4)).toBe('v');
    expect(c.get('s2', 'u', 100, 0.4)).toBeNull();
    expect(c.get('s', 'u2', 100, 0.4)).toBeNull();
    expect(c.get('s', 'u', 101, 0.4)).toBeNull();
    expect(c.get('s', 'u', 100, 0.5)).toBeNull();
  });

  it('derives the same 16-hex-char sha256 key as the Express cache', () => {
    const c = new AICache();
    const args = ['sys prompt', 'user | prompt', 512, 0.4];
    expect(c._hash(...args)).toBe(ExpressAiCache._hash(...args));
    expect(c._hash(...args)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('expires entries after the TTL (counts as a miss and deletes the entry)', () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    const c = new AICache();
    c.set('s', 'u', 1, 0, 'v');
    now.mockReturnValue(1_000_000 + DEFAULT_TTL_MS); // exactly at expiry: still valid (strict >)
    expect(c.get('s', 'u', 1, 0)).toBe('v');
    now.mockReturnValue(1_000_000 + DEFAULT_TTL_MS + 1);
    expect(c.get('s', 'u', 1, 0)).toBeNull();
    expect(c.getStats().size).toBe(0);
  });

  it('honours a per-entry ttl', () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(0);
    const c = new AICache();
    c.set('s', 'u', 1, 0, 'short', 10);
    now.mockReturnValue(11);
    expect(c.get('s', 'u', 1, 0)).toBeNull();
  });

  it('evicts the oldest entry at 500 (default) and a get refreshes recency, like the original', () => {
    const port = new AICache();
    ExpressAiCache.clear();
    for (let i = 0; i < 500; i++) {
      port.set('s', `u${i}`, 1, 0, `v${i}`);
      ExpressAiCache.set('s', `u${i}`, 1, 0, `v${i}`);
    }
    expect(port.getStats().size).toBe(500);
    expect(port.get('s', 'u0', 1, 0)).toBe('v0'); // refresh u0 -> u1 becomes oldest
    expect(ExpressAiCache.get('s', 'u0', 1, 0)).toBe('v0');
    port.set('s', 'u500', 1, 0, 'v500');
    ExpressAiCache.set('s', 'u500', 1, 0, 'v500');
    for (const [name, cache] of [['port', port], ['express', ExpressAiCache]]) {
      expect([name, cache.getStats().size]).toEqual([name, 500]);
      expect([name, cache.get('s', 'u1', 1, 0)]).toEqual([name, null]); // evicted
      expect([name, cache.get('s', 'u0', 1, 0)]).toEqual([name, 'v0']); // kept
      expect([name, cache.get('s', 'u500', 1, 0)]).toEqual([name, 'v500']);
    }
    ExpressAiCache.clear();
  });

  it('getStats hitRate is a rounded whole percent; 0 with no traffic', () => {
    const c = new AICache();
    expect(c.getStats()).toEqual({ size: 0, hits: 0, misses: 0, hitRate: 0 });
    c.set('a', 'a', 1, 0, 'x');
    c.get('a', 'a', 1, 0);
    c.get('a', 'a', 1, 0);
    c.get('b', 'b', 1, 0);
    expect(c.getStats()).toEqual({ size: 1, hits: 2, misses: 1, hitRate: 67 });
  });

  it('clear empties the entries and resets the counters', () => {
    const c = new AICache();
    c.set('a', 'a', 1, 0, 'x');
    c.get('a', 'a', 1, 0);
    c.clear();
    expect(c.getStats()).toEqual({ size: 0, hits: 0, misses: 0, hitRate: 0 });
  });

  it('exposes the same public methods as the Express singleton', () => {
    const c = new AICache();
    for (const m of ['get', 'set', 'getStats', 'clear', '_hash']) {
      expect(typeof c[m]).toBe('function');
      expect(typeof ExpressAiCache[m]).toBe('function');
    }
  });

  describe('per-isolate sharing (ADR 4.5)', () => {
    it('createAiCache() returns the one isolate cache every time, so hits survive across requests', () => {
      const a = createAiCache();
      const b = createAiCache();
      expect(a).toBe(b);
      expect(a).toBe(getIsolateAiCache());
      a.clear();
      a.set('s', 'u', 1, 0, 'v');
      expect(b.get('s', 'u', 1, 0)).toBe('v');
      a.clear();
    });

    it('a separate store can be injected (tests), and does not touch the isolate cache', () => {
      const own = new AICache();
      expect(createAiCache({ store: own })).toBe(own);
      own.set('s', 'u', 1, 0, 'v');
      getIsolateAiCache().clear();
      expect(getIsolateAiCache().get('s', 'u', 1, 0)).toBeNull();
    });

    it('two isolates (fresh module instances) do not share entries: the documented hit-rate regression', () => {
      let isolateA;
      let isolateB;
      jest.isolateModules(() => { isolateA = require('../../../src/worker/services/aiCache').getIsolateAiCache(); });
      jest.isolateModules(() => { isolateB = require('../../../src/worker/services/aiCache').getIsolateAiCache(); });
      expect(isolateA).not.toBe(isolateB);
      isolateA.set('same prompt', 'same prompt', 1, 0, 'warm in A');
      expect(isolateA.get('same prompt', 'same prompt', 1, 0)).toBe('warm in A');
      expect(isolateB.get('same prompt', 'same prompt', 1, 0)).toBeNull(); // B is cold: a provider call on Workers
      expect(isolateB.getStats()).toMatchObject({ hits: 0, misses: 1, hitRate: 0 });
    });
  });
});
