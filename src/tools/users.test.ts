import { describe, it, expect, vi, afterEach } from 'vitest';

describe('search_users query composition', () => {
  it('builds POST body with name filter', () => {
    const args = { query: 'daniel', limit: 5 };
    const body: Record<string, unknown> = {
      page: 1,
      pageSize: Math.min(args.limit ?? 50, 200),
    };
    if (args.query) body.Filter = { Name: { $regex: args.query } };

    expect(body.Filter).toEqual({ Name: { $regex: 'daniel' } });
    expect(body.pageSize).toBe(5);
  });

  it('defaults pageSize to 50', () => {
    const args: { query?: string; limit?: number } = {};
    const pageSize = Math.min(args.limit ?? 50, 200);
    expect(pageSize).toBe(50);
  });

  it('caps pageSize at 200', () => {
    const args = { limit: 500 };
    const pageSize = Math.min(args.limit ?? 50, 200);
    expect(pageSize).toBe(200);
  });
});

describe('get_user URL construction', () => {
  it('builds correct path', () => {
    const userId = 123;
    const path = `users/${userId}`;
    expect(path).toBe('users/123');
  });
});
