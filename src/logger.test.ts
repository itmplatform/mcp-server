import { describe, it, expect, vi, afterEach } from 'vitest';
import pino from 'pino';

describe('createLogger', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns a pino Logger instance', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { createLogger } = await import('./logger.js');
    const log = createLogger('mcp');
    expect(log).toBeDefined();
    expect(typeof log.info).toBe('function');
    expect(typeof log.error).toBe('function');
    expect(typeof log.debug).toBe('function');
    expect(typeof log.warn).toBe('function');
  });

  it('defaults to info level', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('LOG_LEVEL', '');
    const { createLogger } = await import('./logger.js');
    const log = createLogger('mcp');
    expect(log.level).toBe('info');
  });

  it('respects LOG_LEVEL env var', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('LOG_LEVEL', 'debug');
    const { createLogger } = await import('./logger.js');
    const log = createLogger('mcp');
    expect(log.level).toBe('debug');
  });

  it('includes service and app in base bindings', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { createLogger } = await import('./logger.js');
    const log = createLogger('mcp');
    const bindings = log.bindings();
    expect(bindings.service).toBe('mcp');
    expect(bindings.app).toBe('ITM.MCP');
  });

  it('accepts different service names', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { createLogger } = await import('./logger.js');
    const log = createLogger('test-svc');
    const bindings = log.bindings();
    expect(bindings.service).toBe('test-svc');
  });
});
