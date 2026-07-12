#!/usr/bin/env bash
# Pre-flight check for the qa-e2e suite.
# Verifies that the environment is sane before tests start.
#
# Exits 0 on success, non-zero on any error.

set -euo pipefail

RED=$'\033[31m'
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
RESET=$'\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "→ Ajrasakha QA E2E — pre-flight check"
echo "→ $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo

# ---- 1. Node version ----
if ! command -v node >/dev/null 2>&1; then
  echo "${RED}✘ node not found${RESET}"
  exit 1
fi
NODE_MAJOR=$(node --version | cut -d. -f1 | tr -d 'v')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "${RED}✘ node ≥ 20 required (have $(node --version))${RESET}"
  exit 1
fi
echo "${GREEN}✔${RESET} node $(node --version)"

# ---- 2. pnpm ----
if ! command -v pnpm >/dev/null 2>&1; then
  echo "${YELLOW}⚠ pnpm not found. install: npm i -g pnpm${RESET}"
  exit 1
fi
echo "${GREEN}✔${RESET} pnpm $(pnpm --version)"

# ---- 3. node_modules ----
if [ ! -d "node_modules/@playwright" ]; then
  echo "${YELLOW}⚠ node_modules/@playwright missing — running pnpm install${RESET}"
  pnpm install --frozen-lockfile
fi
echo "${GREEN}✔${RESET} node_modules present"

# ---- 4. Playwright browsers ----
BROWSER_CACHE="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/Library/Caches/ms-playwright}"
if [ ! -d "$BROWSER_CACHE/chromium-"* ] && [ ! -d "$HOME/.cache/ms-playwright/chromium-"* ]; then
  echo "${YELLOW}⚠ Chromium not found — installing${RESET}"
  pnpm exec playwright install --with-deps chromium
fi
echo "${GREEN}✔${RESET} Chromium installed"

# ---- 5. Env vars ----
if [ -z "${E2E_BASE_URL:-}" ]; then
  echo "${YELLOW}⚠ E2E_BASE_URL not set — defaulting to http://localhost:5173${RESET}"
else
  echo "${GREEN}✔${RESET} E2E_BASE_URL=$E2E_BASE_URL"
fi
if [ -z "${E2E_API_URL:-}" ]; then
  echo "${YELLOW}⚠ E2E_API_URL not set — defaulting to http://localhost:3141/api${RESET}"
else
  echo "${GREEN}✔${RESET} E2E_API_URL=$E2E_API_URL"
fi

# ---- 6. Probe URLs (best-effort) ----
echo
echo "→ Probing targets (5s timeout each)..."
if [ -n "${E2E_BASE_URL:-}" ]; then
  if curl -sf -m 5 "$E2E_BASE_URL/" >/dev/null 2>&1; then
    echo "${GREEN}✔${RESET} Frontend reachable at $E2E_BASE_URL"
  else
    echo "${YELLOW}⚠ Frontend NOT reachable at $E2E_BASE_URL (will skip @public tests)${RESET}"
  fi
fi
if [ -n "${E2E_API_URL:-}" ]; then
  if curl -sf -m 5 "$E2E_API_URL/users/me" >/dev/null 2>&1; then
    echo "${GREEN}✔${RESET} Backend reachable at $E2E_API_URL (returns 200 — unusual for /users/me, check auth)"
  elif curl -s -m 5 -o /dev/null -w "%{http_code}" "$E2E_API_URL/users/me" | grep -qE "^[1-5][0-9][0-9]$"; then
    echo "${GREEN}✔${RESET} Backend reachable at $E2E_API_URL (returns expected HTTP status)"
  else
    echo "${YELLOW}⚠ Backend NOT reachable at $E2E_API_URL (will skip @contract tests)${RESET}"
  fi
fi

echo
echo "${GREEN}✔ Pre-flight check passed${RESET}"
echo "→ Run: pnpm test:e2e"