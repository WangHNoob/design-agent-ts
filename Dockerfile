# ==========================================
# Stage 1: Builder
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json tsconfig.json ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Copy source code
COPY src/ ./src/
COPY prompts/ ./prompts/
COPY knowledge/ ./knowledge/
COPY settings.json ./

# Build TypeScript
RUN npm run build

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
COPY --from=builder /app/settings.json ./

# Create sessions directory
RUN mkdir -p sessions

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/server/main.js"]
