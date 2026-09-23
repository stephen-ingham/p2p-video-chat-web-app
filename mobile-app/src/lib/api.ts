import {apiBaseUrl} from './config.ts';

// Thin client for the signalling API's REST routes (see
// web-socket-api/src/openapi.yaml). React Native's fetch sends no Origin
// header, which the API's CORS check allows (`|| !origin` in app.js).

type ApiBody = {
	success?: unknown;
	data?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

async function request(
	path: string,
	{
		method = 'GET',
		token,
		body,
	}: {method?: string; token?: string; body?: unknown} = {},
): Promise<Record<string, unknown>> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};
	if (token) headers.Authorization = `Bearer ${token}`;

	const response = await fetch(`${apiBaseUrl}${path}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
	});

	const parsed: ApiBody = {};
	try {
		const json: unknown = await response.json();
		if (isRecord(json)) {
			parsed.success = json.success;
			if (isRecord(json.data)) parsed.data = json.data;
		}
	} catch {
		// Non-JSON body (e.g. a proxy error page) — fall through to the status check.
	}

	if (!response.ok || parsed.success !== true) {
		// Error bodies use data.error (call routes) or data.message (auth routes).
		const reason = parsed.data?.error ?? parsed.data?.message;
		throw new Error(
			`${method} ${path} failed (${response.status})${
				typeof reason === 'string' ? `: ${reason}` : ''
			}`,
		);
	}

	return parsed.data ?? {};
}

function readString(data: Record<string, unknown>, key: string): string {
	const value = data[key];
	if (typeof value !== 'string') {
		throw new TypeError(`Expected a string "${key}" in the API response`);
	}

	return value;
}

// Returns the JWT access token. The refresh token cookie the API also sets
// isn't used yet.
export async function login(email: string, password: string) {
	const data = await request('/auth/login', {
		method: 'POST',
		body: {email, password},
	});
	return readString(data, 'token');
}

export async function signup(
	username: string,
	email: string,
	password: string,
) {
	await request('/auth/signup', {
		method: 'POST',
		body: {username, email, password},
	});
}

export async function createCall(token: string) {
	const data = await request('/call/create', {method: 'POST', token});
	return readString(data, 'callID');
}

export async function joinCall(token: string, callId: string) {
	const data = await request(`/call/${encodeURIComponent(callId)}/join`, {
		method: 'PUT',
		token,
	});
	return readString(data, 'callID');
}

export async function leaveCall(token: string, callId: string) {
	await request(`/call/${encodeURIComponent(callId)}/leave`, {
		method: 'DELETE',
		token,
	});
}
