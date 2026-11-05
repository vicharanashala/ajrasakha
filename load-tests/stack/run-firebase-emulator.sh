#!/bin/bash
# Runs the Firebase Auth emulator (used to mint real ID tokens for load tests).
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
exec firebase emulators:start --only auth --project "${FIREBASE_PROJECT_ID:-demo-ajrasakha}"
