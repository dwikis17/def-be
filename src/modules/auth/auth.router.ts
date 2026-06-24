import { Router } from 'express';
import { z } from 'zod';
import { validate, validated } from '../../middleware/validate.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import * as auth from './auth.service.js';

export const authRouter: Router = Router();

authRouter.use(authLimiter);

const challengeQuery = z.object({ pubkey: z.string().min(32).max(64) });
authRouter.get('/challenge', validate({ query: challengeQuery }), async (req, res) => {
  const { query } = validated<unknown, z.infer<typeof challengeQuery>>(req);
  res.json(await auth.createChallenge(query!.pubkey));
});

const verifyBody = z.object({ pubkey: z.string().min(32).max(64), signature: z.string().min(1) });
authRouter.post('/verify', validate({ body: verifyBody }), async (req, res) => {
  const { body } = validated<z.infer<typeof verifyBody>>(req);
  res.json(await auth.verifyAndLogin(body!.pubkey, body!.signature));
});

const refreshBody = z.object({ refresh: z.string().min(1) });
authRouter.post('/refresh', validate({ body: refreshBody }), async (req, res) => {
  const { body } = validated<z.infer<typeof refreshBody>>(req);
  res.json(await auth.refresh(body!.refresh));
});
