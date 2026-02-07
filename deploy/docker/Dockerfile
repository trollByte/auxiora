# Stage 1: Build
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/ packages/

RUN pnpm install --frozen-lockfile
RUN pnpm -r build

# Stage 2: Production
FROM node:22-alpine AS production

RUN corepack enable && corepack prepare pnpm@latest --activate

RUN addgroup -g 1001 -S auxiora && \
    adduser -S auxiora -u 1001 -G auxiora

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ packages/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/*/dist/ packages/

USER auxiora

ENV NODE_ENV=production
ENV AUXIORA_GATEWAY_HOST=0.0.0.0
ENV AUXIORA_GATEWAY_PORT=18800

EXPOSE 18800

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:18800/health || exit 1

ENTRYPOINT ["node", "packages/cli/dist/index.js"]
CMD ["start"]
