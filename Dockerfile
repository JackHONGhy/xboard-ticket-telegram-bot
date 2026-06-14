FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY README.md ./

ENV NODE_ENV=production
ENV BOT_PORT=3000
ENV DATABASE_PATH=/data/ticket-bot.sqlite

RUN mkdir -p /data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${BOT_PORT}/healthz || exit 1

CMD ["npm", "start"]
