import {afterEach, describe, expect, it, vi} from 'vitest';
import {onRequest} from '../../src/src/middleware.ts';

type MockContext = {locals: {nonce?: string}};

function makeContext(): MockContext {
	return {locals: {}};
}

function htmlResponse(body: string) {
	return new Response(body, {headers: {'content-type': 'text/html'}});
}

// OnRequest's declared MiddlewareHandler type allows returning void (Astro
// middleware may fall through without a response) — this implementation
// never does, so narrow the call site rather than the source.
async function callOnRequest(
	context: MockContext,
	next: Parameters<typeof onRequest>[1],
): Promise<Response> {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- MockContext deliberately only stubs the one field the middleware reads; the real APIContext type isn't practical to construct in a unit test
	return (await onRequest(context as never, next)) as Response;
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('CSP middleware', () => {
	it('is skipped in dev — no CSP header, body untouched', async () => {
		vi.stubEnv('DEV', true);
		vi.stubEnv('PROD', false);

		const context = makeContext();
		const next = vi.fn(async () => htmlResponse('<script>1</script>'));

		const response = await callOnRequest(context, next);

		expect(response.headers.get('Content-Security-Policy')).toBeNull();
		expect(await response.text()).toBe('<script>1</script>');
		// The nonce is still generated and exposed to Astro components even
		// in dev, it just isn't enforced via a CSP header.
		expect(context.locals.nonce).toEqual(expect.any(String));
	});

	it('adds a nonce-scoped CSP header to HTML responses in production', async () => {
		vi.stubEnv('DEV', false);
		vi.stubEnv('PROD', true);

		const context = makeContext();
		const next = vi.fn(async () =>
			htmlResponse('<script>1</script><style>a{}</style><link rel="x">'),
		);

		const response = await callOnRequest(context, next);
		const csp = response.headers.get('Content-Security-Policy');

		expect(csp).toContain(`script-src 'nonce-${context.locals.nonce}'`);
		expect(csp).toContain("object-src 'none'");

		const body = await response.text();
		expect(body).toContain(`<script nonce="${context.locals.nonce}">`);
		expect(body).toContain(`<style nonce="${context.locals.nonce}">`);
		expect(body).toContain(`<link nonce="${context.locals.nonce}"`);
	});

	it('leaves non-HTML responses in production untouched — no CSP header added', async () => {
		vi.stubEnv('DEV', false);
		vi.stubEnv('PROD', true);

		const next = vi.fn(
			async () =>
				new Response('{}', {headers: {'content-type': 'application/json'}}),
		);

		const response = await callOnRequest(makeContext(), next);

		expect(response.headers.get('Content-Security-Policy')).toBeNull();
		expect(await response.text()).toBe('{}');
	});
});
