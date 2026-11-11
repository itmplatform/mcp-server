export interface ResultSizeGuardConfig {
  warnBytes?: number;
  hardBytes?: number;
}

interface ContentItem {
  type: string;
  text?: string;
}

interface ToolResult {
  content: ContentItem[];
  isError?: boolean;
}

export interface GuardResult {
  result: ToolResult;
  responseBytes: number;
  wasTruncated: boolean;
  warning?: string;
}

const DEFAULT_WARN_BYTES = 50_000;

/** Hard limit for one tool result; above it the guard replaces the result with an error. */
export const RESULT_HARD_BYTES = 100_000;

/**
 * Size that collection tools fit their pages into before returning, kept below
 * RESULT_HARD_BYTES so a trimmed page never reaches the guard.
 */
export const PAGE_BUDGET_BYTES = 90_000;

// Results that a tool shortened to fit PAGE_BUDGET_BYTES. Instrumentation reads
// this to audit and log the trimming without adding fields to the MCP result.
const trimmedResults = new WeakSet<object>();

export function markResultTrimmed<T extends object>(result: T): T {
  trimmedResults.add(result);
  return result;
}

export function isResultTrimmed(result: unknown): boolean {
  return typeof result === 'object' && result !== null && trimmedResults.has(result);
}

export function guardResultSize(result: ToolResult, config?: ResultSizeGuardConfig): GuardResult {
  if (result.isError) {
    return { result, responseBytes: 0, wasTruncated: false };
  }

  const warnBytes = config?.warnBytes ?? DEFAULT_WARN_BYTES;
  const hardBytes = config?.hardBytes ?? RESULT_HARD_BYTES;

  let totalBytes = 0;
  for (const item of result.content) {
    if (item.type === 'text' && item.text) {
      totalBytes += Buffer.byteLength(item.text, 'utf8');
    }
  }

  if (totalBytes > hardBytes) {
    return {
      result: {
        isError: true,
        content: [{
          type: 'text',
          text: `Result too large (${totalBytes} bytes, maximum ${hardBytes}). Request fewer items with limit/skip, fewer fields, or narrower filters.`,
        }],
      },
      responseBytes: totalBytes,
      wasTruncated: true,
    };
  }

  if (totalBytes > warnBytes) {
    return {
      result,
      responseBytes: totalBytes,
      wasTruncated: false,
      warning: `Large result: ${totalBytes} bytes (warn threshold: ${warnBytes})`,
    };
  }

  return { result, responseBytes: totalBytes, wasTruncated: false };
}
