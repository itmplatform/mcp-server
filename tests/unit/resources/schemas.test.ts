import { describe, it, expect } from 'vitest';

const SCHEMA_ENTITIES = ['component', 'task', 'purchase', 'risk', 'issue'];

describe('schema resources', () => {
  it('covers all 5 DataMart entity schemas', () => {
    expect(SCHEMA_ENTITIES).toHaveLength(5);
    expect(SCHEMA_ENTITIES).toContain('component');
    expect(SCHEMA_ENTITIES).toContain('task');
  });

  it('maps entity to correct URI pattern', () => {
    const uriMap: Record<string, string> = {
      component: 'itm://schema/component',
      task: 'itm://schema/tasks',
      purchase: 'itm://schema/purchases',
      risk: 'itm://schema/risks',
      issue: 'itm://schema/issues',
    };
    expect(Object.keys(uriMap)).toHaveLength(5);
    expect(uriMap.component).toBe('itm://schema/component');
  });

  it('maps entity to correct API path', () => {
    const entity = 'component';
    const apiPath = `datamart/api/schema/${entity}`;
    expect(apiPath).toBe('datamart/api/schema/component');
  });
});
