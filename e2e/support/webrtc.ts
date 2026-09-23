import {randomUUID} from 'node:crypto';
import {expect, type BrowserContext, type Page} from '@playwright/test';

declare global {
	var voneoPeerConnections: RTCPeerConnection[] | undefined;
}

export type SelectedCandidatePair = {
	localType: string;
	localAddress: string;
	remoteType: string;
	remoteAddress: string;
	bytesReceived: number;
};

export function uniqueUser(label: string) {
	const suffix = randomUUID();
	return {
		username: `e2e${label}${suffix}`,
		email: `e2e-${label}-${suffix}@example.com`,
		password: 'ExamplePassword123',
	};
}

export type TestUser = ReturnType<typeof uniqueUser>;

export async function signUp(page: Page, user: TestUser) {
	await page.goto('/');
	await page.getByRole('tab', {name: 'Register'}).click();
	await page.getByTestId('register-username').fill(user.username);
	await page.getByTestId('register-email').fill(user.email);
	await page.getByTestId('register-password').fill(user.password);
	await page.getByTestId('register-submit').click();
	await expect(page.getByTestId('username')).toHaveText(user.username);
}

// The app keeps its RTCPeerConnections in module scope (rtc-utils.ts), out of
// reach of the test. Wrapping the constructor before any page script runs
// records every instance, so tests can read real ICE stats without adding
// test-only hooks to the app itself.
export async function trackPeerConnections(context: BrowserContext) {
	await context.addInitScript(() => {
		const nativeRtcPeerConnection = globalThis.RTCPeerConnection;
		const created: RTCPeerConnection[] = [];
		globalThis.voneoPeerConnections = created;
		globalThis.RTCPeerConnection = class extends nativeRtcPeerConnection {
			constructor(configuration?: RTCConfiguration) {
				super(configuration);
				created.push(this);
			}
		};
	});
}

// The ICE candidate pair a connected peer connection is actually sending
// media over. Candidate types: `host` = direct on the local network, `srflx`
// = direct through a NAT (found via STUN), `relay` = via the TURN server.
async function getSelectedCandidatePair(
	page: Page,
): Promise<SelectedCandidatePair | undefined> {
	/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- RTCStatsReport is typed as a Map of `any` by lib.dom */
	return page.evaluate(async () => {
		for (const pc of globalThis.voneoPeerConnections ?? []) {
			if (pc.connectionState !== 'connected') continue;

			// eslint-disable-next-line no-await-in-loop -- checked one connection at a time; there's only ever one or two
			const stats = await pc.getStats();
			for (const report of stats.values()) {
				if (report.type !== 'transport' || !report.selectedCandidatePairId)
					continue;

				const pair = stats.get(report.selectedCandidatePairId);
				const local = stats.get(pair.localCandidateId);
				const remote = stats.get(pair.remoteCandidateId);
				return {
					localType: String(local.candidateType),
					localAddress: `${local.address}:${local.port}`,
					remoteType: String(remote.candidateType),
					remoteAddress: `${remote.address}:${remote.port}`,
					bytesReceived: Number(pair.bytesReceived),
				};
			}
		}

		return undefined;
	});
	/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
}

// Waits until media is actually flowing (not just ICE "connected"), then
// returns the candidate pair it's flowing over.
export async function waitForMediaFlow(
	page: Page,
): Promise<SelectedCandidatePair> {
	let pair: SelectedCandidatePair | undefined;
	await expect
		.poll(
			async () => {
				pair = await getSelectedCandidatePair(page);
				return pair?.bytesReceived ?? 0;
			},
			{
				message: 'expected a connected peer connection receiving media',
				timeout: 30_000,
			},
		)
		.toBeGreaterThan(0);
	return pair!;
}

export async function expectRemoteVideoPlaying(page: Page, peer: TestUser) {
	const video = page.getByTestId(`remote-video-${peer.email}`);
	await expect
		.poll(
			async () =>
				video.evaluate((element: HTMLVideoElement) => element.videoWidth),
			{
				message: `expected ${peer.email}'s video to be rendering frames`,
				timeout: 30_000,
			},
		)
		.toBeGreaterThan(0);
}

export function usesTurnRelay(pair: SelectedCandidatePair) {
	return pair.localType === 'relay' || pair.remoteType === 'relay';
}

// Alice creates a call and Bob joins it — returns once both see each other
// as participants (signalling done; media may still be negotiating).
export async function startCall(
	alicePage: Page,
	bobPage: Page,
	aliceUser: TestUser,
	bobUser: TestUser,
) {
	await alicePage.getByTestId('create-call-button').click();
	await expect(alicePage.getByTestId('hang-up-button')).toBeVisible();
	const callId = (await alicePage.getByTestId('call-id').textContent()) ?? '';

	await bobPage.getByTestId('join-call-input').fill(callId);
	await bobPage.getByTestId('join-call-button').click();
	await expect(bobPage.getByTestId('hang-up-button')).toBeVisible();

	await expect(alicePage.getByText(bobUser.email).first()).toBeVisible();
	await expect(bobPage.getByText(aliceUser.email).first()).toBeVisible();
}
