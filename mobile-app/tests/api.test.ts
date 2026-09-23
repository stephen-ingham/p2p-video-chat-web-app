/* eslint-disable @typescript-eslint/naming-convention -- object literals mirror the API's wire format (callID, Authorization) */
import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals';
import * as api from '../src/lib/api.ts';

function jsonResponse(status: number, body: unknown) {
	return Response.json(body, {
		status,
		headers: {'Content-Type': 'application/json'},
	});
}

const fetchMock = jest.fn<typeof fetch>();

beforeEach(() => {
	fetchMock.mockReset();
	globalThis.fetch = fetchMock;
});

afterEach(() => {
	jest.restoreAllMocks();
});

function lastRequest() {
	const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
	return {url, init};
}

describe('api client', () => {
	it('login POSTs the credentials to the default emulator API and returns the token', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse(200, {success: true, data: {token: 'jwt-abc'}}),
		);

		await expect(api.login('a@example.com', 'secret12')).resolves.toBe(
			'jwt-abc',
		);
		const {url, init} = lastRequest();
		expect(url).toBe('http://10.0.2.2:3000/auth/login');
		expect(init).toMatchObject({
			method: 'POST',
			body: JSON.stringify({email: 'a@example.com', password: 'secret12'}),
		});
	});

	it('createCall sends the bearer token and returns the callID', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse(201, {success: true, data: {callID: 'call-1'}}),
		);

		await expect(api.createCall('jwt-abc')).resolves.toBe('call-1');
		expect(lastRequest().init).toMatchObject({
			method: 'POST',
			headers: {Authorization: 'Bearer jwt-abc'},
		});
	});

	it('joinCall PUTs to the call and returns the echoed callID', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse(201, {success: true, data: {callID: 'call-1'}}),
		);

		await expect(api.joinCall('jwt-abc', 'call-1')).resolves.toBe('call-1');
		expect(lastRequest().url).toBe('http://10.0.2.2:3000/call/call-1/join');
		expect(lastRequest().init).toMatchObject({method: 'PUT'});
	});

	it('includes the API error message when a request fails', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse(404, {success: false, data: {error: 'Call ID not present'}}),
		);

		await expect(api.joinCall('jwt-abc', 'missing')).rejects.toThrow(
			'PUT /call/missing/join failed (404): Call ID not present',
		);
	});

	it('getIceServers returns a validated iceServers list', async () => {
		const iceServers = [
			{urls: ['stun:turn.example.com:3478']},
			{urls: 'turn:turn.example.com:3478', username: 'u', credential: 'c'},
		];
		fetchMock.mockResolvedValueOnce(
			jsonResponse(200, {success: true, data: {iceServers}}),
		);

		await expect(api.getIceServers('jwt-abc')).resolves.toEqual(iceServers);
	});

	it('getIceServers rejects a malformed list', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse(200, {success: true, data: {iceServers: [{urls: 3}]}}),
		);

		await expect(api.getIceServers('jwt-abc')).rejects.toThrow('iceServers');
	});
});
