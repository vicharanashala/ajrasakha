FROM node:22-alpine AS builder

RUN apk add --no-cache git bash \
  && corepack enable \
  && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install

COPY . .
RUN rm -rf build tsconfig.tsbuildinfo && pnpm exec tsc

FROM node:22-alpine

RUN apk add --no-cache git bash mongodb-tools wget \
  && corepack enable \
  && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
ENV APP_PORT=4001

EXPOSE 4001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider "http://127.0.0.1:${APP_PORT:-4001}/health" || exit 1

CMD ["node", "build/index.js"]
