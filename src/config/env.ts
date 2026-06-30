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
    .default('http://localhost:3002,https://defi-game-alpha.vercel.app')
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

  // Dev/testing faucet: mints free $BLOOM straight to a player's wallet,
  // claimable repeatedly. Set FAUCET_ENABLED=false in prod to switch it off
  // without a code change. Treated as enabled unless explicitly 'false'/'0'/''.
  FAUCET_ENABLED: z
    .string()
    .default('true')
    .transform((v) => {
      const s = v.trim().toLowerCase();
      return s !== 'false' && s !== '0' && s !== '';
    }),
  FAUCET_AMOUNT: z.coerce.number().int().positive().default(1000),

  // NFT passive income: held cNFTs accrue $BLOOM over time, claimed on demand.
  // Per-NFT hourly yield = YIELD_BASE_PER_HOUR × the NFT's rarity multiplier
  // (e.g. base 10 × a Diamond's 100 = 1000/hr). Set YIELD_ENABLED=false in prod
  // to switch it off without a code change.
  YIELD_ENABLED: z
    .string()
    .default('true')
    .transform((v) => {
      const s = v.trim().toLowerCase();
      return s !== 'false' && s !== '0' && s !== '';
    }),
  YIELD_BASE_PER_HOUR: z.coerce.number().nonnegative().default(10),
  YIELD_MIN_CLAIM: z.coerce.number().int().nonnegative().default(1),

  // DAS-capable RPC (Helius/Triton) for getAssetsByOwner — used to verify a
  // wallet still holds an NFT before paying yield. The public cluster RPC does
  // NOT support DAS; falls back to SOLANA_RPC_URL/cluster if unset (claims then
  // fail with a clear error until a real DAS endpoint is configured).
  DAS_RPC_URL: z.string().optional(),
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
