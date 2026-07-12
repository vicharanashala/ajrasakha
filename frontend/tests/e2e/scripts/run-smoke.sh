#!/usr/bin/env bash
# Convenience runner — does the most common "smoke" pass.
# Runs the public + a11y phases (no backend required) and prints a
# concise summary.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "→ Running smoke suite (@public + @a11y)..."

pnpm test:e2e --grep "@public|@a11y" --reporter=list

echo
echo "→ Done."