import { describe, it, expect, vi } from 'vitest';
import { CUSTOM_FIELD_ENTITIES, buildCustomFieldsPath, buildCustomFieldOptionsPath, registerCustomFieldTools } from '../../../src/tools/custom-fields.js';

const USER_CONTEXT = { languageId: 2 } as any;

function registerAndGet() {
  const registrations = new Map<string, any>();
  const server = {
    registerTool: vi.fn((name: string, config: any, handler: any) => {
      registrations.set(name, { config, handler });
    }),
  };
  const rest = { get: vi.fn().mockResolvedValue([{ Id: 5504, BaseId: 5504, Name: 'Lista', TypeId: 8, TypeName: 'List' }]) };
  registerCustomFieldTools(server as any, { rest } as any, USER_CONTEXT);
  return { registrations, rest };
}

describe('custom field path builders', () => {
  it('maps every entity to its plural CustomFields path', () => {
    expect(buildCustomFieldsPath('project', 2)).toBe('Projects/CustomFields?LanguageId=2');
    expect(buildCustomFieldsPath('task', 1)).toBe('Tasks/CustomFields?LanguageId=1');
    expect(buildCustomFieldsPath('risk', 1)).toBe('Risks/CustomFields?LanguageId=1');
    expect(buildCustomFieldsPath('issue', 3)).toBe('Issues/CustomFields?LanguageId=3');
    expect(buildCustomFieldsPath('service', 1)).toBe('Services/CustomFields?LanguageId=1');
    expect(buildCustomFieldsPath('activity', 1)).toBe('Activities/CustomFields?LanguageId=1');
    expect(buildCustomFieldsPath('purchase', 1)).toBe('Purchases/CustomFields?LanguageId=1');
    expect(buildCustomFieldsPath('revenue', 1)).toBe('Revenues/CustomFields?LanguageId=1');
  });

  it('covers all entities in the enum', () => {
    expect(CUSTOM_FIELD_ENTITIES).toHaveLength(8);
  });

  it('builds the options path with the base id and language', () => {
    expect(buildCustomFieldOptionsPath(5504, 2)).toBe('CustomFieldOptions/5504?LanguageId=2');
  });
});

describe('get_custom_fields', () => {
  it('registers both tools', () => {
    const { registrations } = registerAndGet();
    expect(registrations.has('get_custom_fields')).toBe(true);
    expect(registrations.has('get_custom_field_options')).toBe(true);
  });

  it('defaults LanguageId to the session user language', async () => {
    const { registrations, rest } = registerAndGet();
    await registrations.get('get_custom_fields').handler({ entity: 'project' });
    expect(rest.get).toHaveBeenCalledWith('Projects/CustomFields?LanguageId=2');
  });

  it('lets languageId override the session default', async () => {
    const { registrations, rest } = registerAndGet();
    await registrations.get('get_custom_fields').handler({ entity: 'project', languageId: 3 });
    expect(rest.get).toHaveBeenCalledWith('Projects/CustomFields?LanguageId=3');
  });

  it('falls back to English when no user context is available', async () => {
    const registrations = new Map<string, any>();
    const server = { registerTool: vi.fn((name: string, config: any, handler: any) => registrations.set(name, { config, handler })) };
    const rest = { get: vi.fn().mockResolvedValue([]) };
    registerCustomFieldTools(server as any, { rest } as any);
    await registrations.get('get_custom_fields').handler({ entity: 'task' });
    expect(rest.get).toHaveBeenCalledWith('Tasks/CustomFields?LanguageId=1');
  });

  it('returns the REST payload as JSON text', async () => {
    const { registrations } = registerAndGet();
    const result = await registrations.get('get_custom_fields').handler({ entity: 'project' });
    expect(JSON.parse(result.content[0].text)).toEqual([{ Id: 5504, BaseId: 5504, Name: 'Lista', TypeId: 8, TypeName: 'List' }]);
  });

  it('documents the DataMart customFields key semantics in the description', () => {
    const { registrations } = registerAndGet();
    const description = registrations.get('get_custom_fields').config.description;
    expect(description).toContain('customFields');
    expect(description).toContain('case');
    expect(description).toContain('query_datamart');
    for (const entity of CUSTOM_FIELD_ENTITIES) {
      expect(description).toContain(entity);
    }
  });
});

describe('get_custom_field_options', () => {
  it('fetches options by BaseId with the session language', async () => {
    const { registrations, rest } = registerAndGet();
    await registrations.get('get_custom_field_options').handler({ customFieldBaseId: 5504 });
    expect(rest.get).toHaveBeenCalledWith('CustomFieldOptions/5504?LanguageId=2');
  });

  it('accepts a languageId override', async () => {
    const { registrations, rest } = registerAndGet();
    await registrations.get('get_custom_field_options').handler({ customFieldBaseId: 5504, languageId: 1 });
    expect(rest.get).toHaveBeenCalledWith('CustomFieldOptions/5504?LanguageId=1');
  });

  it('points at get_custom_fields BaseId in the description', () => {
    const { registrations } = registerAndGet();
    const description = registrations.get('get_custom_field_options').config.description;
    expect(description).toContain('BaseId');
    expect(description).toContain('get_custom_fields');
  });
});
