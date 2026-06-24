import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { randomBytes } from 'node:crypto';
import { AppError } from './errors.js';

/**
 * Sign-In-With-Solana primitives (docs §05). The server only ever verifies an
 * ed25519 signature against a public key — no private keys touch the server.
 */

/** A random URL-safe nonce. */
export function generateNonce(): string {
  return randomBytes(24).toString('base64url');
}

/** Human-readable challenge the wallet signs verbatim. */
export function buildStatement(pubkey: string, nonce: string): string {
  return [
    'Bloom Garden wants you to sign in with your Solana account:',
    pubkey,
    '',
    'Sign this message to authenticate. This will not trigger a transaction or cost any fees.',
    '',
    `Nonce: ${nonce}`,
  ].join('\n');
}

/** Validate a base58 Solana public key (32 bytes). */
export function isValidPubkey(pubkey: string): boolean {
  try {
    return bs58.decode(pubkey).length === 32;
  } catch {
    return false;
  }
}

/**
 * Verify that `signature` (base58 or base64) is a valid ed25519 signature of
 * `message` (utf-8) by `pubkey` (base58). Returns true/false; never throws on a
 * bad signature, only on malformed inputs.
 */
export function verifySignature(message: string, signature: string, pubkey: string): boolean {
  let pub: Uint8Array;
  try {
    pub = bs58.decode(pubkey);
  } catch {
    throw new AppError('VALIDATION', 'Malformed public key');
  }
  if (pub.length !== 32) throw new AppError('VALIDATION', 'Public key must be 32 bytes');

  const sig = decodeSignature(signature);
  if (sig.length !== 64) throw new AppError('VALIDATION', 'Signature must be 64 bytes');

  const msg = new TextEncoder().encode(message);
  return nacl.sign.detached.verify(msg, sig, pub);
}

/** Accept base58 first, fall back to base64. */
function decodeSignature(signature: string): Uint8Array {
  try {
    const b58 = bs58.decode(signature);
    if (b58.length === 64) return b58;
  } catch {
    // fall through to base64
  }
  try {
    return new Uint8Array(Buffer.from(signature, 'base64'));
  } catch {
    throw new AppError('VALIDATION', 'Signature is not valid base58 or base64');
  }
}
