// Production entry point (Dockerfile.prod). Serves the built Astro app and,
// when API_PROXY_TARGET is set, forwards the signalling API's routes to it,
// WebSocket upgrades included. Browsers then only ever talk to this origin,
// as they do in dev through Vite's proxy (astro.config.mjs), which keeps the
// SameSite=Strict refresh cookie first-party with no load balancer in front.
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

const proxy = createProxyServer({
	target: apiTarget,
	// Cloud Run routes requests by Host, so it must name the API's service.
	// Origin is passed on untouched, for the API's ALLOWED_ORIGIN checks.
	changeOrigin: true,
	xfwd: true,
});
proxy.on('error', (error, _request, target) => {
	// Connection failures are AggregateErrors with an empty message.
	console.error(`API proxy error: ${error.code ?? error.message}`);
	// A ServerResponse for HTTP requests, a raw socket for WebSocket upgrades.
	if (target instanceof http.ServerResponse) {
		if (!target.headersSent) target.writeHead(502);
		target.end();
	} else {
		target.destroy();
	}
});

const server = http.createServer((request, response) => {
	if (isApiRequest(request)) {
		proxy.web(request, response);
		return;
	}

	handler(request, response);
});
server.on('upgrade', (request, socket, head) => {
	if (isApiRequest(request)) {
		proxy.ws(request, socket, head);
		return;
	}

	socket.destroy();
});

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';
server.listen(port, host, () => {
	console.log(
		`Listening on http://${host}:${port}, API proxy: ${apiTarget ?? 'off'}`,
	);
});
