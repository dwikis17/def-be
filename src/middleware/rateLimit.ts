import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';

/**
 * In-memory rate limiters (Postgres-only infra; single-node). For horizontal
 * scale, swap the store for a shared one. Keyed by player id when authenticated,
 * else by IP.
 *
 * NOTE: mount AFTER requireAuth so req.player is available for keying.
 */
function keyByPlayerOrIp(req: Request): string {
  return req.player?.id ?? req.ip ?? 'unknown';
}

const shared: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: keyByPlayerOrIp,
  handler: (_req, res) => {
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
  },
};

/** Auth endpoints (challenge/verify) — keyed by IP, stricter. */
export const authLimiter = rateLimit({
  ...shared,
  windowMs: 60_000,
  limit: 20,
  keyGenerator: (req: Request) => req.ip ?? 'unknown',
});

/** Value-bearing actions (plant/harvest/sell/buy/claim). */
export const valueActionLimiter = rateLimit({ ...shared, windowMs: 60_000, limit: 120 });

/** General authenticated reads. */
export const generalLimiter = rateLimit({ ...shared, windowMs: 60_000, limit: 300 });
