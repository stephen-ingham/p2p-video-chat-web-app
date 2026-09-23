import {describe, expect, it} from 'vitest';
import {buildCallUrl} from '../../src/src/lib/call-url.ts';

describe('buildCallUrl', () => {
	it('uses wss and the /wss path on an https page (ngrok / production)', () => {
		expect(
			buildCallUrl('call-1', {protocol: 'https:', host: 'voneo.test'}),
		).toBe('wss://voneo.test/wss/call-1');
	});

	it('uses ws and the /ws path on an http page (LOCAL=true)', () => {
		expect(
			buildCallUrl('call-1', {protocol: 'http:', host: 'localhost:4321'}),
		).toBe('ws://localhost:4321/ws/call-1');
	});

	it('URL-encodes the callID', () => {
		expect(buildCallUrl('a/b', {protocol: 'https:', host: 'voneo.test'})).toBe(
			'wss://voneo.test/wss/a%2Fb',
		);
	});
});
