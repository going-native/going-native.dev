import crypto from 'node:crypto';

// The site's signing key is stored as base64(PKCS#8 PEM) in MANIFESTO_SIGNING_KEY
// so it never ships to the browser. See scripts/generate-manifesto-key.mjs.

function getPrivateKey(): crypto.KeyObject {
	const encoded = process.env.MANIFESTO_SIGNING_KEY;
	if (!encoded) {
		throw new Error('MANIFESTO_SIGNING_KEY is not set');
	}
	const pem = Buffer.from(encoded, 'base64').toString('utf8');
	return crypto.createPrivateKey(pem);
}

/** Raw 32-byte Ed25519 public key, base64url-encoded. */
export function getPublicKey(): string {
	const pub = crypto.createPublicKey(getPrivateKey());
	const jwk = pub.export({ format: 'jwk' }) as { x?: string };
	if (!jwk.x) {
		throw new Error('Failed to export public key');
	}
	return jwk.x;
}

/** Ed25519 signature over a UTF-8 payload, base64url-encoded. */
export function signPayload(payload: string): string {
	const key = getPrivateKey();
	return crypto.sign(null, Buffer.from(payload, 'utf8'), key).toString('base64url');
}
