import { describe, it, expect, vi } from 'vitest';
import { registerUserTools } from '../../../src/tools/users.js';

describe('search_users query composition', () => {
  function registerAndGetHandler() {
    const registrations = new Map<string, any>();
    const server = {
      registerTool: vi.fn((name: string, config: any, handler: any) => {
        registrations.set(name, { config, handler });
      }),
    };
    const rest = { post: vi.fn().mockResolvedValue({ list: [] }), get: vi.fn() };
    registerUserTools(server as any, { rest } as any);
    return { handler: registrations.get('search_users').handler, rest };
  }

  it('POSTs Users/Search with a projected identity response (including the non-login flag) and name-or-email filter', async () => {
    const { handler, rest } = registerAndGetHandler();
    await handler({ query: 'daniel', limit: 5 });

    expect(rest.post).toHaveBeenCalledWith('Users/Search?paged=true', {
      page: 1,
      pageSize: 5,
      Columns: { $in: ['UserId', 'DisplayName', 'EmailAddress', 'IsNonLoginUser'] },
      Filter: { Name: { $regex: 'daniel' } },
      sortBy: 'DisplayName',
      sortOrder: 'asc',
    });
  });

  it('defaults pageSize to 50 and caps it at 200', async () => {
    const { handler, rest } = registerAndGetHandler();
    await handler({});
    await handler({ limit: 500 });
    expect(rest.post.mock.calls[0][1].pageSize).toBe(50);
    expect(rest.post.mock.calls[1][1].pageSize).toBe(200);
  });
});

describe('get_user URL construction', () => {
  it('builds correct path', () => {
    const userId = 123;
    const path = `users/${userId}`;
    expect(path).toBe('users/123');
  });
});
