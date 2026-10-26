import { PasswordSession } from '@atcute/password-session';

let sessionPromise: Promise<PasswordSession> | null = null;

/**
 * Lazily logs the site's own atproto account in and caches the session for the
 * lifetime of the process. Used to mirror signatures into the site's repo so the
 * signer index is itself an atproto document.
 */
export function getSiteSession(): Promise<PasswordSession> {
	if (sessionPromise) {
		return sessionPromise;
	}

	const handle = process.env.MANIFESTO_SITE_HANDLE;
	const password = process.env.MANIFESTO_SITE_APP_PASSWORD;

	if (!handle || !password) {
		return Promise.reject(
			new Error('MANIFESTO_SITE_HANDLE and MANIFESTO_SITE_APP_PASSWORD are not set'),
		);
	}

	sessionPromise = PasswordSession.login({
		service: process.env.MANIFESTO_SITE_PDS ?? 'https://bsky.social',
		identifier: handle,
		password,
	}).catch((err) => {
		sessionPromise = null;
		throw err;
	});

	return sessionPromise;
}
