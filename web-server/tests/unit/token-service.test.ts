import {describe, expect, it} from 'vitest';

// Dynamic import, not static — a static import of this .js file changes how
// typescript-eslint's project service resolves this file's own project
// (see token-worker.test.ts's Init-related comment for the same pattern).
// eslint-disable-next-line @typescript-eslint/naming-convention -- destructuring a class export, not declaring a variable
const {TokenService} = await import('../../src/public/token-worker.js');

describe('TokenService', () => {
	it('has no token by default', () => {
		const service = new TokenService();
		expect(service.getToken()).toBeNull();
	});

	it('returns the token that was set', () => {
		const service = new TokenService();
		service.setToken('a-jwt');
		expect(service.getToken()).toBe('a-jwt');
	});

	it('clears the token back to null', () => {
		const service = new TokenService();
		service.setToken('a-jwt');
		service.clearToken();
		expect(service.getToken()).toBeNull();
	});

	it('keeps separate instances independent', () => {
		const a = new TokenService();
		const b = new TokenService();
		a.setToken('a-jwt');
		expect(b.getToken()).toBeNull();
	});
});
