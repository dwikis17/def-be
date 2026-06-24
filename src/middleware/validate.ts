import type { RequestHandler } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { AppError } from '../lib/errors.js';

type Schemas = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
};

/**
 * Validate + coerce request parts with zod. Parsed values replace the originals
 * (req.validated) so handlers read typed data. Express 5 makes req.query a
 * getter, so we stash results on req.validated rather than reassigning.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    const out: { body?: unknown; query?: unknown; params?: unknown } = {};
    try {
      if (schemas.body) out.body = schemas.body.parse(req.body);
      if (schemas.query) out.query = schemas.query.parse(req.query);
      if (schemas.params) out.params = schemas.params.parse(req.params);
    } catch (e) {
      if (e instanceof z.ZodError) {
        throw new AppError(
          'VALIDATION',
          'Invalid request',
          e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        );
      }
      throw e;
    }
    (req as unknown as { validated: typeof out }).validated = out;
    next();
  };
}

/** Typed accessor for validated data inside a handler. */
export function validated<B = unknown, Q = unknown, P = unknown>(req: unknown) {
  return (req as { validated?: { body?: B; query?: Q; params?: P } }).validated ?? {};
}
