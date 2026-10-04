import {randomUUID} from 'node:crypto';
import {test, expect, type Page} from '@playwright/test';
import {openApp} from './support/app.ts';
import {
	expectLocalVideoPlaying,
	expectRemoteVideoPlaying,
} from './support/webrtc.ts';

function uniqueUser(label: string) {
	const suffix = randomUUID();
	return {
		username: `e2e${label}${suffix}`,
		email: `e2e-${label}-${suffix}@example.com`,
		password: 'ExamplePassword123',
	};
}

async function signUp(page: Page, user: ReturnType<typeof uniqueUser>) {
	await openApp(page);
	await page.getByRole('tab', {name: 'Register'}).click();
	await page.getByTestId('register-username').fill(user.username);
	await page.getByTestId('register-email').fill(user.email);
	await page.getByTestId('register-password').fill(user.password);
	await page.getByTestId('register-submit').click();
	await expect(page.getByTestId('username')).toHaveText(user.username);
}

test('create call, join call, see and message each other, then hang up @happy-path', async ({
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

		await alicePage.getByTestId('create-call-button').click();
		await expect(alicePage.getByTestId('hang-up-button')).toBeVisible();
		await expectLocalVideoPlaying(alicePage);

		const callId = (await alicePage.getByTestId('call-id').textContent()) ?? '';
		expect(callId).toMatch(/^[\w\-]+$/v);

		await bobPage.getByTestId('join-call-input').fill(callId);
		await bobPage.getByTestId('join-call-button').click();
		await expect(bobPage.getByTestId('hang-up-button')).toBeVisible();
		await expectLocalVideoPlaying(bobPage);

		// Each email shows in both the participant list and the chat log's
		// join line, hence .first().
		await expect(alicePage.getByText(bobUser.email).first()).toBeVisible();
		await expect(bobPage.getByText(aliceUser.email).first()).toBeVisible();

		await expectRemoteVideoPlaying(alicePage, bobUser);
		await expectRemoteVideoPlaying(bobPage, aliceUser);

		const message = `hello from alice ${Date.now()}`;
		await alicePage.getByTestId('chat-message-input').fill(message);
		await alicePage.getByTestId('chat-send-button').click();
		await expect(
			bobPage.getByTestId('chat-message').filter({hasText: message}),
		).toBeVisible();

		await alicePage.getByTestId('hang-up-button').click();
		await expect(alicePage.getByTestId('create-call-button')).toBeVisible();
		await expect(alicePage.getByTestId('call-id')).toHaveCount(0);

		await bobPage.getByTestId('hang-up-button').click();
		await expect(bobPage.getByTestId('create-call-button')).toBeVisible();
		await expect(bobPage.getByTestId('call-id')).toHaveCount(0);
	} finally {
		await alice.close();
		await bob.close();
	}
});
