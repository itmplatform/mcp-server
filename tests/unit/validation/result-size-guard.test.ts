import { describe, it, expect } from 'vitest';
import { guardResultSize } from '../../../src/validation/result-size-guard.js';

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

describe('guardResultSize', () => {
  it('returns original result when under warn threshold', () => {
    const result = textResult('small payload');
    const guard = guardResultSize(result);

    expect(guard.result).toBe(result);
    expect(guard.wasTruncated).toBe(false);
    expect(guard.warning).toBeUndefined();
    expect(guard.responseBytes).toBe(Buffer.byteLength('small payload', 'utf8'));
  });

  it('returns error result when over hard threshold', () => {
    const big = 'x'.repeat(110_000);
    const result = textResult(big);
    const guard = guardResultSize(result);

    expect(guard.wasTruncated).toBe(true);
    expect(guard.responseBytes).toBe(Buffer.byteLength(big, 'utf8'));
    expect(guard.result.content[0].text).toContain('110000');
    expect(guard.result.content[0].text).toContain('subcomponent');
    expect((guard.result as any).isError).toBe(true);
  });

  it('adds warning when between warn and hard thresholds', () => {
    const mid = 'x'.repeat(60_000);
    const result = textResult(mid);
    const guard = guardResultSize(result);

    expect(guard.result).toBe(result);
    expect(guard.wasTruncated).toBe(false);
    expect(guard.warning).toBeDefined();
    expect(guard.warning).toContain('60000');
  });

  it('sums sizes across multiple content items', () => {
    const result = {
      content: [
        { type: 'text' as const, text: 'x'.repeat(40_000) },
        { type: 'text' as const, text: 'x'.repeat(40_000) },
      ],
    };
    const guard = guardResultSize(result);

    expect(guard.responseBytes).toBe(80_000);
    expect(guard.warning).toBeDefined();
  });

  it('passes through isError results without checking size', () => {
    const big = 'x'.repeat(110_000);
    const result = { isError: true, content: [{ type: 'text' as const, text: big }] };
    const guard = guardResultSize(result);

    expect(guard.result).toBe(result);
    expect(guard.wasTruncated).toBe(false);
    expect(guard.responseBytes).toBe(0);
  });

  it('uses default thresholds of 50KB warn / 100KB hard', () => {
    const justUnderWarn = 'x'.repeat(49_999);
    const justOverWarn = 'x'.repeat(50_001);
    const justUnderHard = 'x'.repeat(99_999);
    const justOverHard = 'x'.repeat(100_001);

    expect(guardResultSize(textResult(justUnderWarn)).warning).toBeUndefined();
    expect(guardResultSize(textResult(justOverWarn)).warning).toBeDefined();
    expect(guardResultSize(textResult(justUnderHard)).wasTruncated).toBe(false);
    expect(guardResultSize(textResult(justOverHard)).wasTruncated).toBe(true);
  });

  it('respects config overrides', () => {
    const result = textResult('x'.repeat(500));
    const guard = guardResultSize(result, { warnBytes: 100, hardBytes: 400 });

    expect(guard.wasTruncated).toBe(true);
    expect(guard.result.content[0].text).toContain('500');
  });

  it('handles result with no text content items', () => {
    const result = { content: [{ type: 'image' as const, data: 'abc' }] } as any;
    const guard = guardResultSize(result);

    expect(guard.responseBytes).toBe(0);
    expect(guard.wasTruncated).toBe(false);
  });
});
