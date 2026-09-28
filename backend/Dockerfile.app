FROM node:22-alpine AS builder

RUN apk add --no-cache git bash \
  && corepack enable \
  && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Copy backend package files and scripts
COPY backend/package.json backend/pnpm-lock.yaml ./
COPY backend/scripts ./scripts

# Copy testers-dashboard/backend so postinstall links node_modules and tsc can build it
COPY testers-dashboard/backend /testers-dashboard/backend

RUN pnpm install --frozen-lockfile

# Copy backend source code
COPY backend/ .

# Fresh compile: builds testers-dashboard first, then compiles backend
RUN rm -rf build tsconfig.tsbuildinfo && pnpm run build


FROM node:22-alpine

RUN apk add --no-cache \
    git \
    bash \
    dumb-init \
    wget \
    curl \
    mongodb-tools \
  && corepack enable \
  && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

COPY backend/package.json backend/pnpm-lock.yaml ./
COPY backend/scripts ./scripts

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
RUN mkdir -p /app/data/testers-dashboard

# Testers Dashboard runtime setup:
# 1. Compiled build output at /testers-dashboard/backend/build
# 2. package.json for ES module resolution ("type": "module")
# 3. Symlink /app/node_modules into /testers-dashboard/backend/node_modules so bare imports (inversify, etc.) resolve
COPY --from=builder /testers-dashboard/backend/build /testers-dashboard/backend/build
COPY --from=builder /testers-dashboard/backend/package.json /testers-dashboard/backend/package.json
RUN ln -s /app/node_modules /testers-dashboard/backend/node_modules

# -------------------------
# Tailscale
# -------------------------
COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscaled /app/tailscaled
COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscale /app/tailscale

RUN mkdir -p \
    /var/run/tailscale \
    /var/cache/tailscale \
    /var/lib/tailscale

# -------------------------
# Environment
# -------------------------
ENV NODE_ENV=production
ENV APP_PORT=4000

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider "http://127.0.0.1:${APP_PORT:-4000}/health" || exit 1

CMD ["sh", "/app/scripts/start.sh"]