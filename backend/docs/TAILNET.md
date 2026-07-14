# Tailscale / tailnet networking

How the backend reaches the AI, agent, GDB, WhatsApp, FAQ and POP servers — all of which
live on a Tailscale tailnet at `100.100.108.44` — and what was broken about it.

---

## The core constraint

`tailscaled` runs inside the container with `--tun=userspace-networking`, because Cloud Run
does not allow the privileged `/dev/net/tun` device a normal Tailscale setup needs.

**Userspace networking creates no network interface.** There is no route to `100.x` from
the container. `curl http://100.100.108.44:8031` will hang; so will any library that dials
that address directly.

The *only* way onto the tailnet is the proxy `tailscaled` exposes on `localhost:1055`:

| Protocol | Flag | Used by |
| --- | --- | --- |
| SOCKS5 | `--socks5-server=localhost:1055` | node's `http`/`https` agents → **axios**, **http-proxy-middleware** |
| HTTP CONNECT | `--outbound-http-proxy-listen=localhost:1055` | **undici** → `fetch` |

Both listen on the same port; `tailscaled` distinguishes them by protocol.

Everything below exists because the app was **not using that proxy at all**.

---

## Bug 1 — a debug `curl` was killing the container

`scripts/start.sh` ran, under `set -e`:

```sh
curl -v http://100.100.108.44:2026/threads/test/state
```

That request can never succeed (see the constraint above). It exited non-zero, `set -e`
aborted the script, and the final line — `exec dumb-init node build/index.js` — was never
reached. Node never started, nothing listened on `$PORT`, and Cloud Run reported:

```
ERROR: (gcloud.run.deploy) The user-provided container failed to start and listen on
the port defined provided by the PORT=8080 environment variable...
```

which looks like a port misconfiguration and is not. (`appConfig.port` resolves
`PORT || APP_PORT || 8080`, so Cloud Run's injected `PORT` was always correct.)

### Fix — `scripts/start.sh`

Tailscale is now **advisory, never fatal**. The HTTP server has no dependency on the
tailnet, so a Tailscale failure must degrade the AI calls, not black out the whole service.

- Missing `TAILSCALE_AUTHKEY` → warn, skip, boot anyway.
- `tailscale up` fails → warn, boot anyway.
- The fatal `curl` / `ping` debug probes are gone.
- `sleep 5` replaced by polling `tailscale status` (up to 30s).
- `--state=mem:` added — Cloud Run instances are ephemeral, so an on-disk state directory
  only ever holds a stale identity from a dead container.
- `--hostname` is overridable via `TAILSCALE_HOSTNAME`, so staging and prod don't both
  register as `gcp`.

---

## Bug 2 — nothing was using the proxy

`socks-proxy-agent` was in `package.json` and `aiConfig.proxyAddress` was defined as
`socks5h://localhost:1055` — but **neither was imported anywhere**. `git log -S SocksProxyAgent`
confirms it was never wired up.

So every call to the tailnet dialed an unroutable address:

- `AiService`, `AnswerService` → global `fetch`
- `ChatbotService`, `WhatsAppService`, `QuestionService`, `AccAgentService` → `axios`

Symptoms: `{"name":"Error","message":"No matching WhatsApp message found"}`, AI answers
never generating, requests hanging.

### Fix — `src/bootstrap/tailnetProxy.ts` (new)

One bootstrap patches both clients globally, keyed on the **destination host**, not the
calling file:

```ts
installTailnetProxy();   // called early in src/index.ts
```

- **axios** — a request interceptor attaches a `SocksProxyAgent` when the target host is in
  `100.64.0.0/10` or ends in `.ts.net`.
- **global fetch** — replaced with undici's `fetch`, which accepts a per-request
  `dispatcher` (a `ProxyAgent` pointed at the HTTP proxy). Non-tailnet URLs fall through to
  the native fetch untouched.

> ⚠️ **Gotcha:** node's built-in `fetch` does **not** honour undici's `setGlobalDispatcher`.
> The runtime bundles its own private copy of undici, so the npm package's global dispatcher
> has no effect on it. Replacing `globalThis.fetch` is the way to do this.

**Only tailnet hosts are diverted.** Firebase, LGD, Plivo and Mongo Atlas keep their direct
route, so a Tailscale problem cannot take down unrelated traffic.

This means **no per-service changes are needed**. Any new code that calls
`axios.get('http://100.100.108.44:…')` or `fetch('http://100.100.108.44:…')` is routed
automatically.

Kill switch: `USE_TAILNET_PROXY=false`.

---

## Bug 3 — FAQ / POP hung forever

Two separate faults, one after the other.

### 3a — the frontend never reached the backend

`GET https://ajrasakha-prod.web.app/api/pop/state-table` returned **`200 OK` with the app's
`index.html`**.

`env.popApiUrl()` defaulted to the *relative* path `/api/pop`. That works in dev (Vite
proxies `/api` → `localhost:4000`), but the built app is served by Firebase Hosting, whose
SPA rewrite (`"**" → /index.html`) answers **any** unmatched path with the app shell and a
`200`. The request never reached a backend; the JSON parse got HTML.

**Fix** — `frontend/src/config/env.ts` derives both from the API base URL, like every other
call:

```
VITE_API_BASE_URL = https://reviewer-backend-….run.app/api
  → popApiUrl()   = https://reviewer-backend-….run.app/api/pop
  → faqApiUrl()   = https://reviewer-backend-….run.app/api/faq
```

`VITE_FAQ_API_URL` / `VITE_POP_API_URL` still override when set. Vite bakes these in at
build time, so **the frontend must be rebuilt** for a change to take effect.

### 3b — the backend proxy then hung

With the URL fixed, `/api/faq/app/state-table` spun for minutes with no response.

`FAQ_API_URL=http://100.100.108.44:8031` and `POP_API_URL=http://100.100.108.44:8032` are
tailnet addresses, and `http-proxy-middleware` dials with node's **raw `http` module** — so
the global axios/fetch patches never reached it. It dialed an unroutable address, and with
no timeout configured the socket simply sat open.

**Fix** — `src/index.ts`:

- `tailnetProxy.ts` exports `tailnetAgentFor(url)`, returning a `SocksProxyAgent` when the
  target is on the tailnet and `undefined` otherwise.
- Both proxies get that agent, plus `timeout` / `proxyTimeout` of 30s — so a dead upstream
  returns the existing `502 { error: "faq service unavailable" }` promptly instead of
  hanging.

---

## What still has to be true

None of the above carries a single byte unless `tailscale up` **succeeds**.

1. In the Tailscale admin console, generate an auth key that is **Reusable** *and*
   **Ephemeral**.
   - *Reusable*: every Cloud Run cold start is a new machine. A single-use key authenticates
     the first instance and fails on every one after it.
   - *Ephemeral*: dead instances clean themselves out of the tailnet instead of piling up as
     `gcp-1`, `gcp-2`, …
   - Keys expire (90 days max). An expired key is the most likely cause of a sudden
     regression.
2. Set `TAILSCALE_AUTHKEY` on the Cloud Run service.
   - Production: the workflow pushes it (`.github/workflows/backend-deployment.yml`).
   - Staging: the workflow deliberately pushes **no** app env vars, so it must be set on the
     service itself (Console → Edit & Deploy New Revision → Variables & Secrets).
3. Redeploy.

---

## Verifying

Container stdout goes straight to Cloud Logging.

```bash
gcloud run services logs read reviewer-backend \
  --region=asia-south2 --project=vibe-5b35a --limit=100 | grep -iE "tailscale|tailnet"
```

Or Logs Explorer:

```
resource.type="cloud_run_revision"
resource.labels.service_name="reviewer-backend"
```

These lines only print at **container startup**, so look at a cold start and widen the time
range.

| Log line | Meaning |
| --- | --- |
| `✅ TAILSCALE_AUTHKEY received (length: N)` | The key is set on the service |
| `⚠️ TAILSCALE_AUTHKEY is not set — skipping Tailscale` | No key → all tailnet calls will fail |
| `✅ Tailscale connected: 100.x.y.z` | Working |
| `⚠️ 'tailscale up' FAILED — continuing without the tailnet` | Key expired / single-use / revoked |
| `🔌 Tailnet proxy installed (socks: …, http: …)` | The app is routing 100.x through the proxy |

Independent check: the **Tailscale admin console → Machines** should show a node named `gcp`
appear when a container authenticates. If it doesn't, `tailscale up` never succeeded,
whatever the app logs say.

Then hit an endpoint that crosses the tailnet:

```bash
curl https://reviewer-backend-<id>.asia-south2.run.app/api/faq/app/state-table
```

- JSON → working.
- `502 {"error":"faq service unavailable"}` → Tailscale is down, or the FAQ server is.
- Hanging → the proxy is not using the agent (should be impossible now).

---

## Files

| File | Role |
| --- | --- |
| `backend/scripts/start.sh` | Starts `tailscaled` + the proxies; never fatal |
| `backend/src/bootstrap/tailnetProxy.ts` | Patches axios + global fetch; exports `tailnetAgentFor()` |
| `backend/src/config/ai.ts` | `proxyAddress`, `httpProxyAddress`, `useTailnetProxy` |
| `backend/src/index.ts` | Installs the proxy at boot; FAQ/POP proxies get the agent + timeouts |
| `backend/Dockerfile.app` | Copies the `tailscaled` / `tailscale` binaries in |
| `frontend/src/config/env.ts` | FAQ/POP URLs derived from `VITE_API_BASE_URL` |
