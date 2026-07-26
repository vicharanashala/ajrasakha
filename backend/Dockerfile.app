FROM node:22-alpine AS builder

RUN apk add --no-cache git bash \
  && corepack enable \
  && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile

COPY . .

# Fresh compile
RUN rm -rf build tsconfig.tsbuildinfo && pnpm exec tsc


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

COPY package.json pnpm-lock.yaml ./
COPY scripts ./scripts

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules

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