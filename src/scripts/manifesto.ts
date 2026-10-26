import { Client, simpleFetchHandler } from '@atcute/client';
import { OAuthUserAgent, deleteStoredSession, getSession, listStoredSessions } from '@atcute/oauth-browser-client';
import type {} from '@atcute/atproto';
import type { ActorIdentifier, Did } from '@atcute/lexicons';
import {
	COLLECTION,
	SIGNATURE_RKEY,
	buildSignedPayload,
	type ManifestoRecord,
} from '../lib/manifesto';
import { verifySignature } from '../lib/manifesto-verify';
import { configureManifestoOAuth, resolveActor, startSignIn } from './oauth';

interface SiteInfo {
	collection: string;
	manifestoVersion: number;
	signatureVersion: number;
	publicKey: string;
	siteDid: string;
	siteHandle: string;
	pds: string;
}

const APPVIEW = 'https://public.api.bsky.app';

let siteInfo: SiteInfo | null = null;
let currentDid: Did | null = null;
let currentHandle: string | null = null;

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function formatDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleString(undefined, {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
}

async function fetchSiteInfo(): Promise<SiteInfo> {
	if (siteInfo) return siteInfo;
	const res = await fetch('/api/info');
	if (!res.ok) {
		throw new Error('Site identity is not configured');
	}
	siteInfo = (await res.json()) as SiteInfo;
	return siteInfo;
}

async function loadSigners(): Promise<void> {
	const listEl = document.getElementById('signer-list');
	if (!listEl) return;

	listEl.innerHTML = '<p class="muted">Loading signatures…</p>';

	try {
		const info = await fetchSiteInfo();
		const rpc = new Client({ handler: simpleFetchHandler({ service: info.pds }) });
		const res = await rpc.get('com.atproto.repo.listRecords', {
			params: { repo: info.siteDid as ActorIdentifier, collection: COLLECTION, limit: 100 },
		});

		if (!res.ok) {
			listEl.innerHTML = '<p class="muted">No signatures yet.</p>';
			return;
		}

		const mirrorRecords = res.data.records.filter(
			(rec) => (rec.value as unknown as ManifestoRecord | null)?.$type === COLLECTION,
		);

		if (mirrorRecords.length === 0) {
			listEl.innerHTML = '<p class="muted">No signatures yet. Be the first.</p>';
			return;
		}

		const appview = new Client({ handler: simpleFetchHandler({ service: APPVIEW }) });

		const signers = await Promise.all(
			mirrorRecords.map(async (rec) => {
				const record = rec.value as unknown as ManifestoRecord;
				const verified = await verifySignature(
					buildSignedPayload(record),
					record.signature,
					record.publicKey,
				);
				// A signature is only live while the signer keeps the record in
				// their own repo — they can remove it at any time.
				const check = await appview.get('com.atproto.repo.getRecord', {
					params: {
						repo: record.did as ActorIdentifier,
						collection: COLLECTION,
						rkey: SIGNATURE_RKEY,
					},
				});
				return { record, verified, present: check.ok };
			}),
		);

		signers.sort((a, b) => b.record.signedAt.localeCompare(a.record.signedAt));

		const live = signers.filter((s) => s.present);
		const withdrawn = signers.filter((s) => !s.present);

		const rows = signers
			.map(({ record, verified, present }) => {
				const badge = !present
					? '<span class="badge withdrawn">signature removed</span>'
					: verified
						? '<span class="badge verified">verified</span>'
						: '<span class="badge unverified">unverified</span>';
				const profile = `https://bsky.app/profile/${encodeURIComponent(record.did)}`;
				return `
					<li class="signer${present ? '' : ' withdrawn'}" data-did="${escapeHtml(record.did)}">
						<div class="signer-main">
							<span class="signer-name">${escapeHtml(record.name)}</span>
							<span class="signer-handle"><a href="${profile}" target="_blank" rel="noopener noreferrer">@${escapeHtml(record.handle)}</a></span>
						</div>
						<div class="signer-meta">
							<span class="signer-date">${escapeHtml(formatDate(record.signedAt))}</span>
							${badge}
						</div>
					</li>`;
			})
			.join('');

		listEl.innerHTML = `
			<p class="muted">${live.length} signer${live.length === 1 ? '' : 's'}${
				withdrawn.length ? ` · ${withdrawn.length} removed` : ''
			}</p>
			<ul class="signer-list">${rows}</ul>`;
	} catch (err) {
		console.error(err);
		listEl.innerHTML = '<p class="muted">Could not load signatures.</p>';
	}
}

async function renderWidget(): Promise<void> {
	const el = document.getElementById('sign-widget');
	if (!el) return;

	if (!currentDid) {
		el.innerHTML = `
			<p class="muted">Sign with your Atproto account. Your signature lives in your own repo — you can remove it any time.</p>
			<form id="handle-form">
				<input id="handle-input" type="text" placeholder="your-handle.bsky.social" autocomplete="off" required />
				<button type="submit" class="button">Sign with Atproto</button>
			</form>
			<p id="sign-error" class="error" hidden></p>`;
		const form = el.querySelector<HTMLFormElement>('#handle-form');
		form?.addEventListener('submit', async (event) => {
			event.preventDefault();
			const input = el.querySelector<HTMLInputElement>('#handle-input');
			const error = el.querySelector<HTMLParagraphElement>('#sign-error');
			if (!input) return;
			try {
				await startSignIn(input.value.trim());
			} catch (err) {
				console.error(err);
				if (error) {
					error.textContent = 'Could not start sign-in. Check the handle and try again.';
					error.hidden = false;
				}
			}
		});
		return;
	}

	el.innerHTML = `
		<p class="muted">Signed in as <strong>@${escapeHtml(currentHandle ?? currentDid)}</strong>.</p>
		<form id="name-form">
			<label for="name-input">Name to sign with</label>
			<input id="name-input" type="text" placeholder="Your name" autocomplete="off" maxlength="80" required />
			<button type="submit" class="button">Sign the manifesto</button>
		</form>
		<p><a href="#" id="sign-out">Use a different account</a></p>
		<p id="sign-error" class="error" hidden></p>`;

	const form = el.querySelector<HTMLFormElement>('#name-form');
	form?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const input = el.querySelector<HTMLInputElement>('#name-input');
		const error = el.querySelector<HTMLParagraphElement>('#sign-error');
		const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
		if (!input || !submit) return;
		const name = input.value.trim();
		if (!name) return;

		submit.disabled = true;
		try {
			await signManifesto(name);
			if (error) error.hidden = true;
			el.innerHTML = `<p class="success">Signed! Your signature now appears below.</p>`;
			await loadSigners();
		} catch (err) {
			console.error(err);
			if (error) {
				error.textContent = err instanceof Error ? err.message : 'Signing failed.';
				error.hidden = false;
			}
			submit.disabled = false;
		}
	});

	el.querySelector<HTMLAnchorElement>('#sign-out')?.addEventListener('click', (event) => {
		event.preventDefault();
		signOut();
	});
}

async function signManifesto(name: string): Promise<void> {
	if (!currentDid) {
		throw new Error('Not signed in');
	}
	if (!currentHandle) {
		try {
			const actor = await resolveActor(currentDid);
			currentHandle = actor.handle;
		} catch {
			throw new Error('Could not resolve your account handle');
		}
	}

	const signRes = await fetch('/api/sign', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ did: currentDid, handle: currentHandle, name }),
	});
	if (!signRes.ok) {
		const data = (await signRes.json().catch(() => null)) as { error?: string } | null;
		throw new Error(data?.error ?? 'Signing failed');
	}
	const { record } = (await signRes.json()) as { record: ManifestoRecord };

	const session = await getSession(currentDid, { allowStale: true });
	const agent = new OAuthUserAgent(session);
	const rpc = new Client({ handler: agent });
	const put = await rpc.post('com.atproto.repo.putRecord', {
		input: {
			repo: currentDid,
			collection: COLLECTION,
			rkey: SIGNATURE_RKEY,
			record: record as unknown as Record<string, unknown>,
			validate: false,
		},
	});
	if (!put.ok) {
		throw new Error(put.data.message ?? 'Failed to write signature to your repo');
	}
}

function signOut(): void {
	if (currentDid) {
		try {
			deleteStoredSession(currentDid);
		} catch {
			// ignore
		}
	}
	currentDid = null;
	currentHandle = null;
	const url = new URL(window.location.href);
	url.search = '';
	window.history.replaceState(null, '', url.pathname);
	renderWidget();
}

async function init(): Promise<void> {
	configureManifestoOAuth();

	const params = new URLSearchParams(window.location.search);
	const didParam = params.get('did');
	const errorParam = params.get('error');

	if (errorParam === 'oauth') {
		const el = document.getElementById('sign-widget');
		if (el) el.innerHTML = '<p class="error">Sign-in was cancelled or failed. Please try again.</p>';
	}

	if (didParam) {
		currentDid = didParam as Did;
		try {
			const actor = await resolveActor(didParam);
			currentHandle = actor.handle;
		} catch {
			currentHandle = null;
		}
	} else {
		const stored = listStoredSessions();
		if (stored.length > 0) {
			currentDid = stored[0];
			try {
				const actor = await resolveActor(currentDid);
				currentHandle = actor.handle;
			} catch {
				currentHandle = null;
			}
		}
	}

	await renderWidget();
	await loadSigners();
}

init();
