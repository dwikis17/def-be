import 'dotenv/config';
import { z } from 'zod';

/**
 * Single, zod-validated view of process.env. Import `env` everywhere instead of
 * touching process.env directly so misconfiguration fails fast at boot.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be >= 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be >= 16 chars'),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000),
  AUTH_NONCE_TTL: z.coerce.number().int().positive().default(300),

  DEV_TIME_SCALE: z.coerce.number().positive().default(1),

  // Public base URL of this server — used to build cNFT metadata URIs.
  PUBLIC_BASE_URL: z.string().default('http://localhost:4000'),

  SOLANA_CLUSTER: z.enum(['devnet', 'testnet', 'mainnet-beta']).default('devnet'),
  SOLANA_RPC_URL: z.string().optional(),
  BLOOM_MINT_ADDRESS: z.string().optional(),
  TREASURY_KEYPAIR: z.string().optional(),
  MERKLE_TREE_ADDRESS: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast with a readable message; never boot with bad config.
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
