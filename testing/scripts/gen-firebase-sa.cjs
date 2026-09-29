// Generates a real RSA keypair and writes a Firebase-style service-account JSON.
// Used once to give the load-test env a valid FIREBASE_PRIVATE_KEY that the
// firebase-admin SDK can actually parse (the placeholder in
// backend-loadtest.env was a stub that crashes at boot).
const c = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { privateKey } = c.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const sa = {
  type: 'service_account',
  project_id: 'ajrasakha-loadtest',
  private_key_id: 'loadtest-key-id',
  private_key: privateKey,
  client_email: 'emulator@ajrasakha-loadtest.iam.gserviceaccount.com',
  client_id: '000000000000000000000',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/loadtest',
};

const out = path.join(__dirname, '..', 'docker', 'firebase-sa.json');
fs.writeFileSync(out, JSON.stringify(sa, null, 2));
console.log(`Wrote ${out} (private key: ${privateKey.length} bytes)`);
console.log('Now paste FIREBASE_PRIVATE_KEY from this file into backend-loadtest.env');