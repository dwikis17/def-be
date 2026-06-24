import './lib/bigint.js'; // install BigInt JSON serializer (side-effect import)
import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import hpp from 'hpp';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { registerRoutes } from './routes.js';

/**
 * Build the Express app. Exported (without listening) so integration tests can
 * drive it with supertest.
 */
export function createApp(): Express {
  const app = express();

  // Behind a proxy/load balancer (Vercel/Render/etc.) — trust X-Forwarded-* for
  // correct client IPs (rate limiting) and protocol.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    }),
  );
  app.use(express.json({ limit: '64kb' }));
  app.use(hpp());
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'bloom-garden-backend', ts: new Date().toISOString() });
  });

  registerRoutes(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
