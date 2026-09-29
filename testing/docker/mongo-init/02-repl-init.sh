#!/bin/bash
# =============================================================================
# Replica-set bootstrap for the load-test Mongo container.
# ------------------------------------------------------------------
# Idempotent. Runs once per `mongo-repl-init` container start.
#   * if RS is already initiated (volume persists), this is a no-op
#   * else: rs.initiate({_id:"rs0", members:[{_id:0, host:"mongo:27017"}]})
#   * then waits for primary to come up
#   * then re-applies every *.js in /mongo-init (the user indexes the app
#     relies on)
#
# IMPORTANT: keep CRLF out of this file. Editing on Windows + saving as
# UTF-8-with-BOM or CRLF will break `bash` with "set: illegal option" the
# same way it broke start.sh.
# =============================================================================
set -u

echo "[mongo-repl-init] checking rs.status()..."
if mongosh --host mongo:27017 --quiet --eval 'try { var s = rs.status(); if (s && s.ok) { print("already initiated"); quit(0); } } catch (e) { /* fall through */ }'; then
  echo "[mongo-repl-init] rs already initiated"
else
  echo "[mongo-repl-init] initiating replica set..."
  mongosh --host mongo:27017 --quiet --eval 'rs.initiate({_id: "rs0", members: [{_id: 0, host: "mongo:27017"}]})'
fi

echo "[mongo-repl-init] waiting for primary..."
for i in $(seq 1 30); do
  WRITABLE=$(mongosh --host mongo:27017 --quiet --eval 'db.runCommand({ hello: 1 }).isWritablePrimary' 2>/dev/null | tr -d '\r')
  if [ "$WRITABLE" = "true" ]; then
    echo "[mongo-repl-init] primary ready after ${i}s"
    break
  fi
  sleep 2
done

echo "[mongo-repl-init] applying *.js indexes..."
for f in /mongo-init/*.js; do
  [ -f "$f" ] || continue
  echo "[mongo-repl-init] applying $f"
  mongosh --host mongo:27017 --quiet "$f"
done

echo "[mongo-repl-init] done"
