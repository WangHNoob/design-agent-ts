FROM node:22-alpine
WORKDIR /app

# Copy pre-built backend
COPY dist/ ./dist/
COPY node_modules/ ./node_modules/
COPY package.json ./

# Copy runtime assets
COPY prompts/ ./prompts/
COPY knowledge/ ./knowledge/
COPY contrib/ ./contrib/
COPY settings.json ./

RUN mkdir -p sessions data/long-term-memory

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/server/main.js"]
