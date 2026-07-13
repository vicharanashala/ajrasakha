FROM node:20-alpine AS builder

RUN apk add --no-cache git bash \
  && corepack enable \
  && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile

COPY . .
# Fresh compile in image (host tsbuildinfo/build are dockerignored; stale incremental can skip emit)
RUN rm -rf build tsconfig.tsbuildinfo && pnpm exec tsc
# Copy static data files to build directory
RUN cp src/modules/soilHealth/soilData.json build/modules/soilHealth/soilData.json 2>/dev/null || true

FROM node:20-alpine

RUN apk add --no-cache git bash mongodb-tools wget \
  && corepack enable \
  && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY scripts ./scripts
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
ENV APP_PORT=4000

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider "http://127.0.0.1:${APP_PORT:-4000}/health" || exit 1

CMD ["node", "build/index.js"]
