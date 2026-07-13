import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ALLOWED_ENTITIES } from '../../../src/tools/reference-data.js';

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
    expect(ALLOWED_ENTITIES).toHaveLength(16);
  });

  it('includes assessments for task progress ratings', () => {
    expect(ALLOWED_ENTITIES).toContain('assessments');
  });
});
