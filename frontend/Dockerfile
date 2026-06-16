FROM node:22-alpine
WORKDIR /app

# Use China npm mirror
RUN npm config set registry https://registry.npmmirror.com

# Step 1: Copy workspace files for pnpm install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY frontend/package.json ./frontend/

# Install dependencies
RUN corepack enable && pnpm install --no-frozen-lockfile

# Step 2: Copy frontend source
COPY frontend/app/ ./frontend/app/
COPY frontend/components/ ./frontend/components/
COPY frontend/lib/ ./frontend/lib/
COPY frontend/public/ ./frontend/public/
COPY frontend/next.config.js ./frontend/next.config.js
COPY frontend/tsconfig.json ./frontend/tsconfig.json
COPY frontend/tailwind.config.ts ./frontend/tailwind.config.ts
COPY frontend/postcss.config.js ./frontend/postcss.config.js
COPY frontend/package.json ./frontend/package.json

# Copy root tsconfig (needed for Next.js build)
COPY tsconfig.json ./tsconfig.json

# Step 3: Build Next.js inside Docker (Linux paths)
ARG NEXT_PUBLIC_API_BASE=http://localhost:13000
ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE}
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd frontend && npx next build

# Copy static files into standalone directory (required for production)
RUN cp -r ./frontend/.next/static ./frontend/.next/standalone/frontend/.next/static

ENV NODE_ENV=production
ENV PORT=3001
ENV API_BASE_URL=http://backend:3000

EXPOSE 3001

WORKDIR /app/frontend
CMD ["node", ".next/standalone/frontend/server.js"]
