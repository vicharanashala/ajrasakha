FROM node:22-alpine AS builder

RUN apk add --no-cache git bash
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate && npm install -g rimraf

WORKDIR /app

COPY backend/package.json backend/pnpm-lock.yaml* ./
COPY backend/scripts ./scripts
COPY testers-dashboard/backend /testers-dashboard/backend
RUN pnpm install

COPY backend/ .
RUN pnpm run build

FROM node:22-alpine

RUN apk add --no-cache dumb-init wget curl

WORKDIR /app

COPY backend/package.json ./
COPY backend/scripts ./scripts

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
RUN mkdir -p /app/data/testers-dashboard

COPY --from=builder /testers-dashboard/backend/build /testers-dashboard/backend/build
COPY --from=builder /testers-dashboard/backend/package.json /testers-dashboard/backend/package.json
RUN ln -s /app/node_modules /testers-dashboard/backend/node_modules

# Tailscale Setup

COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscaled /app/tailscaled
COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscale /app/tailscale
RUN mkdir -p /var/run/tailscale /var/cache/tailscale /var/lib/tailscale

# Cloud Run will automatically handles port binding (TODO: remove this after cloud run deployment)
# EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:${APP_PORT}/health || exit 1

CMD ["sh", "/app/scripts/start.sh"]
