import {
	configureOAuth,
	createAuthorizationUrl,
	finalizeAuthorization,
} from '@atcute/oauth-browser-client';
import {
	CompositeDidDocumentResolver,
	LocalActorResolver,
	PlcDidDocumentResolver,
	WebDidDocumentResolver,
	XrpcHandleResolver,
	type ResolvedActor,
} from '@atcute/identity-resolver';
import type { ActorIdentifier } from '@atcute/lexicons';

export const SCOPE = 'atproto transition:generic';

const PROD_CLIENT_ID = 'https://going-native.dev/oauth-client-metadata.json';

let configured = false;
let resolver: LocalActorResolver | null = null;

export function configureManifestoOAuth(): void {
	if (configured) return;

	const redirectUri = `${window.location.origin}/oauth/callback`;
	// AT Protocol OAuth forbids `localhost`; for local dev we use the special
	// `http://localhost?...` client_id so the flow works on 127.0.0.1.
	const clientId = import.meta.env.PROD
		? PROD_CLIENT_ID
		: `http://localhost?redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(SCOPE)}`;

	resolver = new LocalActorResolver({
		handleResolver: new XrpcHandleResolver({ serviceUrl: 'https://public.api.bsky.app' }),
		didDocumentResolver: new CompositeDidDocumentResolver({
			methods: {
				plc: new PlcDidDocumentResolver(),
				web: new WebDidDocumentResolver(),
			},
		}),
	});

	configureOAuth({
		metadata: { client_id: clientId, redirect_uri: redirectUri },
		identityResolver: resolver,
	});

	configured = true;
}

/** Resolve a handle or DID to { did, handle, pds }. */
export function resolveActor(actor: string): Promise<ResolvedActor> {
	configureManifestoOAuth();
	if (!resolver) {
		throw new Error('identity resolver not initialized');
	}
	return resolver.resolve(actor as ActorIdentifier);
}

export async function startSignIn(handle: string): Promise<void> {
	configureManifestoOAuth();
	const authUrl = await createAuthorizationUrl({
		target: { type: 'account', identifier: handle as ActorIdentifier },
		scope: SCOPE,
	});
	await new Promise((resolve) => setTimeout(resolve, 200));
	window.location.assign(authUrl.toString());
}

export async function finalizeCallback(): Promise<{ did: string }> {
	configureManifestoOAuth();
	const params = new URLSearchParams(window.location.hash.slice(1));
	history.replaceState(null, '', window.location.pathname + window.location.search);
	const { session } = await finalizeAuthorization(params);
	return { did: session.info.sub };
}
