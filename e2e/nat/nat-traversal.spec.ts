import process from 'node:process';
import {
	chromium,
	test,
	expect,
	type Browser,
	type BrowserContext,
} from '@playwright/test';
import {
	expectRemoteVideoPlaying,
	signUp,
	startCall,
	trackPeerConnections,
	uniqueUser,
	waitForMediaFlow,
} from '../support/webrtc.ts';

// Runs against e2e/compose.nat.yaml (`npm run test:e2e:nat`): each browser
// runs in its own container, attached to a simulated LAN — two on `lan-a`,
// one on `lan-b`. Firewall sidecars drop all lan-a <-> lan-b traffic, so the
// only thing devices on different LANs can both reach (besides the app
// itself) is the coturn container, running the same image + base config as
// the production VM (infra/turn-server.ts).
const browserEndpoints = {
	lanA1: process.env.E2E_BROWSER_LAN_A_1 ?? 'ws://localhost:4441/',
	lanA2: process.env.E2E_BROWSER_LAN_A_2 ?? 'ws://localhost:4442/',
	lanB: process.env.E2E_BROWSER_LAN_B ?? 'ws://localhost:4443/',
};

async function connectBrowser(wsEndpoint: string): Promise<Browser> {
	return chromium.connect(wsEndpoint, {
		headers: {
			// Same fake camera/mic flags as the main suite (playwright.config.ts);
			// the browser server only accepts `args` because it runs with --unsafe.
			'x-playwright-launch-options': JSON.stringify({
				args: [
					'--use-fake-device-for-media-stream',
					'--use-fake-ui-for-media-stream',
				],
			}),
		},
	});
}

async function newDevice(browser: Browser): Promise<BrowserContext> {
	const context = await browser.newContext({
		// eslint-disable-next-line @typescript-eslint/naming-convention -- Playwright API property
		baseURL: 'https://voneo.test',
		// eslint-disable-next-line @typescript-eslint/naming-convention -- Playwright API property
		ignoreHTTPSErrors: true,
		permissions: ['camera', 'microphone'],
	});
	await trackPeerConnections(context);
	return context;
}

async function callBetween(aliceEndpoint: string, bobEndpoint: string) {
	const aliceBrowser = await connectBrowser(aliceEndpoint);
	const bobBrowser = await connectBrowser(bobEndpoint);
	const aliceDevice = await newDevice(aliceBrowser);
	const bobDevice = await newDevice(bobBrowser);
	const alicePage = await aliceDevice.newPage();
	const bobPage = await bobDevice.newPage();

	const aliceUser = uniqueUser('alice');
	const bobUser = uniqueUser('bob');
	await signUp(alicePage, aliceUser);
	await signUp(bobPage, bobUser);
	await startCall(alicePage, bobPage, aliceUser, bobUser);

	return {
		alicePage,
		bobPage,
		aliceUser,
		bobUser,
		async close() {
			await aliceBrowser.close();
			await bobBrowser.close();
		},
	};
}

test('devices on the same network connect directly, without using the TURN relay', async () => {
	const call = await callBetween(
		browserEndpoints.lanA1,
		browserEndpoints.lanA2,
	);

	try {
		const alicePair = await waitForMediaFlow(call.alicePage);
		const bobPair = await waitForMediaFlow(call.bobPage);
		// TURN is available here, but ICE prefers a working direct path, so a
		// relay pair would mean ICE/candidate handling is broken.
		expect(alicePair).toMatchObject({localType: 'host', remoteType: 'host'});
		expect(bobPair).toMatchObject({localType: 'host', remoteType: 'host'});

		await expectRemoteVideoPlaying(call.alicePage, call.bobUser);
		await expectRemoteVideoPlaying(call.bobPage, call.aliceUser);
	} finally {
		await call.close();
	}
});

test('devices on different networks connect through the self-hosted TURN relay', async () => {
	const call = await callBetween(browserEndpoints.lanA1, browserEndpoints.lanB);

	try {
		const alicePair = await waitForMediaFlow(call.alicePage);
		const bobPair = await waitForMediaFlow(call.bobPage);
		// No direct route exists between lan-a and lan-b (and nothing
		// masquerades traffic between them), so the only working path is each
		// peer sending through its own TURN allocation. Media flowing at all
		// shows the relay works; the local candidate types confirm the path.
		const pairs = `selected pairs: ${JSON.stringify({alicePair, bobPair})}`;
		expect(alicePair.localType, pairs).toBe('relay');
		expect(bobPair.localType, pairs).toBe('relay');

		await expectRemoteVideoPlaying(call.alicePage, call.bobUser);
		await expectRemoteVideoPlaying(call.bobPage, call.aliceUser);
	} finally {
		await call.close();
	}
});
