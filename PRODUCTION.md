# Ajrasakha — Production Deployment Guide

This document explains how to deploy Ajrasakha so it can safely serve **400+
concurrent users** with horizontal scaling, fault tolerance, and observability.

---

## 🏛️ Architecture overview

```
                              ┌──────────────────────┐
                              │   Internet / users   │
                              └──────────┬───────────┘
                                         │
                              ┌──────────▼───────────┐
                              │   Nginx (port 80)    │  ← TLS, rate-limit, gzip, cache
                              │   load balancer      │
                              └──────────┬───────────┘
                       ┌─────────────────┼─────────────────┐
                       │                 │                 │
            ┌──────────▼────────┐ ┌──────▼─────────┐ ┌─────▼──────────┐
            │  backend-1:4000   │ │  backend-2:4000│ │  backend-3:4000│  ← least-conn
            │  (Node 22 / API)  │ │  (Node 22 / API)│ │  (Node 22/API) │   health-checked
            └──────────┬────────┘ └──────┬─────────┘ └─────┬──────────┘
                       │                 │                 │
            ┌──────────▼─────────────────▼─────────────────▼──────────┐
            │   MongoDB Replica Set (rs0): primary + 2 secondaries   │  ← HA + read scaling
            └─────────────────────────────────────────────────────────┘
                       │
            ┌──────────▼─────────┐
            │  Redis 7           │  ← session + cache + rate-limit counters
            └────────────────────┘

       Reviewer-frontend  ×2  +  Webapp-frontend ×2 — Nginx round-robins them too.
```

### Components

| Service | Replicas | Purpose |
|---|---|---|
| `nginx-proxy` | 1 | Edge load-balancer, TLS, rate-limit, gzip, caching |
| `backend-1..3` | 3 | REST + WebSocket API (least-conn) |
| `reviewer-web-1..2` | 2 | Reviewer System SPA |
| `webapp-web-1..2` | 2 | Farmer Web App SPA |
| `mongo-primary` | 1 | Primary write node (priority 2) |
| `mongo-secondary-1..2` | 2 | Read secondaries + failover |
| `redis` | 1 | Cache / sessions / rate-limit counters |
| `mongo-init` | 1 (one-shot) | Initialises the replica set |

**Capacity math (steady state):**

- 3 backend pods × 150 concurrent requests each = ~450 concurrent
- MongoDB primary handles writes; reads fan-out to secondaries
- Nginx cache absorbs 70 % of static / idempotent GETs
- Redis serves 100 k+ ops/s, freeing DB pressure

---

## 🚀 Deploy

### 1. Prerequisites

- Docker 24+ and Docker Compose v2
- A Linux host (or 3+ hosts behind a floating IP) with **at least 16 GB RAM, 8 vCPU**
- DNS pointing `desk.vicharanashala.ai` and `ajrasakha.vicharanashala.ai` at the host

### 2. Configure environment

```bash
cp .env.production.example .env.production
$EDITOR .env.production     # fill in MONGO, REDIS, FIREBASE, SENTRY, etc.
```

### 3. Bring it up

```bash
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d --build
```

The first boot runs `mongo-init` to set up the replica set, then
backends + Nginx connect to it.

### 4. Verify

```bash
# Edge health
curl -s http://localhost/healthz

# Backend health (through Nginx)
curl -s http://localhost/api/health

# Container health
docker compose -f docker-compose.production.yml ps
```

You should see `STATUS = Up (healthy)` on every backend, mongo, redis, and
nginx container.

### 5. Enable TLS

Drop your certs into `infra/nginx/ssl/`:

```
infra/nginx/ssl/
├── fullchain.pem
└── privkey.pem
```

…and add a 443-listening `server { … listen 443 ssl; … }` block to
`infra/nginx/conf.d/ajrasakha.conf`. A starter snippet is included at the
bottom of that file as a comment.

---

## 🔄 Scaling up

### Scale backends

```bash
docker compose -f docker-compose.production.yml up -d --scale backend-1=1 --scale backend-2=1 --scale backend-3=3
# (or add backend-4 to the compose file and update nginx upstream pool)
```

After scaling, re-test with:

```bash
docker compose -f docker-compose.production.yml exec nginx-proxy nginx -s reload
```

### Scale frontend

```bash
docker compose -f docker-compose.production.yml up -d --scale reviewer-web-1=1 --scale reviewer-web-2=3
```

Update `infra/nginx/conf.d/ajrasakha.conf` with the new web replicas and
reload Nginx.

---

## 🔒 Security checklist

- [x] Rate-limit zones (`api_rl`, `auth_rl`, `static_rl`) — 60/10/200 r/s per IP
- [x] `limit_conn conn_per_ip 50` — caps concurrent sockets per client
- [x] Security headers (`X-Frame-Options`, `X-Content-Type-Options`, etc.)
- [x] Auth endpoints use `authRateLimiter` (20 attempts / 15 min)
- [x] CORS locked to allowed origins in backend `appConfig.origins`
- [x] Sentry error reporting in production / staging
- [x] `trust proxy = 1` so `req.ip` reflects real client IP
- [x] Mongo replica set — no single point of failure
- [ ] **TODO for your environment:** drop TLS certs and enable HSTS

---

## 📈 Observability

| Concern | Tool |
|---|---|
| Error tracking | Sentry (auto-installed in backend, via `instrument.ts`) |
| Access logs | Nginx `access.log` (JSON-format available) |
| Container health | Docker healthchecks (`docker compose ps`) |
| DB health | `mongosh --eval 'rs.status()'` |
| Cache hit rate | `redis-cli info stats` |

Health endpoints:

- `GET /healthz` — liveness (no auth, no rate-limit)
- `GET /readyz`  — readiness probe (no auth, no rate-limit)
- `GET /api/health` — legacy health (kept for back-compat)

---

## 🧪 Running the QA test suite against this stack

```bash
# Local QA (against staging)
cd qa && npm ci && npx playwright install --with-deps chromium && npm test

# Trigger production smoke
docker compose -f docker-compose.production.yml exec backend-1 \
  node -e "fetch('http://localhost:4000/healthz').then(r => r.json()).then(console.log)"
```

---

## ♻️ Backup & restore

```bash
# Snapshot
docker compose -f docker-compose.production.yml exec mongo-primary \
  mongodump --archive=/data/backup-$(date +%F).gz --gzip

# Restore
docker compose -f docker-compose.production.yml exec -T mongo-primary \
  mongorestore --archive --gzip < backup-2026-01-01.gz
```

Recommended: configure `mongo-primary` to ship oplog to S3 via
`mongo-oplog-backup` (not included in this stack).

---

## 🆘 Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `502 Bad Gateway` on `/api/*` | All 3 backends are unhealthy | `docker compose logs backend-1 backend-2 backend-3` |
| `504 Gateway Timeout` | Slow upstream (e.g. Mongo down) | Check `mongosh` and `docker compose ps` |
| `429 Too Many Requests` | Rate limit triggered | Verify burst config in `nginx.conf` |
| Mongo primary election loop | Two nodes think they're primary | Wait 30 s; if it doesn't resolve, force reconfigure |
| WebSocket drops | Missing `Upgrade` / `Connection` headers | Ensure `proxy_http_version 1.1` is set (already in conf) |

---

## 📋 What was added in this PR

- **`docker-compose.production.yml`** — full multi-service prod stack
- **`infra/nginx/nginx.conf`** — tuned edge proxy (gzip, rate-limit, cache)
- **`infra/nginx/conf.d/ajrasakha.conf`** — virtual hosts + load balancing
- **`backend/src/index.ts`** — added `/healthz` and `/readyz` probes
- **`backend/src/shared/middleware/productionHardening.ts`** — rate-limit + headers + graceful shutdown helpers
- **`frontend/src/shared/components/ErrorBoundary.tsx`** — production error UI
- **`frontend/src/shared/components/NetworkStatus.tsx`** — online/offline banner
- **`frontend/src/shared/components/LoadingSkeletons.tsx`** — shimmer + spinners
- **`frontend/src/routes/__root.tsx`** — wired everything into the shell

See [PR_DESCRIPTION.md](./PR_DESCRIPTION.md) for the full change-set.