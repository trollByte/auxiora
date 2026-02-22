# syntax=docker/dockerfile:1

# Stage 1: Build
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/ packages/

RUN pnpm install --frozen-lockfile
RUN pnpm -r build

# Stage 2: Extract only package.json manifests (for cacheable prod install)
FROM builder AS manifests

RUN mkdir /manifests && \
    cd /app && \
    find packages -name 'package.json' -not -path '*/node_modules/*' | while read f; do \
      mkdir -p "/manifests/$(dirname "$f")"; \
      cp "$f" "/manifests/$f"; \
    done

# Stage 3: Production
FROM node:22-alpine AS production

ARG VERSION=dev
LABEL org.opencontainers.image.title="Auxiora" \
      org.opencontainers.image.description="Security-first self-hosted AI assistant" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.source="https://github.com/trollbyte/auxiora"

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Create /data with open permissions — the actual UID is set at runtime
# via docker-compose `user:` to match the host user's UID/GID.
RUN mkdir -p /data/config /data/data /data/state /data/.auxiora/workspace && \
    chmod -R 777 /data

WORKDIR /app

# Copy only manifests + lockfile first — this layer caches until deps change
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY --from=manifests /manifests/packages/ packages/

RUN pnpm install --frozen-lockfile --prod

# Now overlay built artifacts (changes every code commit, but install is cached)
COPY --from=builder /app/packages/ packages/

# Strip dev artifacts: source, tests, tsconfig, tsbuildinfo
RUN find packages -type d -name src -exec rm -rf {} + 2>/dev/null; \
    find packages -type d -name tests -exec rm -rf {} + 2>/dev/null; \
    find packages -name 'tsconfig*.json' -delete 2>/dev/null; \
    find packages -name '*.tsbuildinfo' -delete 2>/dev/null; \
    true

ENV NODE_ENV=production
ENV AUXIORA_GATEWAY_HOST=0.0.0.0
ENV AUXIORA_GATEWAY_PORT=18800
# Point all XDG paths and HOME into the /data volume so state persists
ENV HOME=/data
ENV XDG_CONFIG_HOME=/data/config
ENV XDG_DATA_HOME=/data/data
ENV XDG_STATE_HOME=/data/state

EXPOSE 18800

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:18800/health || exit 1

COPY deploy/docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["start"]
