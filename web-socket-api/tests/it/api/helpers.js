import {Buffer} from 'node:buffer';
import supertest from 'supertest';
import {app} from '../../../src/app.js';
import {
	User,
	Call,
	CallParticipants,
	RefreshToken,
} from '../../../src/common/models/index.js';

export async function resetDatabase() {
	await CallParticipants.destroy({where: {}});
	await RefreshToken.destroy({where: {}});
	await Call.destroy({where: {}});
	await User.destroy({where: {}});
}

let userCounter = 0;

export function uniqueUser(overrides = {}) {
	userCounter += 1;
	const suffix = `${Date.now()}${userCounter}`;
	return {
		username: `testuser${suffix}`,
		email: `testuser${suffix}@example.com`,
		password: 'Password123',
		...overrides,
	};
}

export async function signup(user) {
	return supertest(app).post('/auth/signup').send(user);
}

export async function login(agent, {email, password}) {
	return agent.post('/auth/login').send({email, password});
}

// Creates a user, logs in via a cookie-jar-backed agent, and returns
// everything needed to exercise authenticated routes and cookie-based flows.
export async function signupAndLogin(overrides = {}) {
	const user = uniqueUser(overrides);
	const agent = supertest.agent(app);

	await signup(user);
	const loginResponse = await login(agent, user);
	const accessToken = loginResponse.body.data.token;

	return {...user, agent, accessToken};
}

// Reads a JWT's claims without verifying the signature — sufficient for
// asserting on token contents in tests where the app itself already owns
// signing/verification.
export function decodeJwtPayload(token) {
	const [, payload] = token.split('.');
	return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

// Simulates a participant having actually connected to the call's WebSocket
// server (which normally flips these fields — see
// call/utils/misc.js:handleNewCallParticipantMessage) without needing a real
// WS client in HTTP-only integration tests.
export async function activateCallParticipant(callID, email) {
	await CallParticipants.update(
		{status: 'active'},
		{where: {callCallID: callID, userEmail: email}},
	);
	await Call.update(
		{activeCall: true, startedAt: new Date()},
		{where: {callID}},
	);
}

export {app} from '../../../src/app.js';
export {
	Call,
	User,
	RefreshToken,
	CallParticipants,
} from '../../../src/common/models/index.js';
