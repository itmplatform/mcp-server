import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { ALLOWED_ENTITIES, registerReferenceDataTools } from '../../../src/tools/reference-data.js';

const entitySchema = z.enum(ALLOWED_ENTITIES);

describe('reference-data entity validation', () => {
  it('accepts valid entity names', () => {
    for (const entity of ALLOWED_ENTITIES) {
      expect(entitySchema.parse(entity)).toBe(entity);
    }
  });

  it('rejects invalid entity names', () => {
    expect(() => entitySchema.parse('invalidentity')).toThrow();
  });

  it('rejects empty string', () => {
    expect(() => entitySchema.parse('')).toThrow();
  });

  it('covers all reference data endpoints exposed by the tool', () => {
    expect(ALLOWED_ENTITIES).toHaveLength(19);
  });

  it('includes servicetypes for create_service TypeId discovery', () => {
    expect(ALLOWED_ENTITIES).toContain('servicetypes');
  });

  it('includes assessments for task progress ratings', () => {
    expect(ALLOWED_ENTITIES).toContain('assessments');
  });

  it('includes risklevels for create_risk LevelId discovery', () => {
    expect(ALLOWED_ENTITIES).toContain('risklevels');
  });

  it('includes activitystatuses for service activity writes', () => {
    expect(ALLOWED_ENTITIES).toContain('activitystatuses');
  });
});

describe('reference-data entity path mapping', () => {
  function registerAndGetHandler() {
    const registrations = new Map<string, any>();
    const server = {
      registerTool: vi.fn((name: string, config: any, handler: any) => {
        registrations.set(name, { config, handler });
      }),
    };
    const rest = { get: vi.fn().mockResolvedValue([{ Id: 1, Name: 'Scheduled' }]) };
    registerReferenceDataTools(server as any, { rest } as any);
    return { handler: registrations.get('get_reference_data').handler, rest };
  }

  it('maps activitystatuses to the IsService task statuses endpoint', async () => {
    const { handler, rest } = registerAndGetHandler();
    await handler({ entity: 'activitystatuses' });
    expect(rest.get).toHaveBeenCalledWith('gettaskstatuses?IsService=true');
  });

  it('maps servicetypes to the IsService project types endpoint', async () => {
    const { handler, rest } = registerAndGetHandler();
    await handler({ entity: 'servicetypes' });
    expect(rest.get).toHaveBeenCalledWith('getprojecttypes?IsService=true');
  });

  it('passes plain entities through as the REST path', async () => {
    const { handler, rest } = registerAndGetHandler();
    await handler({ entity: 'gettaskstatuses' });
    expect(rest.get).toHaveBeenCalledWith('gettaskstatuses');
  });

  it('lists every allowed entity in the tool description', () => {
    const registrations = new Map<string, any>();
    const server = {
      registerTool: vi.fn((name: string, config: any, handler: any) => {
        registrations.set(name, { config, handler });
      }),
    };
    registerReferenceDataTools(server as any, { rest: { get: vi.fn() } } as any);

    const description = registrations.get('get_reference_data').config.description;
    for (const entity of ALLOWED_ENTITIES) {
      expect(description).toContain(entity);
    }
  });
});
