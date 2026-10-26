// Browser-side Ed25519 signature verification (WebCrypto).

function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
	const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
	const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
	const bin = atob(padded);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) {
		bytes[i] = bin.charCodeAt(i);
	}
	return bytes;
}

/** Verifies an Ed25519 signature. Returns false if the runtime lacks WebCrypto Ed25519. */
export async function verifySignature(
	payload: string,
	signatureB64u: string,
	publicKeyB64u: string,
): Promise<boolean> {
	try {
		const key = await crypto.subtle.importKey(
			'raw',
			base64UrlToBytes(publicKeyB64u),
			{ name: 'Ed25519' },
			false,
			['verify'],
		);
		return await crypto.subtle.verify(
			{ name: 'Ed25519' },
			key,
			base64UrlToBytes(signatureB64u),
			new TextEncoder().encode(payload),
		);
	} catch {
		return false;
	}
}
