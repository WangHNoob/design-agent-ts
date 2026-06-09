# ==========================================
# 本地预编译模式：不在此镜像内编译，直接 COPY 本地产物
# 前置：在宿主机执行 cd frontend && pnpm run build
# ==========================================
FROM node:22-alpine

WORKDIR /app

# Copy pre-built frontend standalone output
COPY frontend/.next/standalone ./
COPY frontend/.next/static ./.next/static
COPY frontend/public ./public

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server.js"]