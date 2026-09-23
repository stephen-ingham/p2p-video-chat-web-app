import {describe, expect, it} from '@jest/globals';
import {buildCallUrl, isCallId} from '../src/lib/call-url.ts';

describe('buildCallUrl', () => {
	it('uses ws and the /ws path for an http API (LOCAL=true dev stack)', () => {
		expect(buildCallUrl('call-1', 'http://10.0.2.2:3000')).toBe(
			'ws://10.0.2.2:3000/ws/call-1',
		);
	});

	it('uses wss and the /wss path for an https API (ngrok / production)', () => {
		expect(buildCallUrl('call-1', 'https://voneo.test')).toBe(
			'wss://voneo.test/wss/call-1',
		);
	});

	it('URL-encodes the call ID', () => {
		expect(buildCallUrl('a/b', 'https://voneo.test')).toBe(
			'wss://voneo.test/wss/a%2Fb',
		);
	});

	it.each(['ftp://voneo.test', 'http://', 'https://voneo.test/api'])(
		'rejects an API base URL that is not http(s)://host: %s',
		(apiBase) => {
			expect(() => buildCallUrl('call-1', apiBase)).toThrow(
				'API base URL must be',
			);
		},
	);
});

describe('isCallId', () => {
	it('accepts a UUID in either case', () => {
		expect(isCallId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
		expect(isCallId('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).toBe(true);
	});

	it.each([
		'',
		'not-a-uuid',
		'a1b2c3d4e5f67890abcdef1234567890abcd',
		'a1b2c3d4-e5f6-7890-abcd-ef123456789g',
		'a1b2c3d4-e5f6-7890-abcd-ef12345678900',
	])('rejects %p', (value) => {
		expect(isCallId(value)).toBe(false);
	});
});
