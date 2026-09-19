'use strict';

/** Guard for local-dev scripts that write data: must refuse remote database hosts unless ALLOW_REMOTE=1. */
const { assertLocalDb } = require('../scripts/lib/assertLocalDb');

describe('assertLocalDb', () => {
  const saved = { ...process.env };
  let exit;
  let err;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.DB_HOST;
    delete process.env.ALLOW_REMOTE;
    exit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    err = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    exit.mockRestore();
    err.mockRestore();
    process.env = { ...saved };
  });

  const allowed = (url) => {
    process.env.DATABASE_URL = url;
    assertLocalDb('t.js');
    return !exit.mock.calls.length;
  };

  it.each([
    'postgres://jobtune:jobtune@localhost:5433/jobtune',
    'postgresql://u:p@127.0.0.1:5432/x?sslmode=disable',
    'postgres://u:p@[::1]:5432/x',
    'postgres://u:p@db:5432/x',
  ])('allows local host %s', (url) => {
    expect(allowed(url)).toBe(true);
  });

  it.each([
    'postgres://u:p@ep-cool-123.us-east-2.aws.neon.tech/neondb?sslmode=require',
    'postgres://u:p@localhost.evil.com/x',
    'postgres://u:p@127.0.0.1.neon.tech/x',
    'not a url',
  ])('refuses %s', (url) => {
    expect(allowed(url)).toBe(false);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('never prints the connection string, credentials or password (host only)', () => {
    process.env.DATABASE_URL = 'postgres://someuser:s3cr3t-pw@ep-x.neon.tech/db';
    assertLocalDb('t.js');
    const out = err.mock.calls.flat().join(' ');
    expect(out).toContain('ep-x.neon.tech');
    expect(out).not.toContain('s3cr3t-pw');
    expect(out).not.toContain('someuser');
  });

  it('ALLOW_REMOTE=1 is the explicit override', () => {
    process.env.ALLOW_REMOTE = '1';
    expect(allowed('postgres://u:p@ep-x.neon.tech/db')).toBe(true);
  });

  it('with no DATABASE_URL uses DB_HOST (default localhost)', () => {
    assertLocalDb('t.js');
    expect(exit).not.toHaveBeenCalled();
    process.env.DB_HOST = 'db.prod.example.com';
    assertLocalDb('t.js');
    expect(exit).toHaveBeenCalledWith(1);
  });
});
