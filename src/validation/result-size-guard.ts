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
const DEFAULT_HARD_BYTES = 100_000;

export function guardResultSize(result: ToolResult, config?: ResultSizeGuardConfig): GuardResult {
  if (result.isError) {
    return { result, responseBytes: 0, wasTruncated: false };
  }

  const warnBytes = config?.warnBytes ?? DEFAULT_WARN_BYTES;
  const hardBytes = config?.hardBytes ?? DEFAULT_HARD_BYTES;

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
          text: `Result too large (${totalBytes} bytes). Use the dedicated subcomponent tools with limit/skip and narrow fields.`,
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
