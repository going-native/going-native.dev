export const COLLECTION = 'dev.going-native.manifesto';

export const MANIFESTO_VERSION = 1;

export const SIGNATURE_VERSION = 1;

export const MANIFESTO_URL = 'https://going-native.dev/manifesto';

/** Record key used for each signer's record in their own repo. */
export const SIGNATURE_RKEY = 'manifesto';

/** Prefix for the mirrored index records held in the site's own repo. */
export const INDEX_RKEY_PREFIX = 'sig-';

export interface ManifestoRecord {
	$type: typeof COLLECTION;
	manifestoVersion: number;
	signatureVersion: number;
	name: string;
	handle: string;
	did: string;
	/** Server-stamped time of signing (ISO 8601). */
	signedAt: string;
	/** base64url-encoded Ed25519 signature over {@link buildSignedPayload}. */
	signature: string;
	/** base64url-encoded raw 32-byte Ed25519 public key. */
	publicKey: string;
	manifestoUrl: string;
}

/**
 * Deterministic byte string that the site's backend signs. Keeps name, identity
 * and the server-stamped timestamp bound together so nobody can backdate a
 * signature.
 */
export function buildSignedPayload(record: Pick<ManifestoRecord, 'did' | 'handle' | 'name' | 'signedAt' | 'manifestoVersion' | 'signatureVersion'>): string {
	return [
		COLLECTION,
		record.did,
		record.handle,
		record.name,
		record.signedAt,
		String(record.manifestoVersion),
		String(record.signatureVersion),
	].join('\n');
}

export function signerRecordUri(did: string): string {
	return `at://${did}/${COLLECTION}/${SIGNATURE_RKEY}`;
}
