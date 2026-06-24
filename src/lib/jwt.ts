import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from './errors.js';

export type AccessClaims = { sub: string; isGuest: boolean; type: 'access' };
export type RefreshClaims = { sub: string; type: 'refresh' };

export function signAccessToken(playerId: string, isGuest: boolean): string {
  const payload: AccessClaims = { sub: playerId, isGuest, type: 'access' };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL });
}

export function signRefreshToken(playerId: string): string {
  const payload: RefreshClaims = { sub: playerId, type: 'refresh' };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_TTL });
}

export function issueTokens(playerId: string, isGuest: boolean) {
  return {
    accessToken: signAccessToken(playerId, isGuest),
    refreshToken: signRefreshToken(playerId),
    expiresIn: env.JWT_ACCESS_TTL,
  };
}

export function verifyAccessToken(token: string): AccessClaims {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessClaims;
    if (decoded.type !== 'access') throw new Error('wrong token type');
    return decoded;
  } catch {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired access token');
  }
}

export function verifyRefreshToken(token: string): RefreshClaims {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshClaims;
    if (decoded.type !== 'refresh') throw new Error('wrong token type');
    return decoded;
  } catch {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired refresh token');
  }
}
