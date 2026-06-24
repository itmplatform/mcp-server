import { describe, it, expect, vi, beforeEach } from 'vitest';
import { instrumentServer } from '../../src/instrument-server.js';
import type { AuditClient } from '../../src/clients/audit-client.js';

function mockLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
}

function mockAuditClient(): AuditClient {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

const userCtx = { userId: 100, accountId: 200, aiClientId: 'test-ai' };

describe('instrumentServer', () => {
  let originalRegisterTool: ReturnType<typeof vi.fn>;
  let server: any;
  let log: ReturnType<typeof mockLogger>;
  let audit: AuditClient;

  beforeEach(() => {
    originalRegisterTool = vi.fn();
    server = { registerTool: originalRegisterTool };
    log = mockLogger();
    audit = mockAuditClient();
    instrumentServer(server, log, userCtx, audit);
  });

  function registerAndGetWrapped(handler: (...args: any[]) => any) {
    const config = { description: 'test tool', inputSchema: {} };
    server.registerTool('test_tool', config, handler);
    expect(originalRegisterTool).toHaveBeenCalledTimes(1);
    return originalRegisterTool.mock.calls[0][2];
  }

  it('logs info when a tool is invoked', async () => {
    const handler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    const wrapped = registerAndGetWrapped(handler);

    await wrapped({ x: 1 }, {});

    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'test_tool', userId: 100, aiClientId: 'test-ai' }),
      'Tool invoked',
    );
  });

  it('logs debug with durationMs on success', async () => {
    const handler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    const wrapped = registerAndGetWrapped(handler);

    await wrapped({ x: 1 }, {});

    expect(log.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'test_tool',
        durationMs: expect.any(Number),
      }),
      'Tool completed',
    );
  });

  it('logs error and re-throws when tool throws', async () => {
    const error = new Error('boom');
    const handler = vi.fn().mockRejectedValue(error);
    const wrapped = registerAndGetWrapped(handler);

    await expect(wrapped({ x: 1 }, {})).rejects.toThrow('boom');

    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'test_tool', err: error, durationMs: expect.any(Number) }),
      'Tool failed',
    );
  });

  it('sends audit entry on success', async () => {
    const handler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    const wrapped = registerAndGetWrapped(handler);

    await wrapped({ x: 1 }, {});

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'test_tool',
        userId: 100,
        accountId: 200,
        aiClientId: 'test-ai',
        success: true,
        durationMs: expect.any(Number),
        parametersHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        timestamp: expect.any(String),
      }),
    );
  });

  it('sends audit entry with error on failure', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('REST failed'));
    const wrapped = registerAndGetWrapped(handler);

    await expect(wrapped({}, {})).rejects.toThrow('REST failed');

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'test_tool',
        success: false,
        error: 'REST failed',
      }),
    );
  });

  it('does not break tool execution when audit fails (fire-and-forget)', async () => {
    (audit.log as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('audit down'));
    const handler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'result' }] });
    const wrapped = registerAndGetWrapped(handler);

    const result = await wrapped({ x: 1 }, {});

    expect(result).toEqual({ content: [{ type: 'text', text: 'result' }] });
  });

  it('preserves original config and result unchanged', async () => {
    const config = { description: 'my tool', inputSchema: { y: 'schema' } };
    const expectedResult = { content: [{ type: 'text', text: 'data' }] };
    const handler = vi.fn().mockResolvedValue(expectedResult);

    server.registerTool('preserve_tool', config, handler);
    const [passedName, passedConfig] = originalRegisterTool.mock.calls[0];

    expect(passedName).toBe('preserve_tool');
    expect(passedConfig).toBe(config);

    const wrapped = originalRegisterTool.mock.calls[0][2];
    const result = await wrapped({}, {});
    expect(result).toEqual(expectedResult);
  });

  it('replaces oversized result with error via result-size guard', async () => {
    const big = 'x'.repeat(110_000);
    const handler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: big }] });
    const wrapped = registerAndGetWrapped(handler);

    const result = await wrapped({}, {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('110000');
    expect(result.content[0].text).toContain('subcomponent');
  });

  it('passes normal-sized results through unchanged', async () => {
    const handler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'small' }] });
    const wrapped = registerAndGetWrapped(handler);

    const result = await wrapped({}, {});

    expect(result).toEqual({ content: [{ type: 'text', text: 'small' }] });
  });

  it('includes responseBytes and wasTruncated in audit entry', async () => {
    const handler = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'hello' }] });
    const wrapped = registerAndGetWrapped(handler);

    await wrapped({}, {});

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        responseBytes: Buffer.byteLength('hello', 'utf8'),
        wasTruncated: false,
      }),
    );
  });

  it('audits isError result as failure', async () => {
    const errorResult = {
      isError: true,
      content: [{ type: 'text', text: 'Error: validation failed' }],
    };
    const handler = vi.fn().mockResolvedValue(errorResult);
    const wrapped = registerAndGetWrapped(handler);

    const result = await wrapped({}, {});

    expect(result).toEqual(errorResult);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Error: validation failed',
      }),
    );
  });
});
