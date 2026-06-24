/**
 * Domain error codes surfaced to clients. Error shape is always
 * `{ error: { code, message } }` (docs §04).
 */
export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INSUFFICIENT_BALANCE'
  | 'NOT_UNLOCKED'
  | 'NOT_READY'
  | 'PLOT_OCCUPIED'
  | 'PLOT_EMPTY'
  | 'LISTING_GONE'
  | 'NOT_OWNER'
  | 'IDEMPOTENCY_REQUIRED'
  | 'INVALID_SIGNATURE'
  | 'NONCE_EXPIRED'
  | 'CHAIN_NOT_CONFIGURED'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  IDEMPOTENCY_REQUIRED: 400,
  INVALID_SIGNATURE: 400,
  NONCE_EXPIRED: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_OWNER: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  NOT_READY: 409,
  PLOT_OCCUPIED: 409,
  PLOT_EMPTY: 409,
  LISTING_GONE: 409,
  INSUFFICIENT_BALANCE: 409,
  NOT_UNLOCKED: 409,
  RATE_LIMITED: 429,
  CHAIN_NOT_CONFIGURED: 503,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

/** Convenience constructors for the most common cases. */
export const Err = {
  validation: (msg = 'Invalid request', details?: unknown) =>
    new AppError('VALIDATION', msg, details),
  unauthorized: (msg = 'Authentication required') => new AppError('UNAUTHORIZED', msg),
  forbidden: (msg = 'Forbidden') => new AppError('FORBIDDEN', msg),
  notFound: (msg = 'Not found') => new AppError('NOT_FOUND', msg),
  conflict: (msg = 'Conflict') => new AppError('CONFLICT', msg),
  insufficientBalance: (msg = 'Insufficient $BLOOM balance') =>
    new AppError('INSUFFICIENT_BALANCE', msg),
  notUnlocked: (msg = 'Not unlocked at your level') => new AppError('NOT_UNLOCKED', msg),
  notReady: (msg = 'Not ready') => new AppError('NOT_READY', msg),
};
