FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run verify && npm prune --omit=dev

FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    LEARNING_CENTER_MODE=remote \
    LEARNING_CENTER_DATA_DIR=/data \
    LEARNING_CENTER_PORT=4174

WORKDIR /app

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/dist ./dist

RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 4174
VOLUME ["/data"]
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "const token = Buffer.from((process.env.LEARNING_CENTER_USERNAME || 'reader') + ':' + (process.env.LEARNING_CENTER_PASSWORD || '')).toString('base64'); fetch('http://127.0.0.1:4174/api/health', { headers: { Authorization: 'Basic ' + token } }).then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"]

CMD ["node", "server/index.mjs"]
