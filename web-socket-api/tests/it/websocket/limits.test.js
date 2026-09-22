import assert from 'node:assert/strict';
import process from 'node:process';
import {after, before, beforeEach, describe, it} from 'node:test';
import supertest from 'supertest';
import {app, resetDatabase, signupAndLogin} from '../api/helpers.js';
import {
	startServer,
	stopServer,
	connectToCall,
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

async function createCall() {
	const creator = await signupAndLogin();
	const createResponse = await supertest(app)
		.post('/call/create')
		.set('Authorization', `Bearer ${creator.accessToken}`);
	return createResponse.body.data.callID;
}

describe('maxPayload', () => {
	// Call/utils/ws-server.js sets maxPayload: 64 * 1024.
	it('closes the connection with 1009 when a message exceeds the limit', async () => {
		const callID = await createCall();
		const ws = await connectToCall(port, callID);

		const closePromise = waitForClose(ws);
		ws.send('x'.repeat(65 * 1024));

		const {code} = await closePromise;
		assert.equal(code, 1009);
	});
});

describe('Origin verification in production', () => {
	// VerifyClient (call/utils/misc.js) only enforces ALLOWED_ORIGIN when
	// NODE_ENV === 'production'; toggled here for the duration of each test.
	async function withProductionOrigin(allowedOrigin, run) {
		const originalNodeEnv = process.env.NODE_ENV;
		const originalAllowedOrigin = process.env.ALLOWED_ORIGIN;
		process.env.NODE_ENV = 'production';
		process.env.ALLOWED_ORIGIN = allowedOrigin;

		try {
			await run();
		} finally {
			process.env.NODE_ENV = originalNodeEnv;
			process.env.ALLOWED_ORIGIN = originalAllowedOrigin;
		}
	}

	it('rejects a connection whose Origin does not match ALLOWED_ORIGIN', async () => {
		const callID = await createCall();

		await withProductionOrigin('https://allowed.example', async () => {
			await assert.rejects(
				connectToCall(port, callID, {origin: 'https://not-allowed.example'}),
			);
		});
	});

	it('accepts a connection whose Origin matches ALLOWED_ORIGIN', async () => {
		const callID = await createCall();

		await withProductionOrigin('https://allowed.example', async () => {
			const ws = await connectToCall(port, callID, {
				origin: 'https://allowed.example',
			});
			ws.close();
		});
	});
});
