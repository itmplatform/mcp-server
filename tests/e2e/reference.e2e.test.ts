import { describe, it, expect } from 'vitest';
import { setupE2E, callTool } from './setup.js';

describe('reference data tools', () => {
  setupE2E();

  it('get_reference_data returns project statuses', async () => {
    const result = await callTool('get_reference_data', { entity: 'projectstatuses' });
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
    const data = JSON.parse(result.result.content[0].text);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });
});
