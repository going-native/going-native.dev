import type { APIRoute } from 'astro';
import { COLLECTION, MANIFESTO_VERSION, SIGNATURE_VERSION } from '../../lib/manifesto';
import { getPublicKey } from '../../lib/manifesto-sign';
import { getSiteSession } from '../../lib/site-session';

export const prerender = false;

export const GET: APIRoute = async () => {
	try {
		const session = await getSiteSession();
		return Response.json({
			collection: COLLECTION,
			manifestoVersion: MANIFESTO_VERSION,
			signatureVersion: SIGNATURE_VERSION,
			publicKey: getPublicKey(),
			siteDid: session.did,
			siteHandle: session.session.handle,
			pds: session.dispatchUrl,
		});
	} catch (err) {
		console.error('Manifesto site session error:', err);
		return new Response(
			JSON.stringify({ error: 'Site identity is not configured. Set the manifesto environment variables.' }),
			{ status: 503, headers: { 'content-type': 'application/json' } },
		);
	}
};
