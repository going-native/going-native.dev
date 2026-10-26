// Generates an Ed25519 keypair for the manifesto signing backend.
//
// Usage:
//   node scripts/generate-manifesto-key.mjs
//
// Prints:
//   - MANIFESTO_SIGNING_KEY  (base64 of the PKCS#8 private key PEM) — set as a secret
//   - the public key (base64url) — for reference; the API exposes it automatically.

import crypto from 'node:crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

const publicJwk = publicKey.export({ format: 'jwk' });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });

console.log('MANIFESTO_SIGNING_KEY (secret, base64 of PEM):');
console.log(Buffer.from(privatePem, 'utf8').toString('base64'));
console.log();
console.log('Public key (base64url):');
console.log(publicJwk.x);
