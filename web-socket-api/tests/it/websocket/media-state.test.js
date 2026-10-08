import assert from 'node:assert/strict';
import {after, before, beforeEach, describe, it} from 'node:test';
import supertest from 'supertest';
import {app, resetDatabase, signupAndLogin} from '../api/helpers.js';
import {
	startServer,
	stopServer,
	connectToCall,
	joinCall,
	nextMessage,
} from './helpers.js';

let port;

before(async () => {
	port = await startServer();
});

after(async () => {
	await stopServer();
});

beforeEach(async () => {
	await resetDatabase();
});

function sendMediaState(ws, {email, audio, video, callID}) {
	ws.send(
		JSON.stringify({type: 'mediaState', data: {email, audio, video, callID}}),
	);
}

// Resolves with the first message matching `predicate`, or undefined if none
// arrives within `timeoutMs`.
async function maybeNextMessage(ws, predicate, timeoutMs = 300) {
	try {
		return await nextMessage(ws, predicate, timeoutMs);
	} catch {
		return undefined;
	}
}

// Alice creates a call, the others join it over the API (not yet connected).
async function createCallWith(...joiners) {
	const alice = await signupAndLogin();
	const createResponse = await supertest(app)
		.post('/call/create')
		.set('Authorization', `Bearer ${alice.accessToken}`);
	const {callID} = createResponse.body.data;

	const others = [];
	for (let i = 0; i < joiners; i++) {
		// eslint-disable-next-line no-await-in-loop -- signups stay under the rate limit one at a time
		const user = await signupAndLogin();
		// eslint-disable-next-line no-await-in-loop -- see above
		await supertest(app)
			.put(`/call/${callID}/join`)
			.set('Authorization', `Bearer ${user.accessToken}`);
		others.push(user);
	}

	return {callID, alice, others};
}

async function connectAndJoin(user, callID) {
	const ws = await connectToCall(port, callID);
	const response = await joinCall(ws, {
		email: user.email,
		username: user.username,
		callID,
	});
	return {ws, response};
}

describe('mediaState', () => {
	it("forwards a participant's media state to the others, not back to them", async () => {
		const {
			callID,
			alice,
			others: [bob],
		} = await createCallWith(1);
		const {ws: aliceWs} = await connectAndJoin(alice, callID);
		const {ws: bobWs} = await connectAndJoin(bob, callID);

		const isMediaState = (message) => message.type === 'mediaState';
		const aliceReceives = nextMessage(aliceWs, isMediaState);
		const bobReceives = maybeNextMessage(bobWs, isMediaState);

		sendMediaState(bobWs, {
			email: bob.email,
			audio: false,
			video: true,
			callID,
		});

		const forwarded = await aliceReceives;
		assert.deepEqual(forwarded.data, {
			email: bob.email,
			audio: false,
			video: true,
			callID,
		});
		assert.equal(await bobReceives, undefined);

		aliceWs.close();
		bobWs.close();
	});

	it("gives a new participant everyone else's current media state", async () => {
		const {
			callID,
			alice,
			others: [bob, carol],
		} = await createCallWith(2);
		const {ws: aliceWs} = await connectAndJoin(alice, callID);
		const {ws: bobWs} = await connectAndJoin(bob, callID);

		const bobGetsAlice = nextMessage(
			bobWs,
			(message) => message.type === 'mediaState',
		);
		sendMediaState(aliceWs, {
			email: alice.email,
			audio: false,
			video: false,
			callID,
		});
		await bobGetsAlice;

		const aliceGetsBob = nextMessage(
			aliceWs,
			(message) => message.type === 'mediaState',
		);
		sendMediaState(bobWs, {
			email: bob.email,
			audio: true,
			video: false,
			callID,
		});
		// A later toggle replaces the earlier state.
		await aliceGetsBob;
		const aliceGetsBobAgain = nextMessage(
			aliceWs,
			(message) => message.type === 'mediaState',
		);
		sendMediaState(bobWs, {
			email: bob.email,
			audio: false,
			video: true,
			callID,
		});
		await aliceGetsBobAgain;

		const {ws: carolWs, response} = await connectAndJoin(carol, callID);

		assert.deepEqual(response.data.peerMediaStates, {
			[alice.email]: {audio: false, video: false},
			[bob.email]: {audio: false, video: true},
		});

		aliceWs.close();
		bobWs.close();
		carolWs.close();
	});
});
