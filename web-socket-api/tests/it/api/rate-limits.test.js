import assert from 'node:assert/strict';
import process from 'node:process';
import {before, describe, it} from 'node:test';
import supertest from 'supertest';

// Read when the rate limiters are created, so set before the app is imported
// (this file runs in its own process).
process.env.SIGNUP_RATE_LIMIT_PER_HOUR = '2';
process.env.ICE_SERVERS_RATE_LIMIT_PER_HOUR = '2';
const {app, login, resetDatabase, signup, uniqueUser} =
	await import('./helpers.js');

const tooManyRequests = {success: false, data: {error: 'Too many requests'}};
// Uses the first of the 2 signups allowed.
const existingUser = uniqueUser();

before(async () => {
	await resetDatabase();
	const response = await signup(existingUser);
	assert.equal(response.status, 201);
});

describe('rate limits', () => {
	it('refuses signups past the hourly limit shared by all clients', async () => {
		const allowed = await signup(uniqueUser());
		assert.equal(allowed.status, 201);

		const response = await signup(uniqueUser());

		assert.equal(response.status, 429);
		assert.deepEqual(response.body, tooManyRequests);
	});

	it("refuses a user's ICE server requests past their hourly limit", async () => {
		const agent = supertest.agent(app);
		const loginResponse = await login(agent, existingUser);
		const requestIceServers = async () =>
			supertest(app)
				.get('/call/ice-servers')
				.set('Authorization', `Bearer ${loginResponse.body.data.token}`);

		for (let request = 0; request < 2; request++) {
			// eslint-disable-next-line no-await-in-loop -- counted in order
			const allowed = await requestIceServers();
			assert.equal(allowed.status, 200);
		}

		const response = await requestIceServers();

		assert.equal(response.status, 429);
		assert.deepEqual(response.body, tooManyRequests);
	});
});
