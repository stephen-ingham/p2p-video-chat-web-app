import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import process from 'node:process';
import {afterEach, beforeEach, describe, it} from 'node:test';
import supertest from 'supertest';
import {
	DEFAULT_STUN_URLS,
	TURN_CREDENTIAL_TTL_SECS,
} from '../../../src/call/utils/ice-servers.js';
import {app, resetDatabase, signupAndLogin} from './helpers.js';

const turnEnvironmentKeys = ['TURN_URLS', 'TURN_SECRET'];
let savedTurnEnvironment;

beforeEach(async () => {
	await resetDatabase();
	savedTurnEnvironment = Object.fromEntries(
		turnEnvironmentKeys.map((key) => [key, process.env[key]]),
	);
});

afterEach(() => {
	for (const key of turnEnvironmentKeys) {
		if (savedTurnEnvironment[key] === undefined) delete process.env[key];
		else process.env[key] = savedTurnEnvironment[key];
	}
});

async function requestIceServers(accessToken) {
	return supertest(app)
		.get('/call/ice-servers')
		.set('Authorization', `Bearer ${accessToken}`);
}

describe('GET /call/ice-servers', () => {
	it('returns 401 without an access token', async () => {
		const response = await supertest(app).get('/call/ice-servers');
		assert.equal(response.status, 401);
	});

	it('falls back to public Google STUN servers when no TURN server is configured', async () => {
		delete process.env.TURN_URLS;
		delete process.env.TURN_SECRET;
		const {accessToken} = await signupAndLogin();

		const response = await requestIceServers(accessToken);

		assert.equal(response.status, 200);
		assert.deepEqual(response.body, {
			success: true,
			data: {iceServers: [{urls: DEFAULT_STUN_URLS}]},
		});
	});

	it('returns the self-hosted STUN/TURN URLs with coturn REST API credentials when configured', async () => {
		process.env.TURN_URLS =
			'stun:turn.example.com:3478, turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp';
		process.env.TURN_SECRET = 'test-turn-secret';
		const {accessToken, email} = await signupAndLogin();

		const beforeSecs = Math.floor(Date.now() / 1000);
		const response = await requestIceServers(accessToken);

		assert.equal(response.status, 200);
		const [stunServer, turnServer] = response.body.data.iceServers;
		assert.equal(response.body.data.iceServers.length, 2);
		assert.deepEqual(stunServer, {urls: ['stun:turn.example.com:3478']});
		assert.deepEqual(turnServer.urls, [
			'turn:turn.example.com:3478?transport=udp',
			'turn:turn.example.com:3478?transport=tcp',
		]);

		// Username is `<expiry>:<user>`; the password must be exactly what
		// coturn will recompute from the shared secret, or relaying fails.
		const [expiry, user] = turnServer.username.split(/:(.*)/sv);
		assert.equal(user, email);
		assert.ok(
			Number(expiry) >= beforeSecs + TURN_CREDENTIAL_TTL_SECS,
			'expected credentials to expire TURN_CREDENTIAL_TTL_SECS from now',
		);
		const expectedCredential = crypto
			.createHmac('sha1', 'test-turn-secret')
			.update(turnServer.username)
			.digest('base64');
		assert.equal(turnServer.credential, expectedCredential);
	});
});
