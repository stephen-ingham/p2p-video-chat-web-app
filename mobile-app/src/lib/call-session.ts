// WebRTC signalling for one call over its WebSocket, matching the web client
// (web-server/src/src/lib/rtc-utils.ts): the joiner offers to everyone
// already on the call, they answer, and both sides send `candidate` messages
// with their own email as `caller`. Peers come from an injected `createPeer`
// (real one: webrtc.ts) so tests can use fakes. A closure, not a class with
// #private fields, to stay within what Hermes runs without extra transforms.
import type {
	CallEvents,
	CreatePeer,
	IceCandidate,
	Peer,
	SessionDescription,
	SocketLike,
} from './call-types.ts';

type PeerEntry = {
	peer: Peer;
	// Candidates can arrive before the offer/answer they belong to (the web
	// client sends its offer only after local ICE gathering has started).
	hasRemoteDescription: boolean;
	pendingCandidates: IceCandidate[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function readString(data: Record<string, unknown>, key: string) {
	const value = data[key];
	return typeof value === 'string' ? value : '';
}

function readDescription(value: unknown): SessionDescription | undefined {
	if (!isRecord(value) || typeof value.type !== 'string') return undefined;
	return {
		type: value.type,
		sdp: typeof value.sdp === 'string' ? value.sdp : undefined,
	};
}

export function createCallSession(options: {
	callId: string;
	email: string;
	socket: SocketLike;
	createPeer: CreatePeer;
	events: CallEvents;
}) {
	const {callId, email, socket, createPeer, events} = options;
	const peers = new Map<string, PeerEntry>();

	function send(type: string, data: Record<string, unknown>) {
		// eslint-disable-next-line @typescript-eslint/naming-convention -- wire property name is fixed by the backend signalling protocol
		socket.send(JSON.stringify({type, data: {...data, callID: callId}}));
	}

	function peerFor(peerEmail: string): PeerEntry {
		const existing = peers.get(peerEmail);
		if (existing) return existing;

		const entry: PeerEntry = {
			hasRemoteDescription: false,
			pendingCandidates: [],
			peer: createPeer({
				onIceCandidate(candidate) {
					send('candidate', {candidate, recipient: peerEmail, caller: email});
				},
				onRemoteStream(streamUrl) {
					events.onRemoteStream(peerEmail, streamUrl);
				},
			}),
		};
		peers.set(peerEmail, entry);
		return entry;
	}

	async function markRemoteDescriptionSet(entry: PeerEntry) {
		entry.hasRemoteDescription = true;
		const queued = entry.pendingCandidates.splice(0);
		for (const candidate of queued) {
			// eslint-disable-next-line no-await-in-loop -- candidates must be applied in order
			await entry.peer.addIceCandidate(candidate);
		}
	}

	async function callPeer(peerEmail: string) {
		const offer = await peerFor(peerEmail).peer.createOffer();
		send('offer', {
			offer,
			recipient: peerEmail,
			caller: email,
			currentUserEmail: email,
		});
	}

	function closePeer(peerEmail: string) {
		peers.get(peerEmail)?.peer.close();
		peers.delete(peerEmail);
	}

	async function handleMessage(type: string, data: Record<string, unknown>) {
		switch (type) {
			case 'receivedNewParticipantNotif': {
				// Broadcast to everyone, including the joiner itself. The joiner
				// sends us the offer, so there's nothing to negotiate here.
				const joined = readString(data, 'email');
				if (joined && joined !== email) events.onParticipantJoined(joined);
				break;
			}

			case 'chatMessage': {
				events.onChat(readString(data, 'email'), readString(data, 'message'));
				break;
			}

			case 'offer': {
				const caller = readString(data, 'caller');
				const offer = readDescription(data.offer);
				if (!caller || !offer) return;
				const entry = peerFor(caller);
				const answer = await entry.peer.acceptOffer(offer);
				await markRemoteDescriptionSet(entry);
				send('answer', {caller, recipient: email, answer});
				break;
			}

			case 'answer': {
				const entry = peers.get(readString(data, 'recipient'));
				const answer = readDescription(data.answer);
				if (!entry || !answer) return;
				await entry.peer.acceptAnswer(answer);
				await markRemoteDescriptionSet(entry);
				break;
			}

			case 'candidate': {
				const sender = readString(data, 'caller');
				if (!sender || !isRecord(data.candidate)) return;
				const entry = peerFor(sender);
				const candidate: IceCandidate = {
					candidate: readString(data.candidate, 'candidate'),
					sdpMid: readString(data.candidate, 'sdpMid') || undefined,
					// eslint-disable-next-line @typescript-eslint/naming-convention -- standard RTCIceCandidate field
					sdpMLineIndex:
						typeof data.candidate.sdpMLineIndex === 'number'
							? data.candidate.sdpMLineIndex
							: undefined,
				};
				if (entry.hasRemoteDescription)
					await entry.peer.addIceCandidate(candidate);
				else entry.pendingCandidates.push(candidate);
				break;
			}

			case 'participantLeftCall': {
				const left = readString(data, 'email');
				closePeer(left);
				events.onParticipantLeft(left);
				break;
			}

			default:
		}
	}

	socket.addEventListener('message', (event) => {
		let message: unknown;
		try {
			message = JSON.parse(String(event.data));
		} catch {
			return;
		}

		if (!isRecord(message) || typeof message.type !== 'string') return;
		const data = isRecord(message.data) ? message.data : {};
		handleMessage(message.type, data).catch((error: unknown) => {
			events.onError(error);
		});
	});

	return {
		// Offers to everyone already on the call (from the join handshake's
		// `responseCurrentCallParticipants`).
		async start(existingParticipants: string[]) {
			for (const participant of existingParticipants) {
				events.onParticipantJoined(participant);
			}

			await Promise.all(existingParticipants.map(async (p) => callPeer(p)));
		},
		sendChat(message: string) {
			send('chatMessage', {email, message});
		},
		leave() {
			for (const peerEmail of peers.keys()) closePeer(peerEmail);
			socket.close();
		},
	};
}

export type CallSession = ReturnType<typeof createCallSession>;
