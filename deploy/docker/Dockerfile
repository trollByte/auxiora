# syntax=docker/dockerfile:1

# Stage 1: Build
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/ packages/

RUN pnpm install --frozen-lockfile
RUN pnpm -r build

# Stage 2: Production
FROM node:22-alpine AS production

LABEL org.opencontainers.image.title="Auxiora" \
      org.opencontainers.image.description="Security-first self-hosted AI assistant" \
      org.opencontainers.image.version="2.0.0" \
      org.opencontainers.image.source="https://github.com/auxiora/auxiora"

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

RUN addgroup -g 1001 -S auxiora && \
    adduser -S auxiora -u 1001 -G auxiora

WORKDIR /app

# Copy manifests and workspace config for prod dependency install
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY --from=builder /app/packages/ packages/

# Strip dev artifacts: source, tests, tsconfig, tsbuildinfo
RUN find packages -type d -name src -exec rm -rf {} + 2>/dev/null; \
    find packages -type d -name tests -exec rm -rf {} + 2>/dev/null; \
    find packages -name 'tsconfig*.json' -delete 2>/dev/null; \
    find packages -name '*.tsbuildinfo' -delete 2>/dev/null; \
    find packages -type d -name node_modules -exec rm -rf {} + 2>/dev/null; \
    true

RUN pnpm install --frozen-lockfile --prod

USER auxiora

ENV NODE_ENV=production
ENV AUXIORA_GATEWAY_HOST=0.0.0.0
ENV AUXIORA_GATEWAY_PORT=18800

EXPOSE 18800

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:18800/health || exit 1

ENTRYPOINT ["node", "packages/cli/dist/index.js"]
CMD ["start"]
