import assert from 'node:assert/strict';
import {before, beforeEach, describe, it} from 'node:test';
import supertest from 'supertest';
import {
	app,
	User,
	RefreshToken,
	CallParticipants,
	resetDatabase,
	signup,
	login,
	signupAndLogin,
	uniqueUser,
	activateCallParticipant,
} from './helpers.js';

before(async () => {
	await resetDatabase();
});

beforeEach(async () => {
	await resetDatabase();
});

describe('POST /auth/signup', () => {
	it('creates a user and returns 201', async () => {
		const user = uniqueUser();
		const response = await signup(user);

		assert.equal(response.status, 201);
		assert.deepEqual(response.body, {
			success: true,
			data: {message: 'Succesful sign up'},
		});
	});

	it('stores the password bcrypt-hashed, not in plaintext', async () => {
		const user = uniqueUser();
		await signup(user);

		const row = await User.findByPk(user.email);
		assert.ok(row, 'expected the User row to be persisted');
		assert.notEqual(row.password, user.password);
		assert.match(row.password, /^\$2[aby]\$\d{2}\$.{53}$/v);
	});

	it('returns 400 for a username that is too short', async () => {
		const response = await signup(uniqueUser({username: 'ab'}));

		assert.equal(response.status, 400);
		assert.equal(response.body.success, false);
		assert.equal(response.body.data.message, 'Invalid input');
		assert.ok(Array.isArray(response.body.data.details));
	});

	it('returns 400 for an invalid email', async () => {
		const response = await signup(uniqueUser({email: 'not-an-email'}));

		assert.equal(response.status, 400);
		assert.equal(response.body.data.message, 'Invalid input');
	});

	it('returns 400 for a password that is too short', async () => {
		const response = await signup(uniqueUser({password: 'short'}));

		assert.equal(response.status, 400);
		assert.equal(response.body.data.message, 'Invalid input');
	});

	it('returns 500 on duplicate email (documented current behaviour)', async () => {
		const user = uniqueUser();
		await signup(user);

		const response = await signup(user);

		assert.equal(response.status, 500);
		assert.equal(response.body.success, false);
	});
});

describe('POST /auth/login', () => {
	it('returns an access token and sets the refresh_token cookie', async () => {
		const user = uniqueUser();
		await signup(user);

		const response = await supertest(app)
			.post('/auth/login')
			.send({email: user.email, password: user.password});

		assert.equal(response.status, 200);
		assert.equal(response.body.success, true);
		assert.equal(typeof response.body.data.token, 'string');

		const setCookie = response.headers['set-cookie'] || [];
		const refreshCookie = setCookie.find((cookie) =>
			cookie.startsWith('refresh_token='),
		);
		assert.ok(refreshCookie, 'expected a refresh_token cookie to be set');
		assert.match(refreshCookie, /httponly/iv);
		assert.match(refreshCookie, /path=\/auth/iv);
	});

	it('returns 400 for an unknown email', async () => {
		const response = await login(supertest.agent(app), {
			email: 'nobody@example.com',
			password: 'whatever123',
		});

		assert.equal(response.status, 400);
		assert.equal(response.body.data.message, 'Invalid credentials');
	});

	it('returns 400 for the wrong password with the same message as unknown email', async () => {
		const user = uniqueUser();
		await signup(user);

		const response = await login(supertest.agent(app), {
			email: user.email,
			password: 'WrongPassword1',
		});

		assert.equal(response.status, 400);
		assert.equal(response.body.data.message, 'Invalid credentials');
	});
});

describe('POST /auth/logout', () => {
	it('returns 200 and revokes the correct refresh token', async () => {
		const {agent, accessToken, email} = await signupAndLogin();

		const before_ = await RefreshToken.findOne({
			where: {userEmail: email},
		});
		assert.ok(before_, 'expected a persisted refresh token after login');
		assert.equal(before_.revokedAt, null);

		const response = await agent
			.post('/auth/logout')
			.set('Authorization', `Bearer ${accessToken}`);

		assert.equal(response.status, 200);
		assert.deepEqual(response.body, {
			success: true,
			data: {message: 'Logged out succesfully'},
		});

		const after = await RefreshToken.findByPk(before_.id);
		assert.ok(after.revokedAt, 'expected the logged-out token to be revoked');
	});

	it('removes the user from any calls they are actively on', async () => {
		const {agent, accessToken, email} = await signupAndLogin();
		const createResponse = await supertest(app)
			.post('/call/create')
			.set('Authorization', `Bearer ${accessToken}`);
		const {callID} = createResponse.body.data;
		await activateCallParticipant(callID, email);

		await agent
			.post('/auth/logout')
			.set('Authorization', `Bearer ${accessToken}`);

		const participantRow = await CallParticipants.findOne({
			where: {callCallID: callID, userEmail: email},
		});
		assert.equal(
			participantRow,
			null,
			'expected the CallParticipants row to be removed',
		);
	});

	it('returns 401 without an access token', async () => {
		const response = await supertest(app).post('/auth/logout');

		assert.equal(response.status, 401);
	});

	it('returns 401 for an invalid access token', async () => {
		const response = await supertest(app)
			.post('/auth/logout')
			.set('Authorization', 'Bearer not-a-real-token');

		assert.equal(response.status, 401);
	});
});

describe('POST /auth/refresh', () => {
	it('rotates the refresh token and issues a new access token', async () => {
		const {agent, accessToken, email} = await signupAndLogin();

		const before_ = await RefreshToken.findOne({
			where: {userEmail: email},
		});

		const response = await agent
			.post('/auth/refresh')
			.set('Authorization', `Bearer ${accessToken}`);

		assert.equal(response.status, 200);
		assert.equal(response.body.success, true);
		assert.equal(typeof response.body.data.accessToken, 'string');

		const oldRow = await RefreshToken.findByPk(before_.id);
		assert.ok(oldRow.revokedAt, 'expected the old refresh token to be revoked');

		const rowCount = await RefreshToken.count({where: {userEmail: email}});
		assert.equal(rowCount, 2, 'expected the old row plus a newly rotated row');
	});

	it('returns 401 when there is no refresh_token cookie', async () => {
		const {accessToken} = await signupAndLogin();

		const response = await supertest(app)
			.post('/auth/refresh')
			.set('Authorization', `Bearer ${accessToken}`);

		assert.equal(response.status, 401);
	});

	it('returns 401 when the access token is missing, even with a valid refresh cookie (documented limitation: /auth/refresh is gated by the access-token check middleware)', async () => {
		const {agent} = await signupAndLogin();

		const response = await agent.post('/auth/refresh');

		assert.equal(response.status, 401);
	});
});
