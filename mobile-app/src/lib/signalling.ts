import {buildCallUrl} from './call-url.ts';

// Connects to a call's WebSocket server and announces this user, per the
// protocol in CLAUDE.md: send `newParticipantOnCall`, and the server replies
// with `responseCurrentCallParticipants`, the peers already on the call.
// Phase 2 stops there. Offer/answer/ICE handling comes with react-native-webrtc
// in Phase 3.
//
// React Native on Android adds a default Origin header to the upgrade, built
// from this URL (ws://10.0.2.2:3000 -> http://10.0.2.2:3000). In dev
// verifyClient allows any origin. In production the host must match
// ALLOWED_ORIGIN, or an explicit `origin` header must be passed.

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export type CallConnection = {
	socket: WebSocket;
	participants: string[];
};

export async function connectToCall(
	{callId, email, username}: {callId: string; email: string; username: string},
	timeoutMs = 5000,
): Promise<CallConnection> {
	const socket = new WebSocket(buildCallUrl(callId));

	return new Promise((resolve, reject) => {
		// Only the join handshake is handled here — once it has resolved, later
		// error/close events belong to whoever holds the returned socket.
		let settled = false;
		const timer = setTimeout(() => {
			fail(new Error('Timed out waiting for the call participant list'));
		}, timeoutMs);

		function fail(error: Error) {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			socket.close();
			reject(error);
		}

		socket.addEventListener('open', () => {
			socket.send(
				JSON.stringify({
					type: 'newParticipantOnCall',
					// eslint-disable-next-line @typescript-eslint/naming-convention -- wire property name is fixed by the backend signalling protocol
					data: {username, email, callID: callId},
				}),
			);
		});

		socket.addEventListener('error', () => {
			fail(new Error('WebSocket connection failed'));
		});

		socket.addEventListener('close', (event) => {
			fail(new Error(`WebSocket closed before joining (code ${event.code})`));
		});

		socket.addEventListener('message', (event) => {
			let message: unknown;
			try {
				message = JSON.parse(String(event.data));
			} catch {
				return;
			}

			if (
				settled ||
				!isRecord(message) ||
				message.type !== 'responseCurrentCallParticipants'
			) {
				return;
			}

			settled = true;
			clearTimeout(timer);
			const data = isRecord(message.data) ? message.data : {};
			const participants = Array.isArray(data.participants)
				? data.participants.filter(
						(participant): participant is string =>
							typeof participant === 'string',
					)
				: [];
			resolve({socket, participants});
		});
	});
}
