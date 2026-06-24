/**
 * Test environment defaults. Runs before any test file imports app/config, so
 * env validation passes without a real .env.
 *
 * When RUN_DB_TESTS=1, load the real .env FIRST so the live DATABASE_URL is used
 * (dotenv does not override already-set vars, so the fallbacks below won't clobber it).
 */
import { config } from 'dotenv';

if (process.env.RUN_DB_TESTS === '1') config();

process.env.NODE_ENV = 'test';
process.env.PORT ??= '4001';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/bloom_test';
process.env.DIRECT_URL ??= process.env.DATABASE_URL;
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-at-least-16';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-at-least-16';
process.env.DEV_TIME_SCALE ??= '360';
process.env.CORS_ORIGINS ??= 'http://localhost:3000';
