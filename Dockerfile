# ==========================================
# Stage 1: Builder
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config and package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY .npmrc ./
COPY frontend/package.json ./frontend/

# Install dependencies
RUN pnpm install --no-frozen-lockfile --shamefully-hoist

# Copy source code
COPY src/ ./src/
COPY prompts/ ./prompts/
COPY knowledge/ ./knowledge/
COPY contrib/ ./contrib/
COPY settings.json ./

# Build TypeScript
RUN pnpm run build

# ==========================================
# Stage 2: Runner
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

# Copy built artifacts and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy runtime assets
COPY --from=builder /app/prompts ./prompts
COPY --from=builder /app/knowledge ./knowledge
COPY --from=builder /app/contrib ./contrib
COPY --from=builder /app/settings.json ./

# Create sessions directory
RUN mkdir -p sessions

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/server/main.js"]