# Bloom Garden — Backend

Authoritative game server for **Bloom Garden** (the Next.js + PixiJS idle game in
`../defi-game`). Built with **Express 5 + TypeScript + Prisma + Supabase (Postgres)**,
Postgres-only infra (pg-boss for jobs, in-process pub/sub for WebSocket), and a
Solana (`web3.js`) settlement layer added in Phase 11.

> **The one principle:** the server is authoritative. Every value action is an
> *intent* the client requests; the server re-validates state/time/level/balance
> from the DB, rolls mutation RNG itself, writes an **append-only ledger** in one
> transaction, and returns the result. See `../defi-game/docs/backend/`.

## Stack

| Concern | Choice |
|---|---|
| API | Express 5, TypeScript (strict, ESM), `tsx` runtime |
| DB / ORM | Prisma → Supabase Postgres (append-only ledger) |
| Validation | zod |
| Auth | JWT (access + refresh), Sign-In-With-Solana (ed25519), guest mode |
| Security | helmet, cors, hpp, express-rate-limit, idempotency keys |
| Jobs / schedule | pg-boss (Postgres) — weather, leaderboard, reconcile, chain |
| Realtime | `ws` + in-process pub/sub |
| Chain (Phase 11) | `@solana/web3.js`, SPL token, Metaplex Bubblegum (cNFTs) |
| Tests | vitest + supertest |

## Setup

```bash
npm install
cp .env.example .env          # then fill in DATABASE_URL / DIRECT_URL
npm run prisma:generate
npm run prisma:migrate        # needs a reachable DB (see below)
npm run dev                   # http://localhost:4000/health
```

### Supabase connection strings

Use the **Connection Pooler** (PgBouncer, port `6543`) for the app and the
**direct** connection (port `5432`) for migrations + pg-boss:

```env
DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

`pg-boss` requires a session connection (LISTEN/NOTIFY, advisory locks) and so
uses `DIRECT_URL`. Set `DEV_TIME_SCALE=360` in dev (1h growth → 10s); `1` in prod.

> **Pooler note:** this app uses the **session pooler (5432)** for `DATABASE_URL`,
> not the transaction pooler (6543). A persistent server doing interactive
> transactions + `SELECT FOR UPDATE` needs session semantics; the transaction
> pooler is for serverless/edge and breaks Prisma interactive transactions.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Run with watch (tsx) |
| `npm run build` / `npm run typecheck` | Type-check (no emit) |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm test` | Unit tests (game logic + health). DB tests gated by `RUN_DB_TESTS` |
| `npm run prisma:migrate` | Create/apply a dev migration |
| `npm run prisma:deploy` | Apply migrations in prod/CI |
| `npm run db:seed` | Optional dev seed |

### Running DB-backed integration tests

```bash
export RUN_DB_TESTS=1
export DATABASE_URL=...     # a DISPOSABLE test database
export DIRECT_URL=...
npm run prisma:deploy
npm test
```

## API surface (see `docs/backend/04`)

```
GET  /health
# Auth
GET  /auth/challenge?pubkey=   POST /auth/verify   POST /auth/guest
POST /auth/bind                POST /auth/refresh
# Player / economy
GET  /me        GET /me/ledger?cursor=     GET /economy/stats
# Garden (Idempotency-Key required)
POST /garden/plant  /water  /harvest  /sprinkler  /expand
# Shop
GET  /shop/catalog            POST /shop/buy
# Marketplace
GET  /market/listings   POST /market/listings   POST /market/listings/:id/buy
DELETE /market/listings/:id   GET /market/history?me=true
# Leaderboard / NFTs / wallet
GET  /leaderboard?board=harvestValue|mutationHunter
GET  /nfts   GET /nfts/:id
POST /wallet/claim   GET /wallet/claim/:id
# WebSocket: ws://host/ws?token=<accessJWT>
#   weather.update · leaderboard.update · market.new/sold · claim.settled · nft.minted
```

**Conventions:** `Authorization: Bearer <jwt>` on everything except `/auth/*`;
every value-bearing `POST` requires an `Idempotency-Key` header; errors are
`{ error: { code, message } }`.

## Architecture

```
src/
  game/        Authoritative canonical logic (crops, mutations, economy, …) — the
               server's source of truth. Mirrors docs §03; guarded by a snapshot test.
  lib/         ledger, idempotency, jwt, siws, errors, rng, logger
  middleware/  auth, validate (zod), rateLimit, idempotencyKey, errorHandler
  modules/     auth, player, economy, garden, shop, market, leaderboard, wallet, nft
  services/    harvest (gacha), garden state, weather, leaderboard, player, reconcile
  realtime/    ws server + pub/sub
  jobs/        pg-boss queue
  workers/     chain worker (claim/cNFT)
```

### Money & integrity invariants

- `balance = SUM(ledger.amount)` — never a mutable column.
- Every value action = one Prisma transaction (garden + ledger + treasury +
  idempotency record), with the garden row locked `FOR UPDATE`.
- `unique(player, idempotencyKey)` + a stored response make retries return the
  identical result (e.g. the same harvest roll) without double-applying.
- Economy stats (`totalBurned`, `rewardPool`, `treasury`) are sums over
  `treasury_ledger`.

## Phase status

Phases 0–11 are implemented; the schema is **migrated to Supabase** and the full
suite (unit + DB integration) passes. **Solana is live and verified on devnet:**

- `$BLOOM` SPL mint: `DF1sxmwpczSkFTDXAtXihtDs2tZD8VLwTg3MgW5AXMxr`
- cNFT Merkle tree: `CnymmD4Ye2dStyqjChstVjrjPVkE2cY4HaH2PPMHh11c`
- Claim → SPL tokens land in the wallet ATA; rare harvests → Bubblegum cNFTs
  (both confirmed on-chain). Move to a paid RPC + commit-reveal RNG before mainnet.
- **Solana (Phase 11)** — chain worker handlers are scaffolded and config-gated;
  the real mint/transfer calls (web3.js + Bubblegum) fill the marked `TODO`s.
  Confirm `@solana/web3.js` v1 vs `@solana/kit` and the supply policy first.
- **RNG** — Level-1 server CSPRNG now; the `Rng` seam is ready for commit-reveal
  (Level 2) before mainnet (docs §06).

## Notes

- `npm audit` flags dev-only tooling (vitest → vite → esbuild dev-server
  advisory). Not in the production path.
