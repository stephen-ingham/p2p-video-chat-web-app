import process from 'node:process';
import {Call, CallParticipants, Op} from '../../common/models/index.js';
import {wss} from './session-store.js';

export async function getRelevantWSS(callID) {
	try {
		console.log('trying to find wss for:', callID);
		const activeWSS = wss.get(callID) ?? null;

		if (!activeWSS) {
			throw new Error('No wss object found for callID');
		}

		console.log(`found a wss object for the call with ID ${callID}!`);
		return activeWSS;
	} catch (error) {
		console.error('Error retrieving requested wss object:', error);
	}
}

export async function participantNotOnCall(callID, email) {
	try {
		const participant = await CallParticipants.findOne({
			where: {
				CallCallID: callID,
				UserEmail: email,
			},
		});

		if (participant) {
			return;
		}

		const errorMessage = {
			type: 'error',
			data: {
				message: 'Message validation error',
			},
		};

		return errorMessage;
	} catch (error) {
		throw new Error('Error checking participant is on call', {cause: error});
	}
}

export function verifyClient(info) {
	try {
		const isProd = process.env.NODE_ENV === 'production';
		if (isProd) {
			const allowedOrigins = process.env.ALLOWED_ORIGIN
				? [process.env.ALLOWED_ORIGIN]
				: [];
			// Browsers always send Origin on a WS upgrade, so a missing one means
			// a non-browser client (mirrors the `|| !origin` CORS check in app.js).
			// Origin is only a guard against cross-site browser pages — native
			// clients could spoof it anyway. React Native on Android sends a
			// default Origin derived from the socket URL, so doesn't hit this.
			if (info.origin && !allowedOrigins.includes(info.origin)) {
				console.log(`Rejected unauthorized origin: ${info.origin}`);
				return false;
			}

			return true;
		}

		return true;
	} catch (error) {
		throw new Error(
			'Error occured verifying Origin header on Websocket connection handshake',
			{cause: error},
		);
	}
}

export function constructURI(callID) {
	const isProd = process.env.NODE_ENV === 'production';
	const host = process.env.NGROK_HOST;
	const isLocal = process.env.LOCAL === 'true';

	if (isProd) {
		// Call WebSocket servers share the app's single listening port (3000) via
		// noServer + the HTTP server's 'upgrade' event, so the URL is path-based
		// rather than per-call-port, same shape as the dev/ngrok URL below.
		const allowedOrigin = process.env.ALLOWED_ORIGIN;
		return `${allowedOrigin.replace('https://', 'wss://')}/wss/${callID}`;
	}

	if (!host && isLocal) {
		return `http://localhost:4321/ws/${callID}`;
	}

	return `${host}/wss/${callID}`;
}

export async function sendMessageToAllParticipants(message, callID) {
	try {
		console.log('broadcasting message');

		// Get correct wss server to send messages to joined participants on
		const activeWSS = await getRelevantWSS(callID);

		if (activeWSS.server.clients) {
			for (const client of activeWSS.server.clients) {
				// Check if the connection is fully open
				// eslint-disable-next-line no-await-in-loop -- must send to each client in turn
				if (client.readyState === 1) await client.send(JSON.stringify(message));
			}
		}
	} catch (error) {
		console.error(
			`Error during message broadcast for callID: ${callID}: ${error}`,
		);
	}
}

export async function sendMessageToParticipant(
	targetParticipant,
	message,
	callID,
) {
	try {
		// Get correct wss server to send messages to joined participants on
		const activeWSS = await getRelevantWSS(callID);

		if (activeWSS.server.clients) {
			const participant = [...activeWSS.server.clients].find(
				(client) => client.email === targetParticipant,
			);

			if (!(participant && participant.readyState === 1)) {
				throw new Error(
					'Unable to find participant or participant ws connection not open',
				);
			}

			console.log('Found participant to send msg to:', participant.email);
			participant.send(JSON.stringify(message));
		}
	} catch (error) {
		console.error('Error occurred sending message to websocket client:', error);
	}
}

export async function handleNewCallParticipantMessage(data) {
	try {
		const {username, email, callID} = data;
		console.log('New Participant joined:', username, email, callID);
		console.log(`User ${email} connected to WebSocket server`);
		const newParticipantNotif = {
			type: 'receivedNewParticipantNotif',
			data: {message: `${email} joined chat`, email},
		};

		console.log('About to call broadcast...');
		await sendMessageToAllParticipants(newParticipantNotif, callID);

		// Update status of user from 'pending' to 'active' on the call
		console.log('this is the callID:', callID);
		const currentCallParticipant = await CallParticipants.findOne({
			where: {
				CallCallID: callID,
				UserEmail: email,
			},
		});

		await currentCallParticipant.update({
			status: 'active',
		});

		// First participant to actually connect marks the call itself active —
		// leaveCall and logout's active-call cleanup are gated on this.
		const call = await Call.findByPk(callID);
		if (call && !call.activeCall) {
			await call.update({activeCall: true, startedAt: new Date()});
		}

		// Returning names of current call participants to new participant to establish connections
		const activeUsers = await CallParticipants.findAll({
			where: {
				CallCallID: callID,
				status: 'active',
				userEmail: {
					[Op.ne]: email,
				},
			},
			raw: true,
		});

		if (activeUsers.length > 0) {
			console.log('activeUsers are:', activeUsers[0]);
			const otherCallParticipants = activeUsers.map((user) => user.userEmail);

			const currentCallParticipantsMessage = JSON.stringify({
				type: 'responseCurrentCallParticipants',
				data: {
					participants: otherCallParticipants,
					callID,
					currentUserEmail: email,
				},
			});

			return currentCallParticipantsMessage;
		}

		return JSON.stringify({
			type: 'responseCurrentCallParticipants',
			data: {participants: [], callID, currentUserEmail: email},
		});
	} catch (error) {
		console.error(
			`An error occured when responding to msg of new call participant joining call ${data.callID}: ${error}`,
		);
	}
}

export async function handleNewParticipantOnCall(data, connection) {
	try {
		// Setting new email property on connection (websocket client) object directly for targeting specific messages
		connection.email = data.email;

		// Getting return object to send to client
		const currentCallParticipantsMessage =
			await handleNewCallParticipantMessage(data);
		connection.send(currentCallParticipantsMessage);
	} catch (error) {
		console.error(
			'An error occured forwarding new participant type message:',
			error,
		);
	}
}

export async function handleChatMessage(data) {
	try {
		const {email, message, callID} = data;

		const participantNotOnCallResult = await participantNotOnCall(
			callID,
			email,
		);

		if (participantNotOnCallResult) {
			return sendMessageToParticipant(
				email,
				participantNotOnCallResult,
				callID,
			);
		}

		const newChatMessage = {
			type: 'chatMessage',
			data: {
				message,
				email,
			},
		};

		await sendMessageToAllParticipants(newChatMessage, callID);
	} catch (error) {
		console.error('Error occured forwarding chat message:', error);
	}
}

export async function handleICECandidate(data) {
	try {
		const {caller, recipient, candidate, callID} = data;
		console.log(`User ${caller} sent ICE candidate to ${recipient}`);

		const participantNotOnCallResult = await participantNotOnCall(
			callID,
			caller,
		);

		if (participantNotOnCallResult) {
			return sendMessageToParticipant(
				caller,
				participantNotOnCallResult,
				callID,
			);
		}

		// Prepare message format to return to intended recipient
		const iceCandidateForReceipient = {
			type: 'candidate',
			data: {
				caller,
				recipient,
				candidate,
				callID,
			},
		};

		sendMessageToParticipant(recipient, iceCandidateForReceipient, callID);
	} catch (error) {
		console.error('Error occured forwarding ICE candidate message:', error);
	}
}

export async function handleOffer(data) {
	try {
		const {offer, recipient, caller, callID} = data;
		console.log(
			`User ${caller} sent offer to ${recipient}: ${offer} on call ${callID}`,
		);

		const participantNotOnCallResult = await participantNotOnCall(
			callID,
			caller,
		);

		if (participantNotOnCallResult) {
			return sendMessageToParticipant(
				caller,
				participantNotOnCallResult,
				callID,
			);
		}

		// Prepare message format to return to intended recipient
		const offerMessageToReceipient = {
			type: 'offer',
			data: {
				caller,
				recipient,
				offer,
				callID,
			},
		};

		sendMessageToParticipant(recipient, offerMessageToReceipient, callID);
	} catch (error) {
		console.error('Error occured forwarding offer message:', error);
	}
}

export async function handleAnswer(data) {
	try {
		const {caller, recipient, answer, callID} = data;
		console.log(`User ${recipient} sent answer to ${caller}`);

		const participantNotOnCallResult = await participantNotOnCall(
			callID,
			caller,
		);

		if (participantNotOnCallResult) {
			return sendMessageToParticipant(
				caller,
				participantNotOnCallResult,
				callID,
			);
		}

		// Prepare message format to return to intended recipient
		const answerMessageToCaller = {
			type: 'answer',
			data: {
				caller,
				recipient,
				answer,
				callID,
			},
		};
		sendMessageToParticipant(caller, answerMessageToCaller, callID);
	} catch (error) {
		console.error('Error occured handling forwarding of answer:', error);
	}
}

export async function handleParticipantLeftCall(data) {
	try {
		const {leavingUser, callID} = data;
		const message = `${leavingUser} left the call`;

		const participantNotOnCallResult = await participantNotOnCall(
			callID,
			leavingUser,
		);

		if (participantNotOnCallResult) {
			return sendMessageToParticipant(
				leavingUser,
				participantNotOnCallResult,
				callID,
			);
		}

		const newParticipantLeavingMessage = {
			type: 'participantLeftCall',
			data: {
				message,
				email: leavingUser,
			},
		};

		await sendMessageToAllParticipants(newParticipantLeavingMessage, callID);
	} catch (error) {
		console.error('Error occured handling forwarding of answer:', error);
	}
}
