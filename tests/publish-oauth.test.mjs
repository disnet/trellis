import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { createServer } from 'vite';

process.env.TRELLIS_OAUTH_STORE = join(mkdtempSync(join(tmpdir(), 'trellis-oauth-')), 'oauth.json');

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());

const oauth = await server.ssrLoadModule('/src/lib/server/publish/oauth.ts');

test('only loopback origins may start OAuth, and always as the IP literal', () => {
	assert.equal(oauth.loopbackOrigin(new URL('http://localhost:5173/publish')), 'http://127.0.0.1:5173');
	assert.equal(oauth.loopbackOrigin(new URL('http://127.0.0.1:3000/oauth/callback')), 'http://127.0.0.1:3000');
	assert.equal(oauth.loopbackOrigin(new URL('http://[::1]:8080/x')), 'http://[::1]:8080');
	assert.equal(oauth.loopbackOrigin(new URL('https://trellis.example.com/publish')), null);
	assert.equal(oauth.loopbackOrigin(new URL('http://192.168.1.20:5173/publish')), null);
});

test('the scope asks for each published collection and nothing broader', () => {
	const scopes = oauth.OAUTH_SCOPE.split(' ');
	assert.equal(scopes[0], 'atproto', 'the base scope comes first');
	assert.deepEqual(scopes.slice(1).sort(), [
		'repo:com.disnetdev.trellis.garden',
		'repo:com.disnetdev.trellis.relation',
		'repo:com.disnetdev.trellis.revision',
		'repo:com.disnetdev.trellis.thought',
		'repo:com.disnetdev.trellis.treatment'
	]);
	assert.ok(!oauth.OAUTH_SCOPE.includes('transitional'), 'no blanket transitional scope');
	assert.ok(!oauth.OAUTH_SCOPE.includes('blob'), 'publishing uploads no blobs');
});

test('the loopback client_id embeds the redirect URI and scope the spec expects', () => {
	const clientId = oauth.loopbackClientId('http://127.0.0.1:5173');
	const url = new URL(clientId);
	assert.equal(url.origin, 'http://localhost');
	assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:5173/oauth/callback');
	assert.equal(url.searchParams.get('scope'), oauth.OAUTH_SCOPE);
});

test('the OAuth client builds valid loopback metadata and is cached per origin', () => {
	const client = oauth.getOauthClient('http://127.0.0.1:5173');
	assert.equal(client.clientMetadata.client_id, oauth.loopbackClientId('http://127.0.0.1:5173'));
	assert.deepEqual(client.clientMetadata.redirect_uris, ['http://127.0.0.1:5173/oauth/callback']);
	assert.equal(client.clientMetadata.scope, oauth.OAUTH_SCOPE);
	assert.equal(client.clientMetadata.token_endpoint_auth_method, 'none');
	assert.equal(client.clientMetadata.dpop_bound_access_tokens, true);
	assert.equal(oauth.getOauthClient('http://127.0.0.1:5173'), client, 'same origin reuses the client');
	assert.notEqual(oauth.getOauthClient('http://127.0.0.1:3000'), client, 'a new port is a new loopback client');
});
