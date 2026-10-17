#!/bin/bash
# Generates all local, throwaway credentials the test stack needs:
#   certs/ca.pem + ca.key          self-signed CA (Mongo TLS)
#   certs/server.pem               server key+cert for mongod (SAN: localhost/127.0.0.1)
#   certs/fake-firebase.key        RSA key for firebase-admin (emulator never verifies it)
#   certs/vapid.env                throwaway VAPID keypair for web-push
# Idempotent: skips anything that already exists. Everything is gitignored.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
CERTS="$DIR/certs"
mkdir -p "$CERTS"
cd "$CERTS"

if [ ! -f ca.pem ] || [ ! -f server.pem ]; then
  cat > san.cnf <<'EOF'
[req]
distinguished_name = dn
x509_extensions = v3_req
prompt = no
[dn]
CN = localhost
[v3_req]
subjectAltName = @alt_names
[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
EOF
  openssl genrsa -out ca.key 2048 2>/dev/null
  openssl req -x509 -new -key ca.key -days 3650 -subj "/CN=loadtest-local-ca" -out ca.pem
  openssl genrsa -out server.key 2048 2>/dev/null
  openssl req -new -key server.key -subj "/CN=localhost" -config san.cnf -out server.csr
  openssl x509 -req -in server.csr -CA ca.pem -CAkey ca.key -CAcreateserial \
    -days 3650 -extensions v3_req -extfile san.cnf -out server.crt 2>/dev/null
  cat server.key server.crt > server.pem
  echo "generated Mongo TLS CA + server cert"
fi

if [ ! -f fake-firebase.key ]; then
  openssl genrsa -out fake-firebase.key 2048 2>/dev/null
  echo "generated fake firebase-admin private key"
fi

if [ ! -f vapid.env ]; then
  node -e '
    const c = require("crypto");
    const {publicKey, privateKey} = c.generateKeyPairSync("ec", {namedCurve: "prime256v1"});
    const pub = publicKey.export({format: "jwk"});
    const b64u = s => Buffer.from(s, "base64url");
    const raw = Buffer.concat([Buffer.from([4]), b64u(pub.x), b64u(pub.y)]).toString("base64url");
    const d = privateKey.export({format: "jwk"}).d;
    console.log(`export VAPID_PUBLIC_KEY="${raw}"`);
    console.log(`export VAPID_PRIVATE_KEY="${d}"`);
  ' > vapid.env
  echo "generated throwaway VAPID keypair"
fi

echo "credentials ready in $CERTS"
