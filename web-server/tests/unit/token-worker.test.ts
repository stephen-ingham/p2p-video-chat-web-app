/* eslint-disable @typescript-eslint/naming-convention -- object literals below mirror the real HTTP wire format (Authorization header, callID/callURL response fields), not variable names */
import {beforeEach, describe, expect, it, vi} from 'vitest';

type WorkerEvent = {data: {messageType: string; requestBody?: unknown}};
type WorkerHandler = (event: WorkerEvent) => Promise<void>;
type WorkerResult = {type: string; message: unknown};

// Token-worker.js is written to run in a real Worker global scope: it
// assigns `onmessage` and calls `postMessage` as bare globals, and its
// 'Init' handler reads `this.self.location.hostname`. jsdom doesn't predefine
// `onmessage`, and a bare assignment to an undeclared identifier throws in a
// strict-mode module — so predefine it before importing, then drive the
// module the same way real usage does: post a message, read the response.
// eslint-disable-next-line unicorn/prefer-add-event-listener -- token-worker.js itself assigns onmessage as a bare global (real Worker scope, not a DOM EventTarget); this just predefines the property so that assignment doesn't throw
globalThis.onmessage = null;
const postMessage = vi.fn();
vi.stubGlobal('postMessage', postMessage);

await import('../../src/public/token-worker.js');

async function send(messageType: string, requestBody?: unknown) {
	postMessage.mockClear();
	// Bridging an untyped, message-based worker protocol to a typed test
	// helper inherently needs an assertion here — there's no static type to
	// narrow from.
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- see above
	const handler = globalThis.onmessage as unknown as WorkerHandler;
	const event: WorkerEvent = {data: {messageType, requestBody}};
	// `this` must be the worker global for self.location.hostname in the
	// 'Init' branch — a bare call leaves `this` undefined here.
	await handler.call(globalThis, event);
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- postMessage is a bare vi.fn(); its call args have no static type
	return postMessage.mock.calls.at(-1)?.[0] as WorkerResult;
}

function jsonResponse(body: unknown, ok = true): Response {
	// A minimal fetch Response stand-in — only `ok`/`json()` are ever read.
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/consistent-type-assertions -- deliberately partial mock of the real Response interface
	const response = {ok, json: async () => body} as Response;
	return response;
}

describe('token-worker', () => {
	beforeEach(async () => {
		vi.stubGlobal('fetch', vi.fn());
		await send('Init');
	});

	it('login: stores the token and reports success', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse({success: true, data: {token: 'jwt-abc'}}),
		);

		const result = await send('ReqLogin', {
			email: 'a@example.com',
			password: 'secret1',
		});

		expect(fetch).toHaveBeenCalledWith(
			'http://localhost:3000/auth/login',
			expect.objectContaining({method: 'POST'}),
		);
		expect(result).toEqual({type: 'ResLogin', message: 'Login Succesful!'});
	});

	it('login: reports failure on a non-2xx response, without throwing', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(undefined, false));

		const result = await send('ReqLogin', {
			email: 'a@example.com',
			password: 'wrong',
		});

		expect(result).toEqual({type: 'ResLogin', message: 'Login failed'});
	});

	it('login: reports failure when the API reports success: false', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({success: false}));

		const result = await send('ReqLogin', {
			email: 'a@example.com',
			password: 'wrong',
		});

		expect(result).toEqual({type: 'ResLogin', message: 'Login failed'});
	});

	it('logout: clears the stored token and posts to /auth/logout with it', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse({success: true, data: {token: 'jwt-abc'}}),
		);
		await send('ReqLogin', {email: 'a@example.com', password: 'secret1'});

		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse({success: true, data: {message: 'Logged out succesfully'}}),
		);
		const result = await send('ReqLogout');

		const [, logoutOptions] = vi.mocked(fetch).mock.calls[1];
		expect(fetch).toHaveBeenNthCalledWith(
			2,
			'http://localhost:3000/auth/logout',
			expect.anything(),
		);
		expect(logoutOptions).toMatchObject({
			headers: {Authorization: 'Bearer jwt-abc'},
		});
		expect(result).toEqual({
			type: 'ResLogout',
			message: 'Logged out succesfully',
		});

		// Token was actually cleared, not just reported as cleared: the next
		// authenticated request carries no real bearer token.
		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse({success: true, data: {callID: 'x', callURL: 'y'}}),
		);
		await send('ReqCreateCall');
		const [, createCallOptions] = vi.mocked(fetch).mock.calls[2];
		expect(createCallOptions).toMatchObject({
			headers: {Authorization: 'Bearer null'},
		});
	});

	it('createCall: returns the callID/callURL on success', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse({
				success: true,
				data: {callID: 'call-1', callURL: 'wss://example/call-1'},
			}),
		);

		const result = await send('ReqCreateCall');

		expect(result).toEqual({
			type: 'ResCreateCall',
			message: {callID: 'call-1', callURL: 'wss://example/call-1'},
		});
	});

	it('joinCall: PUTs to the call ID and returns the callURL', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse({success: true, data: {callURL: 'wss://example/call-1'}}),
		);

		const result = await send('ReqJoinCall', 'call-1');

		expect(fetch).toHaveBeenCalledWith(
			'http://localhost:3000/call/call-1/join',
			expect.objectContaining({method: 'PUT'}),
		);
		expect(result).toEqual({
			type: 'ResJoinCall',
			message: 'wss://example/call-1',
		});
	});

	it('leaveCall: DELETEs the call ID and returns the server message', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse({
				success: true,
				data: {message: 'User left call succesfully'},
			}),
		);

		const result = await send('ReqLeaveCall', 'call-1');

		expect(fetch).toHaveBeenCalledWith(
			'http://localhost:3000/call/call-1/leave',
			expect.objectContaining({method: 'DELETE'}),
		);
		expect(result).toEqual({
			type: 'ResLeaveCall',
			message: 'User left call succesfully',
		});
	});
});
