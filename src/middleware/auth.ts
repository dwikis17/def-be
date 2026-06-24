import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../lib/jwt.js';
import { AppError } from '../lib/errors.js';

/** Require a valid access token; attaches req.player. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('UNAUTHORIZED', 'Missing Bearer token');
  }
  const claims = verifyAccessToken(header.slice(7));
  req.player = { id: claims.sub, isGuest: claims.isGuest };
  next();
};

/** Require a non-guest (wallet-bound) player — for chain/claim routes. */
export const requireWallet: RequestHandler = (req, _res, next) => {
  if (!req.player) throw new AppError('UNAUTHORIZED', 'Authentication required');
  if (req.player.isGuest) {
    throw new AppError('FORBIDDEN', 'Connect a wallet to use this feature');
  }
  next();
};

/** Helper for handlers: assert + return the player (never undefined). */
export function getPlayer(req: { player?: { id: string; isGuest: boolean } }) {
  if (!req.player) throw new AppError('UNAUTHORIZED', 'Authentication required');
  return req.player;
}
