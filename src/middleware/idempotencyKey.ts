import type { RequestHandler } from 'express';
import { requireIdempotencyKey } from '../lib/idempotency.js';

/** Parse the Idempotency-Key header onto req. Throws if missing/empty. */
export const requireIdempotency: RequestHandler = (req, _res, next) => {
  const raw = req.header('Idempotency-Key') ?? undefined;
  req.idempotencyKey = requireIdempotencyKey(raw);
  next();
};
