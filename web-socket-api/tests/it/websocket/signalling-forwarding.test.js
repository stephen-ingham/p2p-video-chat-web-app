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

async function setUpTwoParticipants() {
	const alice = await signupAndLogin();
	const bob = await signupAndLogin();

	const createResponse = await supertest(app)
		.post('/call/create')
		.set('Authorization', `Bearer ${alice.accessToken}`);
	const {callID} = createResponse.body.data;

	await supertest(app)
		.put(`/call/${callID}/join`)
		.set('Authorization', `Bearer ${bob.accessToken}`);

	const aliceWs = await connectToCall(port, callID);
	await joinCall(aliceWs, {
		email: alice.email,
		username: alice.username,
		callID,
	});
	const bobWs = await connectToCall(port, callID);
	await joinCall(bobWs, {email: bob.email, username: bob.username, callID});

	return {alice, bob, aliceWs, bobWs, callID};
}

describe('SDP offer/answer and ICE candidate forwarding', () => {
	it('relays an offer from caller to the named recipient', async () => {
		const {alice, bob, aliceWs, bobWs, callID} = await setUpTwoParticipants();

		aliceWs.send(
			JSON.stringify({
				type: 'offer',
				data: {
					offer: 'sdp-offer',
					caller: alice.email,
					recipient: bob.email,
					callID,
				},
			}),
		);

		const received = await nextMessage(
			bobWs,
			(message) => message.type === 'offer',
		);
		assert.equal(received.data.offer, 'sdp-offer');
		assert.equal(received.data.caller, alice.email);
	});

	it('relays an answer from recipient back to the caller', async () => {
		const {alice, bob, aliceWs, bobWs, callID} = await setUpTwoParticipants();

		bobWs.send(
			JSON.stringify({
				type: 'answer',
				data: {
					answer: 'sdp-answer',
					caller: alice.email,
					recipient: bob.email,
					callID,
				},
			}),
		);

		const received = await nextMessage(
			aliceWs,
			(message) => message.type === 'answer',
		);
		assert.equal(received.data.answer, 'sdp-answer');
	});

	it('relays an ICE candidate to the named recipient', async () => {
		const {alice, bob, aliceWs, bobWs, callID} = await setUpTwoParticipants();

		aliceWs.send(
			JSON.stringify({
				type: 'candidate',
				data: {
					candidate: 'ice-candidate',
					caller: alice.email,
					recipient: bob.email,
					callID,
				},
			}),
		);

		const received = await nextMessage(
			bobWs,
			(message) => message.type === 'candidate',
		);
		assert.equal(received.data.candidate, 'ice-candidate');
	});

	it('does not forward an offer that is missing a recipient', async () => {
		const {alice, bob, aliceWs, bobWs, callID} = await setUpTwoParticipants();

		// Malformed: no `recipient`, so there's nothing to route it to. Sent
		// on the same connection immediately before a well-formed offer — WS
		// message ordering on a single connection guarantees the server sees
		// this one first, so if it were (wrongly) forwarded it would arrive
		// at bob before the well-formed one.
		aliceWs.send(
			JSON.stringify({
				type: 'offer',
				data: {offer: 'malformed', caller: alice.email, callID},
			}),
		);
		aliceWs.send(
			JSON.stringify({
				type: 'offer',
				data: {
					offer: 'well-formed',
					caller: alice.email,
					recipient: bob.email,
					callID,
				},
			}),
		);

		const received = await nextMessage(
			bobWs,
			(message) => message.type === 'offer',
		);
		assert.equal(
			received.data.offer,
			'well-formed',
			'the malformed offer should not have been forwarded',
		);
	});
});
