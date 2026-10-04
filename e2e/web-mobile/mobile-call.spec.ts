import {test, expect, type Page} from '@playwright/test';
import {
	expectRemoteVideoPlaying,
	signUp,
	uniqueUser,
} from '../support/webrtc.ts';

async function expectNoHorizontalScroll(page: Page) {
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
	).toBe(true);
}

test('a call on a phone: create, join, chat through the sheet, toggle media and hang up', async ({
	browser,
}) => {
	const alice = await browser.newContext();
	const bob = await browser.newContext();

	try {
		const alicePage = await alice.newPage();
		const bobPage = await bob.newPage();
		const aliceUser = uniqueUser('alice');
		const bobUser = uniqueUser('bob');
		await signUp(alicePage, aliceUser);
		await signUp(bobPage, bobUser);

		await expect(alicePage.getByText('Start a call')).toBeVisible();
		await expect(alicePage.getByText('Join a call')).toBeVisible();
		await expect(alicePage.getByTestId('chat-message-input')).toHaveCount(0);
		await expectNoHorizontalScroll(alicePage);

		await alicePage.getByTestId('create-call-button').click();
		await expect(alicePage.getByTestId('hang-up-button')).toBeVisible();
		await expect(alicePage.getByTestId('call-status')).toHaveText(
			'Waiting for others to join…',
		);
		const callId = (await alicePage.getByTestId('call-id').textContent()) ?? '';

		await bobPage.getByLabel('Call ID').fill(callId);
		await bobPage.getByTestId('join-call-button').click();
		await expect(bobPage.getByTestId('hang-up-button')).toBeVisible();

		await expect(alicePage.getByTestId('call-status')).toContainText(
			bobUser.email,
		);
		await expect(bobPage.getByTestId('call-status')).toContainText(
			aliceUser.email,
		);
		await expectRemoteVideoPlaying(alicePage, bobUser);
		await expectRemoteVideoPlaying(bobPage, aliceUser);
		await expectNoHorizontalScroll(alicePage);

		const message = `hello from bob ${Date.now()}`;
		await bobPage.getByTestId('chat-open').click();
		const bobSheet = bobPage.getByRole('dialog', {name: 'Chat'});
		await bobSheet.getByTestId('chat-message-input').fill(message);
		await bobSheet.getByTestId('chat-message-input').press('Enter');
		await expect(bobSheet.getByText(message)).toBeVisible();

		await expect(alicePage.getByTestId('chat-open-badge')).toBeVisible();
		// Matched here rather than in a role locator: Playwright's selector
		// engine rejects the `v` regex flag XO requires.
		expect(
			await alicePage.getByTestId('chat-open').getAttribute('aria-label'),
		).toMatch(/^Chat, \d+ unread$/v);
		await alicePage.getByTestId('chat-open').click();
		const aliceSheet = alicePage.getByRole('dialog', {name: 'Chat'});
		await expect(aliceSheet.getByText(message)).toBeVisible();
		await aliceSheet.getByRole('button', {name: 'Close chat'}).click();
		await expect(aliceSheet).toBeHidden();
		await expect(alicePage.getByTestId('chat-open-badge')).toBeHidden();

		const mic = alicePage.getByRole('switch', {name: 'Microphone'});
		await mic.click();
		await expect(mic).toHaveAttribute('aria-checked', 'false');
		await alicePage.getByRole('switch', {name: 'Camera'}).click();
		await expect(alicePage.getByText('Your camera is off')).toBeAttached();
		await expect(alicePage.getByTestId('local-camera-off')).toBeVisible();

		await alicePage.getByTestId('hang-up-button').click();
		await expect(alicePage.getByTestId('create-call-button')).toBeVisible();
	} finally {
		await alice.close();
		await bob.close();
	}
});
