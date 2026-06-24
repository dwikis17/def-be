import type { Server as HttpServer, IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyAccessToken } from '../lib/jwt.js';
import { logger } from '../lib/logger.js';
import { onBroadcast, onPlayer, type ServerMessage } from './pubsub.js';

/**
 * Attach the WebSocket server (docs §04). Clients connect to
 * `ws://host/ws?token=<accessJWT>`; we authenticate on connect, then push
 * broadcast topics (weather/leaderboard/market) plus that player's private
 * topics (claim.settled / nft.minted).
 */
export function attachWebSocketServer(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    let playerId: string;
    try {
      const url = new URL(request.url ?? '', 'http://localhost');
      const token = url.searchParams.get('token');
      if (!token) throw new Error('missing token');
      playerId = verifyAccessToken(token).sub;
    } catch (err) {
      logger.debug({ err }, 'ws auth rejected');
      ws.close(1008, 'unauthorized');
      return;
    }

    const send = (m: ServerMessage | { type: string; [k: string]: unknown }) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
    };
    const offBroadcast = onBroadcast(send);
    const offPlayer = onPlayer(playerId, send);

    send({ type: 'connected', playerId });

    ws.on('close', () => {
      offBroadcast();
      offPlayer();
    });
    ws.on('error', (err) => logger.warn({ err }, 'ws client error'));
  });

  logger.info('WebSocket server attached at /ws');
  return wss;
}
