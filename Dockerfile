# ==========================================
# 本地预编译模式：不在此镜像内编译，直接 COPY 本地产物
# 前置：在宿主机执行 pnpm install && pnpm run build
# ==========================================
FROM node:22-alpine

WORKDIR /app

# Copy pre-built backend artifacts
COPY dist/ ./dist/
COPY node_modules/ ./node_modules/
COPY package.json ./

# Copy runtime assets
COPY prompts/ ./prompts/
COPY knowledge/ ./knowledge/
COPY contrib/ ./contrib/
COPY settings.json ./

# Create sessions directory
RUN mkdir -p sessions

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/server/main.js"]