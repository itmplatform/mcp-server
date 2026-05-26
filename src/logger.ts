import pino, { type Logger } from 'pino';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = join(APP_DIR, 'logs');
export const LOG_FILE = join(LOG_DIR, 'mcp.log');

export function createLogger(service: string): Logger {
  const level = process.env.LOG_LEVEL || 'info';
  const isTest = process.env.NODE_ENV === 'test';

  const targets: pino.TransportTargetOptions[] = [
    {
      target: 'pino-pretty',
      options: {
        singleLine: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
        colorize: true,
        destination: 2,
      },
      level,
    },
  ];

  if (!isTest) {
    mkdirSync(LOG_DIR, { recursive: true });
    targets.push({
      target: 'pino-roll',
      options: { file: LOG_FILE, size: '10m', limit: { count: 5 } },
      level,
    });
  }

  return pino({
    level,
    base: { service, app: 'ITM.MCP' },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: { targets },
  });
}
