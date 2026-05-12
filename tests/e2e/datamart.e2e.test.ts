import { describe, it, expect } from 'vitest';
import { setupE2E, callTool } from './setup.js';

describe('query_datamart tool', () => {
  setupE2E();

  it('runs a components query', async () => {
    const result = await callTool('query_datamart', {
      operation: 'components',
      where: { componentType: { $eq: 'project' } },
      project: { id: 1, name: 1, percentComplete: 1 },
      limit: 5,
    });
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBeFalsy();
  });

  it('rejects $lookup in pipeline', async () => {
    const result = await callTool('query_datamart', {
      operation: 'aggregateComponents',
      pipeline: [
        { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
      ],
    });
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBe(true);
    expect(result.result.content[0].text).toContain('$lookup');
  });

  it('rejects $where in filter', async () => {
    const result = await callTool('query_datamart', {
      operation: 'components',
      where: { $where: 'this.x > 1' },
    });
    expect(result.result).toBeDefined();
    expect(result.result.isError).toBe(true);
    expect(result.result.content[0].text).toContain('$where');
  });
});
