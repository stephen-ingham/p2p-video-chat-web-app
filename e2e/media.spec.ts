import {test, expect} from '@playwright/test';
import {
	expectRemoteVideoPlaying,
	signUp,
	startCall,
	trackPeerConnections,
	uniqueUser,
	usesTurnRelay,
	waitForMediaFlow,
} from './support/webrtc.ts';

// Both browser contexts run on the same machine here — the "same network"
// case. No TURN server exists in this stack (the API falls back to public
// STUN), so media must flow directly between the peers. Cross-network
// behaviour through the self-hosted TURN relay is covered separately by
// e2e/nat/nat-traversal.spec.ts (`npm run test:e2e:nat`).
test('participants on the same network exchange video directly', async ({
	browser,
}) => {
	const alice = await browser.newContext();
	const bob = await browser.newContext();

	try {
		await trackPeerConnections(alice);
		await trackPeerConnections(bob);
		const alicePage = await alice.newPage();
		const bobPage = await bob.newPage();

		const aliceUser = uniqueUser('alice');
		const bobUser = uniqueUser('bob');
		await signUp(alicePage, aliceUser);
		await signUp(bobPage, bobUser);
		await startCall(alicePage, bobPage, aliceUser, bobUser);

		const alicePair = await waitForMediaFlow(alicePage);
		const bobPair = await waitForMediaFlow(bobPage);
		expect(usesTurnRelay(alicePair)).toBe(false);
		expect(usesTurnRelay(bobPair)).toBe(false);

		await expectRemoteVideoPlaying(alicePage, bobUser);
		await expectRemoteVideoPlaying(bobPage, aliceUser);
	} finally {
		await alice.close();
		await bob.close();
	}
});
