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
	waitForClose,
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

describe('a new participant joining a call', () => {
	it('sends receivedNewParticipantNotif to existing participants', async () => {
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

		const notifPromise = nextMessage(
			aliceWs,
			(message) => message.type === 'receivedNewParticipantNotif',
		);

		const bobWs = await connectToCall(port, callID);
		await joinCall(bobWs, {email: bob.email, username: bob.username, callID});

		const notif = await notifPromise;
		assert.equal(notif.data.email, bob.email);

		aliceWs.close();
		bobWs.close();
	});
});

describe('the last participant leaving a call', () => {
	it('shuts down the call WebSocket server', async () => {
		const creator = await signupAndLogin();
		const createResponse = await supertest(app)
			.post('/call/create')
			.set('Authorization', `Bearer ${creator.accessToken}`);
		const {callID} = createResponse.body.data;

		const ws = await connectToCall(port, callID);
		await joinCall(ws, {
			email: creator.email,
			username: creator.username,
			callID,
		});

		const closePromise = waitForClose(ws);

		await supertest(app)
			.delete(`/call/${callID}/leave`)
			.set('Authorization', `Bearer ${creator.accessToken}`);

		const {code} = await closePromise;
		assert.equal(code, 1001);

		// Once shut down, the call's callID no longer maps to a live server, so
		// a further connection attempt is rejected at the upgrade step.
		await assert.rejects(connectToCall(port, callID));
	});
});
