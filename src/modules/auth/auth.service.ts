import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { issueTokens, signAccessToken, verifyRefreshToken } from '../../lib/jwt.js';
import {
  buildStatement,
  generateNonce,
  isValidPubkey,
  verifySignature,
} from '../../lib/siws.js';
import { createPlayerWithGarden, toPlayerView } from '../../services/player.service.js';

/** GET /auth/challenge — issue a nonce + statement for a pubkey. */
export async function createChallenge(pubkey: string) {
  if (!isValidPubkey(pubkey)) throw new AppError('VALIDATION', 'Invalid Solana public key');
  const nonce = generateNonce();
  const statement = buildStatement(pubkey, nonce);
  const expiresAt = new Date(Date.now() + env.AUTH_NONCE_TTL * 1000);
  await prisma.authNonce.create({ data: { nonce, pubkey, statement, expiresAt } });
  return { nonce, statement, expiresAt };
}

/**
 * Consume the latest unexpired nonce for `pubkey` and verify the signature over
 * its statement. Returns the statement on success; throws otherwise.
 */
async function consumeAndVerify(pubkey: string, signature: string): Promise<void> {
  const nonceRow = await prisma.authNonce.findFirst({
    where: { pubkey, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: 'desc' },
  });
  if (!nonceRow) throw new AppError('NONCE_EXPIRED', 'No valid challenge; request a new one');

  const ok = verifySignature(nonceRow.statement, signature, pubkey);
  if (!ok) throw new AppError('INVALID_SIGNATURE', 'Signature verification failed');

  // Consume all nonces for this pubkey (single-use).
  await prisma.authNonce.deleteMany({ where: { pubkey } });
}

/** POST /auth/verify — SIWS login; creates the player on first sign-in. */
export async function verifyAndLogin(pubkey: string, signature: string) {
  await consumeAndVerify(pubkey, signature);

  let player = await prisma.player.findUnique({ where: { walletPubkey: pubkey } });
  if (!player) {
    player = await prisma.$transaction((tx) => createPlayerWithGarden(tx, { walletPubkey: pubkey }));
  } else {
    await prisma.player.update({ where: { id: player.id }, data: { lastSeenAt: new Date() } });
  }

  return { ...issueTokens(player.id, player.isGuest), player: toPlayerView(player) };
}

/** POST /auth/refresh — exchange a refresh token for a new access token. */
export async function refresh(refreshToken: string) {
  const claims = verifyRefreshToken(refreshToken);
  const player = await prisma.player.findUnique({ where: { id: claims.sub } });
  if (!player) throw new AppError('UNAUTHORIZED', 'Player no longer exists');
  return { accessToken: signAccessToken(player.id, player.isGuest), expiresIn: env.JWT_ACCESS_TTL };
}
