import { describe, it, expect } from 'vitest';
import { setupE2E, callTool } from './setup.js';

describe('user tools', () => {
  setupE2E();

  it('search_users returns results', async () => {
    const result = await callTool('search_users', { limit: 5 });
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
  });

  it('search_users with query filter', async () => {
    const result = await callTool('search_users', { query: 'daniel', limit: 3 });
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
  });
});
