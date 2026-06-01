# ==========================================
# Stage 1: Builder
# ==========================================
FROM node:22-alpine AS builder

ARG NEXT_PUBLIC_API_BASE
ARG NEXT_PUBLIC_O11Y_BASE

ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE}
ENV NEXT_PUBLIC_O11Y_BASE=${NEXT_PUBLIC_O11Y_BASE}

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

# ==========================================
# Stage 2: Runner
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3001

CMD ["node", "server.js"]
