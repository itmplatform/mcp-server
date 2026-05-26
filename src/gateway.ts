const GATEWAY_PREFIX = /^\/v2\/[\w-]+\/mcp(?=\/|$)/;

export function resolveRoute(url: string): string {
  const stripped = url.replace(GATEWAY_PREFIX, '');
  return stripped || '/';
}
