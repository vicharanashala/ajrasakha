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


# -------------------------
# Frontend build: used only by the app-with-frontend target, where the backend serves the
# app on its own port. Same steps as frontend/Dockerfile and the frontend workflows.
# -------------------------
FROM node:22-alpine AS frontend-builder

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /repo/frontend

# The frontend imports shared code from ../testers-dashboard/frontend/src; its postinstall
# script links that folder's node_modules to the frontend's, so both must exist before install.
COPY frontend/package.json frontend/pnpm-lock.yaml ./
COPY frontend/scripts ./scripts
COPY testers-dashboard/frontend /repo/testers-dashboard/frontend
RUN pnpm install --frozen-lockfile

COPY frontend/ ./

# Same origin: the backend serves the app and /api on one port, so the API base is relative.
ARG VITE_API_BASE_URL=/api
ARG VITE_ENABLE_MOCKS=false
ARG VITE_ENABLE_FIREBASE_LOGIN=true
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_MEASUREMENT_ID
ARG VITE_SARVAM_API_KEY
ARG VITE_VAPID_PUBLIC_KEY
ARG VITE_CARTO_API_KEY
ARG VITE_FESTIVE_THEME=auto

# index.html loads /runtime-config.js; an empty one keeps the values built in above.
RUN pnpm exec vite build \
  && echo 'window.__RUNTIME_CONFIG__ = {};' > dist/runtime-config.js


FROM node:22-alpine AS app

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


# -------------------------
# Backend + frontend on the same port. Selected with `target: app-with-frontend` by
# backend-deployment.yml and backend-staging-deployment.yml.
# index.ts serves ../../frontend/dist relative to /app/build, which is /frontend/dist.
# -------------------------
FROM app AS app-with-frontend
COPY --from=frontend-builder /repo/frontend/dist /frontend/dist


# Default target stays backend-only: the Docker Compose / Docker Hub images serve the
# frontend from their own nginx container, so they skip the frontend build entirely.
FROM app