// Publishing credentials: which atproto account the garden publishes to and
// how the app is authorized to write to it — OAuth (preferred) or an app
// password (fallback for PDSes without OAuth). Stored beside the local agent
// settings (data/publish.json, mode 0600), never in the graph database and
// never sent to the client unredacted; OAuth *tokens* live separately in
// data/oauth.json, managed by ./oauth. Env vars override the app-password
// fields for scratch runs.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type PublishAuthMethod = 'oauth' | 'password';

export interface PublishCredentials {
	/** How publishing authenticates; absent until an account is connected. */
	method?: PublishAuthMethod;
	/** PDS entryway for the app-password flow, e.g. https://bsky.social. */
	service: string;
	/** Handle or DID used for app-password sign-in. */
	identifier: string;
	/** An app password — never the account password. */
	appPassword: string;
	/** Resolved at the last successful sign-in (either method). */
	did?: string;
	handle?: string;
	/** The loopback origin the OAuth grant was authorized from. The client_id
	 *  embeds it, so token refresh must keep using the same one even when the
	 *  app later runs on a different port. */
	oauthOrigin?: string;
}

/** What the client is allowed to see. */
export interface RedactedCredentials {
	method?: PublishAuthMethod;
	service: string;
	identifier: string;
	hasPassword: boolean;
	did?: string;
	handle?: string;
}

export const DEFAULT_SERVICE = 'https://bsky.social';

const settingsPath = () => process.env.TRELLIS_PUBLISH_SETTINGS ?? resolve('data/publish.json');

export function readPublishCredentials(): PublishCredentials {
	const env = {
		service: process.env.TRELLIS_ATPROTO_SERVICE,
		identifier: process.env.TRELLIS_ATPROTO_IDENTIFIER,
		appPassword: process.env.TRELLIS_ATPROTO_APP_PASSWORD
	};
	let saved: Partial<PublishCredentials> = {};
	try {
		const value = JSON.parse(readFileSync(settingsPath(), 'utf8'));
		if (typeof value === 'object' && value !== null) {
			for (const k of ['service', 'identifier', 'appPassword', 'did', 'handle', 'oauthOrigin'] as const)
				if (typeof value[k] === 'string') saved[k] = value[k];
			if (value.method === 'oauth' || value.method === 'password') saved.method = value.method;
		}
	} catch {
		saved = {};
	}
	const credentials: PublishCredentials = {
		method: saved.method,
		service: env.service || saved.service || DEFAULT_SERVICE,
		identifier: env.identifier || saved.identifier || '',
		appPassword: env.appPassword || saved.appPassword || '',
		did: saved.did,
		handle: saved.handle,
		oauthOrigin: saved.oauthOrigin
	};
	// Env-supplied app-password credentials select the password path outright.
	if (env.appPassword && env.identifier) credentials.method = 'password';
	return credentials;
}

export function savePublishCredentials(value: PublishCredentials) {
	const file = settingsPath();
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 });
	renameSync(`${file}.tmp`, file);
}

export function redactCredentials(c: PublishCredentials): RedactedCredentials {
	return {
		method: c.method,
		service: c.service,
		identifier: c.identifier,
		hasPassword: c.appPassword.length > 0,
		did: c.did,
		handle: c.handle
	};
}
