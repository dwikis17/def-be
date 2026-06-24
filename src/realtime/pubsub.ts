import { EventEmitter } from 'node:events';

/**
 * In-process pub/sub (Postgres-only infra; single node). The WS layer subscribes
 * here and fans messages out to connected clients. For horizontal scale, back
 * this with Postgres LISTEN/NOTIFY or a broker — the publish/subscribe surface
 * stays the same.
 */
export type ServerMessage =
  | { type: 'weather.update'; event: string; endsAt: string | null; mutationMultiplier: number; bonusTiers: Record<string, number> }
  | { type: 'leaderboard.update'; board: string; top: unknown[]; pool: number; resetsAt: string | null }
  | { type: 'market.new'; listing: unknown }
  | { type: 'market.sold'; listingId: string }
  | { type: 'claim.settled'; claimId: string; signature: string }
  | { type: 'nft.minted'; nftId: string; assetId: string };

const BROADCAST = 'broadcast';
const playerTopic = (playerId: string) => `player:${playerId}`;

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

/** Broadcast to every connected client. */
export function publishBroadcast(message: ServerMessage): void {
  emitter.emit(BROADCAST, message);
}

/** Send to a single player's connections. */
export function publishToPlayer(playerId: string, message: ServerMessage): void {
  emitter.emit(playerTopic(playerId), message);
}

export function onBroadcast(handler: (m: ServerMessage) => void): () => void {
  emitter.on(BROADCAST, handler);
  return () => emitter.off(BROADCAST, handler);
}

export function onPlayer(playerId: string, handler: (m: ServerMessage) => void): () => void {
  const topic = playerTopic(playerId);
  emitter.on(topic, handler);
  return () => emitter.off(topic, handler);
}
