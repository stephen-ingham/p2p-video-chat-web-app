// Every call's WebSocket server is reached through the page's own origin: the
// Astro dev proxy (LOCAL=true, plain http -> /ws), the ngrok tunnel, or the
// production reverse proxy (https -> /wss) all forward the path to the
// signalling API. So the page's protocol alone decides both scheme and path —
// the API only hands back the callID.
export function buildCallUrl(
	callId: string,
	location: Pick<Location, 'protocol' | 'host'> = globalThis.location,
): string {
	// The API's upgrade handler routes /ws/:callID when LOCAL=true and
	// /wss/:callID otherwise, so the path prefix matches the scheme.
	const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
	return `${scheme}://${location.host}/${scheme}/${encodeURIComponent(callId)}`;
}
