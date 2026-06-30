# syntax=docker/dockerfile:1

FROM node:20-slim AS base
WORKDIR /app
# OpenSSL is required by Prisma at runtime
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# --- Dependencies (with dev deps for prisma generate) ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate

# --- Runtime ---
FROM base AS runner
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 4000
CMD ["npm", "run", "start"]
