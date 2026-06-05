# ==========================================
# Stage 1: Builder
# ==========================================
FROM node:22-alpine AS builder

ARG NEXT_PUBLIC_API_BASE

ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE}

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config (pnpm needs ALL member package.json files)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY .npmrc ./
COPY frontend/package.json ./frontend/package.json

# Install dependencies with shamefully-hoist for Next.js compatibility
RUN pnpm install --no-frozen-lockfile --shamefully-hoist

# Copy frontend source
COPY frontend/ ./frontend/

# Build
WORKDIR /app/frontend
RUN pnpm run build

# ==========================================
# Stage 2: Runner
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./.next/static
COPY --from=builder /app/frontend/public ./public

EXPOSE 3001

CMD ["node", "server.js"]