#!/bin/bash
# Runs a single-node MongoDB replica set with TLS (required by backend MongoClient options).
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
CERTS="$DIR/certs"
bash "$DIR/gen-creds.sh"
DBPATH="${MONGO_DBPATH:-/tmp/mongo-data}"
mkdir -p "$DBPATH"

# Initialize replica set in the background once mongod is up (idempotent).
(
  for i in $(seq 1 30); do
    sleep 2
    if mongosh --tls --tlsCAFile "$CERTS/ca.pem" --quiet --eval 'db.runCommand({ping:1})' >/dev/null 2>&1; then
      mongosh --tls --tlsCAFile "$CERTS/ca.pem" --quiet --eval '
        try { rs.status() } catch (e) {
          rs.initiate({_id:"rs0", members:[{_id:0, host:"localhost:27017"}]})
        }' || true
      break
    fi
  done
) &

exec mongod \
  --replSet rs0 \
  --port 27017 \
  --dbpath "$DBPATH" \
  --bind_ip 127.0.0.1 \
  --tlsMode requireTLS \
  --tlsCertificateKeyFile "$CERTS/server.pem" \
  --tlsCAFile "$CERTS/ca.pem" \
  --tlsAllowConnectionsWithoutCertificates
