FROM node:22-alpine
WORKDIR /app

# Use China npm mirror
RUN npm config set registry https://registry.npmmirror.com

# Step 1: Copy workspace files for pnpm install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY frontend/package.json ./frontend/

# Install dependencies (creates proper Linux symlinks)
RUN corepack enable && pnpm install --no-frozen-lockfile

# Step 2: Copy frontend source (excluding node_modules via .dockerignore)
COPY frontend/app/ ./frontend/app/
COPY frontend/components/ ./frontend/components/
COPY frontend/lib/ ./frontend/lib/
COPY frontend/public/ ./frontend/public/
COPY frontend/next.config.js ./frontend/next.config.js
COPY frontend/tsconfig.json ./frontend/tsconfig.json
COPY frontend/tailwind.config.ts ./frontend/tailwind.config.ts
COPY frontend/postcss.config.js ./frontend/postcss.config.js
COPY frontend/package.json ./frontend/package.json

# Copy pre-built .next from local build
COPY frontend/.next/ ./frontend/.next/

ENV NODE_ENV=production
ENV PORT=3001
ENV API_BASE_URL=http://backend:3000

EXPOSE 3001

WORKDIR /app/frontend
CMD ["npx", "next", "start", "--port", "3001"]
