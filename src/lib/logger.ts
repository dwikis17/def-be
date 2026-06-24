import { pino } from 'pino';
import { env, isProd } from '../config/env.js';

/**
 * Process-wide structured logger. Pretty in dev, JSON in prod.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  transport: isProd
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
  base: { env: env.NODE_ENV },
});
