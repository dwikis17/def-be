/**
 * Request augmentation: middleware/auth.ts attaches the authenticated player,
 * and idempotencyKey.ts attaches the parsed Idempotency-Key.
 */
import 'express';

declare global {
  namespace Express {
    interface Request {
      player?: { id: string; isGuest: boolean };
      idempotencyKey?: string;
    }
  }
}

export {};
