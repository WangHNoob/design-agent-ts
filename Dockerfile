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
# Default empty settings; docker-compose bind-mounts host ./settings.json over this
# so UI-saved LLM keys survive image rebuilds.
COPY settings.example.json ./settings.json

RUN mkdir -p sessions data/long-term-memory

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/server/main.js"]
