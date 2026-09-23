import assert from 'node:assert/strict';
import {beforeEach, describe, it} from 'node:test';
import supertest from 'supertest';
import {
	app,
	Call,
	CallParticipants,
	resetDatabase,
	signupAndLogin,
	activateCallParticipant,
} from './helpers.js';

beforeEach(async () => {
	await resetDatabase();
});

describe('POST /call/create', () => {
	it('creates a call and persists a Call row plus a pending CallParticipants row', async () => {
		const {accessToken, email} = await signupAndLogin();

		const response = await supertest(app)
			.post('/call/create')
			.set('Authorization', `Bearer ${accessToken}`);

		assert.equal(response.status, 201);
		assert.equal(response.body.success, true);
		assert.match(
			response.body.data.callID,
			/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iv,
		);
		assert.deepEqual(Object.keys(response.body.data), ['callID']);

		const callRow = await Call.findByPk(response.body.data.callID);
		assert.ok(callRow, 'expected the Call row to be persisted');

		const participantRow = await CallParticipants.findOne({
			where: {callCallID: response.body.data.callID, userEmail: email},
		});
		assert.ok(
			participantRow,
			'expected a CallParticipants row for the creator',
		);
		assert.equal(participantRow.status, 'pending');
	});

	it('returns 401 without an access token', async () => {
		const response = await supertest(app).post('/call/create');
		assert.equal(response.status, 401);
	});
});

describe('PUT /call/:callID/join', () => {
	it('joins an existing open call', async () => {
		const creator = await signupAndLogin();
		const createResponse = await supertest(app)
			.post('/call/create')
			.set('Authorization', `Bearer ${creator.accessToken}`);
		const {callID} = createResponse.body.data;

		const joiner = await signupAndLogin();
		const response = await supertest(app)
			.put(`/call/${callID}/join`)
			.set('Authorization', `Bearer ${joiner.accessToken}`);

		assert.equal(response.status, 201);
		assert.equal(response.body.success, true);
		assert.deepEqual(response.body.data, {callID});

		const participantRow = await CallParticipants.findOne({
			where: {callCallID: callID, userEmail: joiner.email},
		});
		assert.ok(participantRow, 'expected a CallParticipants row for the joiner');
	});

	it('returns 400 for a malformed callID', async () => {
		const {accessToken} = await signupAndLogin();

		const response = await supertest(app)
			.put('/call/not-a-uuid/join')
			.set('Authorization', `Bearer ${accessToken}`);

		assert.equal(response.status, 400);
		assert.equal(response.body.data.error, 'No Call ID passed');
	});

	it('returns 404 for a call that does not exist', async () => {
		const {accessToken} = await signupAndLogin();

		const response = await supertest(app)
			.put('/call/00000000-0000-0000-0000-000000000000/join')
			.set('Authorization', `Bearer ${accessToken}`);

		assert.equal(response.status, 404);
		assert.equal(response.body.data.error, 'Call ID not present');
	});

	it('returns 400 for a call that has already finished', async () => {
		const creator = await signupAndLogin();
		const createResponse = await supertest(app)
			.post('/call/create')
			.set('Authorization', `Bearer ${creator.accessToken}`);
		const {callID} = createResponse.body.data;

		await Call.update({finishedAt: new Date()}, {where: {callID}});

		const joiner = await signupAndLogin();
		const response = await supertest(app)
			.put(`/call/${callID}/join`)
			.set('Authorization', `Bearer ${joiner.accessToken}`);

		assert.equal(response.status, 400);
		assert.equal(response.body.data.error, 'Call has ended');
	});
});

describe('DELETE /call/:callID/leave', () => {
	// ActiveCall only becomes true once a participant actually connects to
	// the call's WebSocket server (see call/utils/misc.js —
	// handleNewCallParticipantMessage); activateCallParticipant simulates
	// that without a real WS client, matching how call.test.js already
	// simulates a finished call by writing finishedAt directly.
	it('removes a non-last participant without shutting the call down', async () => {
		const creator = await signupAndLogin();
		const createResponse = await supertest(app)
			.post('/call/create')
			.set('Authorization', `Bearer ${creator.accessToken}`);
		const {callID} = createResponse.body.data;
		await activateCallParticipant(callID, creator.email);

		const joiner = await signupAndLogin();
		await supertest(app)
			.put(`/call/${callID}/join`)
			.set('Authorization', `Bearer ${joiner.accessToken}`);
		await activateCallParticipant(callID, joiner.email);

		const response = await supertest(app)
			.delete(`/call/${callID}/leave`)
			.set('Authorization', `Bearer ${creator.accessToken}`);

		assert.equal(response.status, 200);

		const creatorRow = await CallParticipants.findOne({
			where: {callCallID: callID, userEmail: creator.email},
		});
		assert.equal(creatorRow, null, 'expected the leaver to be removed');

		const callRow = await Call.findByPk(callID);
		assert.equal(
			callRow.activeCall,
			true,
			'expected the call to stay active for the remaining participant',
		);
	});

	it('finalises and shuts down the call when the last participant leaves', async () => {
		const creator = await signupAndLogin();
		const createResponse = await supertest(app)
			.post('/call/create')
			.set('Authorization', `Bearer ${creator.accessToken}`);
		const {callID} = createResponse.body.data;
		await activateCallParticipant(callID, creator.email);

		const response = await supertest(app)
			.delete(`/call/${callID}/leave`)
			.set('Authorization', `Bearer ${creator.accessToken}`);

		assert.equal(response.status, 200);

		const participantRow = await CallParticipants.findOne({
			where: {callCallID: callID, userEmail: creator.email},
		});
		assert.equal(participantRow, null, 'expected the leaver to be removed');

		const callRow = await Call.findByPk(callID);
		assert.equal(callRow.activeCall, false);
		assert.ok(callRow.finishedAt, 'expected finishedAt to be set');
	});

	it('returns 400 "Call is not active" for a freshly created call', async () => {
		const {accessToken} = await signupAndLogin();
		const createResponse = await supertest(app)
			.post('/call/create')
			.set('Authorization', `Bearer ${accessToken}`);
		const {callID} = createResponse.body.data;

		const response = await supertest(app)
			.delete(`/call/${callID}/leave`)
			.set('Authorization', `Bearer ${accessToken}`);

		assert.equal(response.status, 400);
		assert.equal(response.body.data.error, 'Call is not active');
	});

	it('returns 404 for a call that does not exist', async () => {
		const {accessToken} = await signupAndLogin();

		const response = await supertest(app)
			.delete('/call/00000000-0000-0000-0000-000000000000/leave')
			.set('Authorization', `Bearer ${accessToken}`);

		assert.equal(response.status, 404);
	});

	it('returns 400 for a malformed callID', async () => {
		const {accessToken} = await signupAndLogin();

		const response = await supertest(app)
			.delete('/call/not-a-uuid/leave')
			.set('Authorization', `Bearer ${accessToken}`);

		assert.equal(response.status, 400);
	});
});

describe('POST /call/:callID/messages', () => {
	it('returns 501 Not Implemented', async () => {
		const {accessToken} = await signupAndLogin();
		const createResponse = await supertest(app)
			.post('/call/create')
			.set('Authorization', `Bearer ${accessToken}`);
		const {callID} = createResponse.body.data;

		const response = await supertest(app)
			.post(`/call/${callID}/messages`)
			.set('Authorization', `Bearer ${accessToken}`);

		assert.equal(response.status, 501);
	});

	it('returns 401 without an access token', async () => {
		const response = await supertest(app).post(
			'/call/00000000-0000-0000-0000-000000000000/messages',
		);
		assert.equal(response.status, 401);
	});
});
