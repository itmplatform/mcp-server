import { describe, it, expect } from 'vitest';
import { extractBearerToken } from '../../../src/auth/token-extraction.js';

describe('extractBearerToken', () => {
  it('extracts token from Bearer authorization header', () => {
    expect(extractBearerToken({ authorization: 'Bearer abc123' })).toBe('abc123');
  });

  it('returns undefined when no Authorization header', () => {
    expect(extractBearerToken({})).toBeUndefined();
  });

  it('returns undefined for non-Bearer auth', () => {
    expect(extractBearerToken({ authorization: 'Basic abc123' })).toBeUndefined();
  });

  it('handles token with special characters', () => {
    expect(extractBearerToken({ authorization: 'Bearer eyJhbGciOi.payload.sig' })).toBe('eyJhbGciOi.payload.sig');
  });
});
