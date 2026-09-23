import process from 'node:process';
import {WebSocket} from 'ws';
import {server} from '../../../src/app.js';
import {wss} from '../../../src/call/utils/session-store.js';

export async function startServer() {
	await new Promise((resolve) => {
		server.listen(0, '127.0.0.1', resolve);
	});
	return server.address().port;
}

export async function stopServer() {
	// Server.close()'s callback only fires once every connection has ended,
	// and test WS clients are mostly left open rather than closed per-test —
	// force them shut so this doesn't hang the file's `after` hook.
	// closeAllConnections() only covers plain HTTP connections: sockets
	// upgraded to WebSockets are no longer tracked as HTTP connections, but
	// still keep close() waiting, so terminate every call's clients too.
	for (const {server: callServer} of wss.values()) {
		for (const client of callServer.clients) client.terminate();
	}

	server.closeAllConnections();
	await new Promise((resolve) => {
		server.close(resolve);
	});
}

function wsUrl(port, callID) {
	const isLocal = process.env.LOCAL === 'true';
	const path = isLocal ? `/ws/${callID}` : `/wss/${callID}`;
	return `ws://127.0.0.1:${port}${path}`;
}

// Real `ws` client connecting to the app's actual HTTP server + upgrade
// handler — exercises the same handleUpgrade/verifyClient/maxPayload path a
// browser client would hit, rather than talking to the WebSocketServer
// instance directly.
export async function connectToCall(port, callID, options = {}) {
	const ws = new WebSocket(wsUrl(port, callID), [], options);
	await new Promise((resolve, reject) => {
		ws.once('open', resolve);
		ws.once('error', reject);
		ws.once('unexpected-response', (_request, response) => {
			reject(new Error(`Unexpected response: ${response.statusCode}`));
		});
	});
	return ws;
}

export function nextMessage(ws, predicate = () => true, timeoutMs = 2000) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			ws.off('message', onMessage);
			reject(new Error('Timed out waiting for a WebSocket message'));
		}, timeoutMs);

		function onMessage(raw) {
			const parsed = JSON.parse(raw.toString());
			if (predicate(parsed)) {
				clearTimeout(timer);
				ws.off('message', onMessage);
				resolve(parsed);
			}
		}

		ws.on('message', onMessage);
	});
}

export function waitForClose(ws, timeoutMs = 2000) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error('Timed out waiting for the connection to close'));
		}, timeoutMs);
		ws.once('close', (code, reason) => {
			clearTimeout(timer);
			resolve({code, reason: reason.toString()});
		});
	});
}

export async function joinCall(ws, {email, username, callID}) {
	ws.send(
		JSON.stringify({
			type: 'newParticipantOnCall',
			data: {email, username, callID},
		}),
	);
	return nextMessage(
		ws,
		(message) => message.type === 'responseCurrentCallParticipants',
	);
}
