import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { Client } from '@atcute/client';
import type {} from '@atcute/atproto';
import {
	COLLECTION,
	INDEX_RKEY_PREFIX,
	MANIFESTO_URL,
	MANIFESTO_VERSION,
	SIGNATURE_VERSION,
	buildSignedPayload,
	type ManifestoRecord,
} from '../../lib/manifesto';
import { getPublicKey, signPayload } from '../../lib/manifesto-sign';
import { getSiteSession } from '../../lib/site-session';

export const prerender = false;

const DID_RE = /^did:[a-z0-9]+:[a-zA-Z0-9._:%-]+$/;

function jsonError(status: number, message: string): Response {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { 'content-type': 'application/json' },
	});
}

export const POST: APIRoute = async ({ request }) => {
	let body: { did?: unknown; handle?: unknown; name?: unknown };
	try {
		body = await request.json();
	} catch {
		return jsonError(400, 'Invalid JSON body');
	}

	const did = typeof body.did === 'string' ? body.did.trim() : '';
	const handle = typeof body.handle === 'string' ? body.handle.trim() : '';
	const name = typeof body.name === 'string' ? body.name.trim() : '';

	if (!DID_RE.test(did)) return jsonError(400, 'Invalid did');
	if (handle.length < 1 || handle.length > 253) return jsonError(400, 'Invalid handle');
	if (name.length < 1 || name.length > 80) {
		return jsonError(400, 'Name must be between 1 and 80 characters');
	}

	// Confirm the handle resolves to the given did so nobody can sign under
	// someone else's identity. Best-effort: don't block signing on a transient failure.
	try {
		const res = await fetch(
			`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
		);
		if (res.ok) {
			const data = (await res.json()) as { did?: string };
			if (data.did && data.did !== did) {
				return jsonError(400, 'Handle does not resolve to the given did');
			}
		}
	} catch {
		// ignore
	}

	const signedAt = new Date().toISOString();

	const record: ManifestoRecord = {
		$type: COLLECTION,
		manifestoVersion: MANIFESTO_VERSION,
		signatureVersion: SIGNATURE_VERSION,
		name,
		handle,
		did,
		signedAt,
		signature: signPayload(
			buildSignedPayload({
				did,
				handle,
				name,
				signedAt,
				manifestoVersion: MANIFESTO_VERSION,
				signatureVersion: SIGNATURE_VERSION,
			}),
		),
		publicKey: getPublicKey(),
		manifestoUrl: MANIFESTO_URL,
	};

	// Mirror the signature into the site's own repo so the signer list is an atproto document.
	try {
		const session = await getSiteSession();
		const rpc = new Client({ handler: session });
		const indexRkey = `${INDEX_RKEY_PREFIX}${crypto.createHash('sha256').update(did).digest('hex').slice(0, 40)}`;

		const put = await rpc.post('com.atproto.repo.putRecord', {
			input: {
				repo: session.did,
				collection: COLLECTION,
				rkey: indexRkey,
				record: record as unknown as Record<string, unknown>,
				validate: false,
			},
		});

		if (!put.ok) {
			return jsonError(502, 'Failed to record signature in index');
		}

		return Response.json({ record, indexRkey });
	} catch (err) {
		return jsonError(500, `Failed to record signature: ${err instanceof Error ? err.message : 'unknown error'}`);
	}
};
