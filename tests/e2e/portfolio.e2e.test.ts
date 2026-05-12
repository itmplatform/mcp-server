import { describe, it, expect } from 'vitest';
import { setupE2E, callTool } from './setup.js';

describe('portfolio tools', () => {
  setupE2E();

  it('aggregate_portfolio groups by status', async () => {
    const result = await callTool('aggregate_portfolio', {
      groupBy: 'statusLabel',
      metrics: ['count', 'avgProgress'],
    });
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
    const data = JSON.parse(result.result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
  });
});
