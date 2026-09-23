let localMedia: Promise<MediaStream> | undefined;
const peerConnectionsArray: ExtendedRtcPeerConnection[] = [];
let websocket: WebSocket | undefined;

const mediaConstraints = {audio: true, video: true};

// Fallback when the API's ICE config can't be fetched: public STUN only (no
// TURN relay), same as the API's own default when TURN isn't configured.
export const defaultIceServers: RTCIceServer[] = [
	{urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']},
];
let iceServers: RTCIceServer[] = defaultIceServers;
const otherCallParticipants: string[] = [];

type ExtendedRtcPeerConnection = {
	caller?: string;
	recipient?: string;
	peerUser?: string;
} & RTCPeerConnection;

type AddRemoteVideoFn = (peerUser: string, stream: MediaStream) => void;

type WsIncomingMessage =
	| {
			type: 'receivedNewParticipantNotif';
			data: {email: string; message: string};
	  }
	| {type: 'chatMessage'; data: {email: string; message: string}}
	| {
			type: 'responseCurrentCallParticipants';
			data: {participants: string[]; callID: string; currentUserEmail: string};
	  }
	| {
			type: 'offer';
			data: {
				currentUserEmail: string;
				caller: string;
				recipient: string;
				offer: RTCSessionDescriptionInit;
				callID: string;
			};
	  }
	| {
			type: 'answer';
			data: {
				caller: string;
				recipient: string;
				answer: RTCSessionDescriptionInit;
				callID: string;
			};
	  }
	| {
			type: 'candidate';
			data: {
				candidate: RTCIceCandidateInit;
				recipient: string;
				caller: string;
				callID: string;
			};
	  }
	| {type: 'participantLeftCall'; data: {message: string; email: string}};

const wsIncomingMessageTypes = new Set<string>([
	'receivedNewParticipantNotif',
	'chatMessage',
	'responseCurrentCallParticipants',
	'offer',
	'answer',
	'candidate',
	'participantLeftCall',
]);

function isWsIncomingMessage(value: unknown): value is WsIncomingMessage {
	return (
		typeof value === 'object' &&
		value !== null &&
		'type' in value &&
		typeof value.type === 'string' &&
		wsIncomingMessageTypes.has(value.type)
	);
}

function sendMessage(message: Record<string, unknown>) {
	if (websocket) {
		websocket.send(JSON.stringify(message));
		return;
	}

	console.error('No active websocket connection to send message through');
}

function createPeerConnection(
	caller: string,
	recipient: string,
	peerUser: string,
	callId: string,
	addRemoteVideo: AddRemoteVideoFn,
	remoteVideoRefs: React.RefObject<HTMLVideoElement[]>,
	isParticipant: (name: string) => boolean,
	getCurrentUser: () => string,
): ExtendedRtcPeerConnection {
	const myPeerConnection: ExtendedRtcPeerConnection = new RTCPeerConnection({
		iceServers,
	});

	myPeerConnection.caller = caller;
	myPeerConnection.recipient = recipient;
	myPeerConnection.peerUser = peerUser;

	myPeerConnection.onicecandidate = (event) => {
		if (!event.candidate || event.candidate.candidate === '') return;
		const myEmail = getCurrentUser();
		const target = myEmail === caller ? recipient : caller;
		sendMessage({
			type: 'candidate',
			data: {
				candidate: event.candidate,
				recipient: target,
				caller: myEmail,
				// eslint-disable-next-line @typescript-eslint/naming-convention -- wire property name is fixed by the backend signalling protocol
				callID: callId,
			},
		});
	};

	myPeerConnection.ontrack = (event) => {
		addRemoteVideo(peerUser, event.streams[0]);
	};

	myPeerConnection.oniceconnectionstatechange = () => {
		console.log('ICE connection state change');

		if (
			(myPeerConnection.iceConnectionState === 'closed' ||
				myPeerConnection.iceConnectionState === 'failed') &&
			isParticipant(myPeerConnection.peerUser!)
		) {
			myPeerConnection.restartIce();
		}
	};

	myPeerConnection.onconnectionstatechange = () => {
		console.log('connection state change');

		if (
			myPeerConnection.connectionState === 'closed' &&
			isParticipant(myPeerConnection.peerUser!)
		) {
			myPeerConnection.restartIce();
		}
	};

	myPeerConnection.onnegotiationneeded = () => {
		console.log('Negotiation needed');

		if (getCurrentUser() === caller) {
			sendOffer(
				caller,
				recipient,
				callId,
				remoteVideoRefs,
				addRemoteVideo,
				isParticipant,
				getCurrentUser,
			)
				.then((offer) => {
					sendMessage(offer);
				})
				.catch((error: unknown) => {
					console.error('Failed to send offer:', error);
				});
		}
	};

	myPeerConnection.onicegatheringstatechange = () => {
		console.log('ICE gathering state change');
	};

	myPeerConnection.onsignalingstatechange = () => {
		console.log('Signalling state change');
	};

	return myPeerConnection;
}

function isExistingPeerConnection(
	type: string,
	caller: string,
	recipient: string,
	callId: string,
	addRemoteVideo: AddRemoteVideoFn,
	remoteVideoRefs: React.RefObject<HTMLVideoElement[]>,
	isParticipant: (name: string) => boolean,
	getCurrentUser: () => string,
): {
	currentPeerConnection: ExtendedRtcPeerConnection;
	peerConnectionIndex: number;
} {
	let peerConnectionIndex = peerConnectionsArray.findIndex(
		(pc) => pc.recipient === recipient && pc.caller === caller,
	);

	if (peerConnectionIndex !== -1) {
		return {
			currentPeerConnection: peerConnectionsArray[peerConnectionIndex],
			peerConnectionIndex,
		};
	}

	if (!(type === 'sendingOffer' || type === 'receivingOffer')) {
		throw new Error('RTC connection obj should already exist');
	}

	const peerUser = type === 'sendingOffer' ? recipient : caller;
	const newPeerConnection = createPeerConnection(
		caller,
		recipient,
		peerUser,
		callId,
		addRemoteVideo,
		remoteVideoRefs,
		isParticipant,
		getCurrentUser,
	);
	peerConnectionsArray.push(newPeerConnection);
	peerConnectionIndex = peerConnectionsArray.length - 1;

	return {currentPeerConnection: newPeerConnection, peerConnectionIndex};
}

export async function sendOffer(
	caller: string,
	recipient: string,
	callId: string,
	remoteVideoRefs: React.RefObject<HTMLVideoElement[]>,
	addRemoteVideo: AddRemoteVideoFn,
	isParticipant: (name: string) => boolean,
	getCurrentUser: () => string,
) {
	const {currentPeerConnection, peerConnectionIndex} = isExistingPeerConnection(
		'sendingOffer',
		caller,
		recipient,
		callId,
		addRemoteVideo,
		remoteVideoRefs,
		isParticipant,
		getCurrentUser,
	);

	const currentUserEmail = getCurrentUser();

	if (!localMedia) throw new Error('No local media currently captured');

	await localMedia.then((localStream) => {
		for (const track of localStream.getTracks())
			currentPeerConnection.addTrack(track, localStream);
	});

	await currentPeerConnection.createOffer().then(async (offer) => {
		await currentPeerConnection.setLocalDescription(offer);
	});

	peerConnectionsArray[peerConnectionIndex] = currentPeerConnection;

	if (!currentPeerConnection.localDescription)
		throw new Error('No localDescription set');

	return {
		type: 'offer',
		data: {
			offer: currentPeerConnection.localDescription,
			recipient,
			caller,
			// eslint-disable-next-line @typescript-eslint/naming-convention -- wire property name is fixed by the backend signalling protocol
			callID: callId,
			currentUserEmail,
		},
	};
}

export async function getLocalMedia(
	// eslint-disable-next-line @typescript-eslint/no-restricted-types -- React DOM refs are null-based, not undefined-based
	localVideoRef: React.RefObject<HTMLVideoElement | null>,
) {
	if (localMedia) throw new Error('Already capturing local media');
	localMedia = navigator.mediaDevices
		.getUserMedia(mediaConstraints)
		.then((localStream) => {
			if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
			return localStream;
		});
}

export async function establishWebSocketServerConn(callUrl: string) {
	websocket = new WebSocket(callUrl);
}

export async function closeWebSocketServerConn(callId: string) {
	try {
		if (!websocket) return;
		websocket.close();
	} catch (error) {
		console.error(
			`Error trying to close web socket connection for call ${callId}:`,
			error,
		);
	}
}

export async function attachWsConnListeners(
	callerEmail: string,
	remoteVideoRefs: React.RefObject<HTMLVideoElement[]>,
	addChatMessage: (message: string) => void,
	addParticipant: (name: string) => void,
	removeParticipant: (name: string) => void,
	addRemoteVideo: AddRemoteVideoFn,
	isParticipant: (name: string) => boolean,
	getCurrentUser: () => string,
) {
	if (!websocket) {
		console.error('No active websocket connection configured');
		return;
	}

	async function handleWsMessage(event: MessageEvent) {
		const parsed: unknown = JSON.parse(String(event.data));
		if (!isWsIncomingMessage(parsed)) {
			console.error('Received malformed websocket message:', parsed);
			return;
		}

		const message = parsed;

		switch (message.type) {
			case 'receivedNewParticipantNotif':
			case 'chatMessage': {
				const {data} = message;
				addChatMessage(`${data.email}: ${data.message}`);
				break;
			}

			case 'responseCurrentCallParticipants': {
				const {participants, callID: callId} = message.data;
				if (participants.length > 0) {
					for (const p of participants) {
						otherCallParticipants.push(p);
						addParticipant(p);
					}

					await Promise.all(
						participants.map(async (participant) => {
							const offer = await sendOffer(
								callerEmail,
								participant,
								callId,
								remoteVideoRefs,
								addRemoteVideo,
								isParticipant,
								getCurrentUser,
							);
							sendMessage(offer);
						}),
					);
				}

				break;
			}

			case 'offer': {
				const {caller, recipient, offer, callID: callId} = message.data;
				const {currentPeerConnection, peerConnectionIndex} =
					isExistingPeerConnection(
						'receivingOffer',
						caller,
						recipient,
						callId,
						addRemoteVideo,
						remoteVideoRefs,
						isParticipant,
						getCurrentUser,
					);
				await currentPeerConnection.setRemoteDescription({
					type: offer.type,
					sdp: offer.sdp,
				});
				if (!localMedia) throw new Error('No local media currently captured');
				await localMedia.then((localStream) => {
					for (const track of localStream.getTracks())
						currentPeerConnection.addTrack(track, localStream);
				});
				await currentPeerConnection.createAnswer().then(async (answer) => {
					await currentPeerConnection.setLocalDescription(answer);
				});
				peerConnectionsArray[peerConnectionIndex] = currentPeerConnection;
				sendMessage({
					type: 'answer',
					data: {
						caller,
						recipient,
						answer: currentPeerConnection.localDescription,
						// eslint-disable-next-line @typescript-eslint/naming-convention -- wire property name is fixed by the backend signalling protocol
						callID: callId,
					},
				});
				break;
			}

			case 'answer': {
				const {caller, recipient, answer, callID: callId} = message.data;
				const {currentPeerConnection, peerConnectionIndex} =
					isExistingPeerConnection(
						'receivingAnswer',
						caller,
						recipient,
						callId,
						addRemoteVideo,
						remoteVideoRefs,
						isParticipant,
						getCurrentUser,
					);
				await currentPeerConnection.setRemoteDescription({
					type: answer.type,
					sdp: answer.sdp,
				});
				peerConnectionsArray[peerConnectionIndex] = currentPeerConnection;
				break;
			}

			case 'candidate': {
				const {candidate, caller} = message.data;
				const idx = peerConnectionsArray.findIndex(
					(pc) => pc.peerUser === caller,
				);
				if (peerConnectionsArray[idx]) {
					await peerConnectionsArray[idx].addIceCandidate(
						new RTCIceCandidate(candidate),
					);
				}

				break;
			}

			case 'participantLeftCall': {
				const {message: leaveMessage, email} = message.data;
				addChatMessage(`${email}: ${leaveMessage}`);
				removeParticipant(email);
				break;
			}
		}
	}

	websocket.addEventListener('message', (event) => {
		handleWsMessage(event).catch((error: unknown) => {
			console.error('Error handling websocket message:', error);
		});
	});
}

export function sendJoiningMessage(
	usernameInput: string,
	emailInput: string,
	callId: string,
) {
	if (!websocket) return;
	websocket.addEventListener('open', () => {
		sendMessage({
			type: 'newParticipantOnCall',
			// eslint-disable-next-line @typescript-eslint/naming-convention -- wire property name is fixed by the backend signalling protocol
			data: {username: usernameInput, email: emailInput, callID: callId},
		});
	});
}

export function sendChatMessageToCall(
	message: string,
	callId: string,
	emailInput: string,
) {
	if (!websocket) return;
	sendMessage({
		type: 'chatMessage',
		// eslint-disable-next-line @typescript-eslint/naming-convention -- wire property name is fixed by the backend signalling protocol
		data: {email: emailInput, message, callID: callId},
	});
}

export async function connectToCall(
	callUrl: string,
	callId: string,
	email: string,
	username: string,
	// eslint-disable-next-line @typescript-eslint/no-restricted-types -- React DOM refs are null-based, not undefined-based
	localVideoRef: React.RefObject<HTMLVideoElement | null>,
	remoteVideoRefs: React.RefObject<HTMLVideoElement[]>,
	addChatMessage: (message: string) => void,
	addParticipant: (name: string) => void,
	removeParticipant: (name: string) => void,
	addRemoteVideo: AddRemoteVideoFn,
	isParticipant: (name: string) => boolean,
	getCurrentUser: () => string,
	callIceServers: RTCIceServer[] = defaultIceServers,
) {
	iceServers = callIceServers;
	await getLocalMedia(localVideoRef);
	await establishWebSocketServerConn(callUrl);
	await attachWsConnListeners(
		email,
		remoteVideoRefs,
		addChatMessage,
		addParticipant,
		removeParticipant,
		addRemoteVideo,
		isParticipant,
		getCurrentUser,
	);
	sendJoiningMessage(username, email, callId);
}

export async function closeConns(
	remoteVideoRefs: React.RefObject<HTMLVideoElement[]>,
	updateRemoteVideo: (peerUser: string, stream: MediaStream) => void,
	getRemoteVideo: (
		peerUser: string,
	) => {peerUser: string; stream: MediaStream} | undefined,
	callId: string,
	email: string,
) {
	async function handleClosePeerConn(pc: ExtendedRtcPeerConnection) {
		pc.ontrack = null;
		pc.onicecandidate = null;
		pc.oniceconnectionstatechange = null;
		pc.onsignalingstatechange = null;
		pc.onicegatheringstatechange = null;
		pc.onnegotiationneeded = null;
	}

	async function handleCloseVideoElement(peerUser: string) {
		const remoteVideo = getRemoteVideo(peerUser);

		if (!remoteVideo) {
			throw new Error(`Can't find video element to close for peer ${peerUser}`);
		}

		const {stream} = remoteVideo;

		const closedStream = stream;

		if (!closedStream) {
			throw new Error(`Can't find video element to close for peer ${peerUser}`);
		}

		for (const track of closedStream.getTracks()) {
			track.stop();
		}

		updateRemoteVideo(peerUser, closedStream);
	}

	try {
		console.log(`Closing connections for call ${callId} (user ${email})`);
		await Promise.all(
			peerConnectionsArray.map(async (pc) => {
				const {peerUser} = pc;
				if (!peerUser) {
					throw new Error('no peerUser defined');
				}

				await handleClosePeerConn(pc);
				await handleCloseVideoElement(peerUser);

				pc.close();
			}),
		);

		peerConnectionsArray.length = 0;
	} catch (error) {
		console.error('Error while closing connections:', error);
	}
}
