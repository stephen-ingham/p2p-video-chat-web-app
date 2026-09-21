import process from 'node:process';
import {defineConfig, devices} from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 *
 * Tests run against the e2e prod-mode simulation stack (see
 * e2e/compose.e2e.yaml and e2e/Caddyfile) at https://voneo.test, which
 * requires that hostname to resolve to 127.0.0.1 (add it to /etc/hosts
 * or C:\Windows\System32\drivers\etc\hosts locally; CI does this in the
 * workflow). Run via `npm run test:e2e`, which brings the stack up and
 * down for you.
 */
export default defineConfig({
	testDir: './e2e',
	globalSetup: './e2e/global-setup.ts',
	/* Run tests in files in parallel */
	fullyParallel: true,
	/* Fail the build on CI if you accidentally left test.only in the source code. */
	forbidOnly: Boolean(process.env.CI),
	/* Retry on CI only */
	retries: process.env.CI ? 2 : 0,
	/* Opt out of parallel tests on CI. */
	workers: process.env.CI ? 1 : undefined,
	/* Reporter to use. See https://playwright.dev/docs/test-reporters */
	reporter: 'html',
	/* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
	use: {
		// eslint-disable-next-line @typescript-eslint/naming-convention -- Playwright API property
		baseURL: 'https://voneo.test',
		/* Caddy's `tls internal` cert is self-signed, not from a public CA. */
		// eslint-disable-next-line @typescript-eslint/naming-convention -- Playwright API property
		ignoreHTTPSErrors: true,
		permissions: ['camera', 'microphone'],
		launchOptions: {
			args: [
				'--use-fake-device-for-media-stream',
				'--use-fake-ui-for-media-stream',
			],
		},
		/* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
		trace: 'on-first-retry',
	},

	/* Fake media device flags are Chromium-only, so that's the only project. */
	projects: [
		{
			name: 'chromium',
			use: {...devices['Desktop Chrome']},
		},
	],
});
