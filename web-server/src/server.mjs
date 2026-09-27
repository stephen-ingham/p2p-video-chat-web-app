// Production entry point (Dockerfile.prod). Serves the built Astro app and,
// when API_PROXY_TARGET is set, forwards the signalling API's routes to it,
// WebSocket upgrades included. Browsers then only ever talk to this origin,
// as they do in dev through Vite's proxy (astro.config.mjs), which keeps the
// SameSite=Strict refresh cookie first-party with no load balancer in front.
import {Buffer} from 'node:buffer';
import http from 'node:http';
import process from 'node:process';
import {createProxyServer} from 'http-proxy-3';

// Stops the adapter starting its own server on import: this file owns the port.
process.env.ASTRO_NODE_AUTOSTART = 'disabled';
const {handler} = await import('./dist/server/entry.mjs');

const apiTarget = process.env.API_PROXY_TARGET;
const apiPaths = ['/auth/', '/call/', '/wss/'];

function isApiRequest(request) {
	return Boolean(apiTarget) && apiPaths.some((p) => request.url.startsWith(p));
}

// On Cloud Run the API only accepts requests from this service's identity
// (roles/run.invoker, see infra/index.ts), so each proxied request carries an
// ID token for it from the metadata server. It goes in
// X-Serverless-Authorization, which Cloud Run checks in place of
// Authorization, since that header carries the user's own JWT.
const useIdToken = process.env.API_PROXY_ID_TOKEN === 'true';
const metadataHost =
	process.env.GCE_METADATA_HOST ?? 'metadata.google.internal';
let cachedToken;
let pendingToken;

async function fetchIdToken() {
	const url = new URL(
		`http://${metadataHost}/computeMetadata/v1/instance/service-accounts/default/identity`,
	);
	url.searchParams.set('audience', apiTarget);
	const response = await fetch(url, {headers: {'Metadata-Flavor': 'Google'}});
	if (!response.ok) {
		throw new Error(`metadata server returned ${response.status}`);
	}

	const token = await response.text();
	const {exp} = JSON.parse(
		Buffer.from(token.split('.')[1], 'base64url').toString(),
	);
	return {token, expiresAt: exp * 1000};
}

async function idToken() {
	// Tokens last an hour: fetch a new one with five minutes to spare, once
	// for all the requests waiting on it.
	if (!cachedToken || cachedToken.expiresAt - Date.now() < 5 * 60_000) {
		pendingToken ??= fetchIdToken().finally(() => {
			pendingToken = undefined;
		});
		cachedToken = await pendingToken;
	}

	return cachedToken.token;
}

async function proxyOptions() {
	return useIdToken
		? {headers: {'x-serverless-authorization': `Bearer ${await idToken()}`}}
		: {};
}

// Answers a request the proxy couldn't forward: 502 for HTTP, or a closed
// socket for a WebSocket upgrade.
function failProxy(error, target) {
	// Connection failures are AggregateErrors with an empty message.
	console.error(`API proxy error: ${error.code ?? error.message}`);
	if (target instanceof http.ServerResponse) {
		if (!target.headersSent) target.writeHead(502);
		target.end();
	} else {
		target.destroy();
	}
}

const proxy = createProxyServer({
	target: apiTarget,
	// Cloud Run routes requests by Host, so it must name the API's service.
	// Origin is passed on untouched, for the API's ALLOWED_ORIGIN checks.
	changeOrigin: true,
	xfwd: true,
});
proxy.on('error', (error, _request, target) => {
	failProxy(error, target);
});

const server = http.createServer(async (request, response) => {
	if (!isApiRequest(request)) {
		handler(request, response);
		return;
	}

	try {
		proxy.web(request, response, await proxyOptions());
	} catch (error) {
		failProxy(error, response);
	}
});
server.on('upgrade', async (request, socket, head) => {
	if (!isApiRequest(request)) {
		socket.destroy();
		return;
	}

	try {
		proxy.ws(request, socket, head, await proxyOptions());
	} catch (error) {
		failProxy(error, socket);
	}
});

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';
server.listen(port, host, () => {
	console.log(
		`Listening on http://${host}:${port}, API proxy: ${apiTarget ?? 'off'}${useIdToken ? ' (with ID token)' : ''}`,
	);
});
