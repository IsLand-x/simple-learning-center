FROM node:22-bookworm-slim AS production-dependencies

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-audit --no-fund
# Bundle the matching Headless Shell at build time; runtime never downloads a browser.
RUN node --input-type=module -e "import { ensureBrowser } from '@remotion/renderer'; await ensureBrowser({ logLevel: 'error' });"

FROM node:22-bookworm-slim AS build

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

FROM node:22-bookworm-slim AS runtime-base

LABEL org.opencontainers.image.source="https://github.com/IsLand-x/simple-learning-center" \
    org.opencontainers.image.description="Local-first EPUB reader and AI learning center"

ENV NODE_ENV=production \
    LEARNING_CENTER_MODE=remote \
    LEARNING_CENTER_DATA_DIR=/data \
    LEARNING_CENTER_PORT=4174

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates ffmpeg fonts-noto-cjk util-linux \
      libnss3 libdbus-1-3 libatk1.0-0 libgbm1 libasound2 libxrandr2 \
      libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 \
      libpango-1.0-0 libcairo2 libcups2 \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data && chown node:node /data

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
