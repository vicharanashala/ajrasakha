#!/bin/bash
# Runs the Ajrasakha backend against the local Mongo replica set + Firebase Auth emulator.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
CERTS="$DIR/certs"
bash "$DIR/gen-creds.sh"

export NODE_ENV=development
export PORT="${BACKEND_PORT:-3000}"
export DB_URL="mongodb://localhost:27017/?replicaSet=rs0&directConnection=true&tlsCAFile=$CERTS/ca.pem"
export DB_NAME="${DB_NAME:-agriai_loadtest}"
# Analytics DBs point at the same local Mongo (separate DB names)
export DB_URL_ANALYTICS="$DB_URL"
export DB_NAME_ANALYTICS="analytics_loadtest"
export ANNAM_URL_ANALYTICS="$DB_URL"
export ANNAM_DB_ANALYTICS="annam_loadtest"
export FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-demo-ajrasakha}"
export FIREBASE_CLIENT_EMAIL="loadtest@demo-ajrasakha.iam.gserviceaccount.com"
export FIREBASE_PRIVATE_KEY="$(cat "$CERTS/fake-firebase.key")"
export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
export USE_TAILNET_PROXY=false
export ENABLE_AI_SERVER=false
# Dummy Plivo creds (PlivoService constructs a client at DI time and requires them)
export PLIVO_AUTH_ID="MADUMMYAUTHID0000000"
export PLIVO_AUTH_TOKEN="dummy-plivo-auth-token"
# Throwaway VAPID keys (web-push requires them at module load; generated locally)
export VAPID_EMAIL="loadtest@example.com"
source "$CERTS/vapid.env"

cd "$ROOT/backend"
exec node build/index.js
