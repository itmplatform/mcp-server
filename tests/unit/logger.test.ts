import { describe, it, expect, vi, afterEach } from 'vitest';
import pino from 'pino';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

describe('createLogger', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns a pino Logger instance', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { createLogger } = await import('../../src/logger.js');
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
    const { createLogger } = await import('../../src/logger.js');
    const log = createLogger('mcp');
    expect(log.level).toBe('info');
  });

  it('respects LOG_LEVEL env var', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('LOG_LEVEL', 'debug');
    const { createLogger } = await import('../../src/logger.js');
    const log = createLogger('mcp');
    expect(log.level).toBe('debug');
  });

  it('includes service and app in base bindings', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { createLogger } = await import('../../src/logger.js');
    const log = createLogger('mcp');
    const bindings = log.bindings();
    expect(bindings.service).toBe('mcp');
    expect(bindings.app).toBe('ITM.MCP');
  });

  it('accepts different service names', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { createLogger } = await import('../../src/logger.js');
    const log = createLogger('test-svc');
    const bindings = log.bindings();
    expect(bindings.service).toBe('test-svc');
  });

  it('resolves file logs from the application directory, not the launch directory', async () => {
    const previousCwd = process.cwd();
    const foreignCwd = mkdtempSync(join(tmpdir(), 'itm-mcp-logger-'));

    try {
      process.chdir(foreignCwd);
      vi.resetModules();

      const { LOG_FILE } = await import('../../src/logger.js');
      const expectedLogFile = fileURLToPath(new URL('../../logs/mcp.log', import.meta.url));

      expect(LOG_FILE).toBe(expectedLogFile);
      expect(LOG_FILE).not.toBe(join(foreignCwd, 'logs', 'mcp.log'));
    } finally {
      process.chdir(previousCwd);
      rmSync(foreignCwd, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
