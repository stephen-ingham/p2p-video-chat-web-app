import {apiBaseUrl} from './config.ts';

// The API only returns a callID from create/join; each client builds the
// call's WebSocket URL itself. Same rule as the web app's
// web-server/src/src/lib/call-url.ts, applied to the API's base URL instead
// of the page origin:
// - http (LOCAL=true dev stack): ws://<host>/ws/:callID
// - https (ngrok dev tunnel / production): wss://<host>/wss/:callID
// Parsed by hand rather than with `URL`, whose React Native implementation
// doesn't support most getters (e.g. `host`), or a regex (see config.ts).
export function buildCallUrl(callId: string, apiBase = apiBaseUrl): string {
	const isSecure = apiBase.startsWith('https://');
	const host = apiBase.slice(isSecure ? 'https://'.length : 'http://'.length);
	if (
		!(isSecure || apiBase.startsWith('http://')) ||
		host === '' ||
		host.includes('/')
	) {
		throw new Error(
			`API base URL must be http(s)://host[:port] with no path, got: ${apiBase}`,
		);
	}

	const scheme = isSecure ? 'wss' : 'ws';
	return `${scheme}://${host}/${scheme}/${encodeURIComponent(callId)}`;
}
