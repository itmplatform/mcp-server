export function extractBearerToken(headers: Record<string, string | undefined>): string | undefined {
  const auth = headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return undefined;
}
