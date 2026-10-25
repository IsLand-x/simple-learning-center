FROM node:22-alpine AS production-dependencies

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-audit --no-fund

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG APP_BUILD_REVISION=local
ARG APP_UPDATED_AT
ARG LEARNING_CENTER_ASSET_ORIGIN
ENV APP_BUILD_REVISION=$APP_BUILD_REVISION \
    APP_UPDATED_AT=$APP_UPDATED_AT \
    LEARNING_CENTER_ASSET_ORIGIN=$LEARNING_CENTER_ASSET_ORIGIN
RUN npm run verify

FROM node:22-alpine AS runtime-base

LABEL org.opencontainers.image.source="https://github.com/IsLand-x/simple-learning-center" \
    org.opencontainers.image.description="Local-first EPUB reader and AI learning center"

ENV NODE_ENV=production \
    LEARNING_CENTER_MODE=remote \
    LEARNING_CENTER_DATA_DIR=/data \
    LEARNING_CENTER_PORT=4174

WORKDIR /app

RUN apk add --no-cache font-noto-cjk && mkdir -p /data && chown node:node /data

USER node
EXPOSE 4174
VOLUME ["/data"]
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4174/api/auth/session').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"]

CMD ["node", "server-dist/index.js"]

# Production CI has already checked and built this exact commit. Keep dependencies
# and fonts independent of application files so small releases only transfer code.
FROM runtime-base AS verified-runtime

COPY --from=production-dependencies --chown=node:node /app/package.json ./package.json
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
ADD --chown=node:node release-bundle.tar ./

# Default source/Compose/explicit preview builds still run the full verification.
FROM runtime-base AS runtime

COPY --from=production-dependencies --chown=node:node /app/package.json ./package.json
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server-dist ./server-dist
COPY --from=build --chown=node:node /app/dist ./dist
