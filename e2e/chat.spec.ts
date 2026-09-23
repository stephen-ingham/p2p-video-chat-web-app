import {randomUUID} from 'node:crypto';
import {test, expect, type Page} from '@playwright/test';

function uniqueUser(label: string) {
	const suffix = randomUUID();
	return {
		username: `e2e${label}${suffix}`,
		email: `e2e-${label}-${suffix}@example.com`,
		password: 'ExamplePassword123',
	};
}

async function signUp(page: Page, user: ReturnType<typeof uniqueUser>) {
	await page.goto('/');
	await page.getByRole('tab', {name: 'Register'}).click();
	await page.getByTestId('register-username').fill(user.username);
	await page.getByTestId('register-email').fill(user.email);
	await page.getByTestId('register-password').fill(user.password);
	await page.getByTestId('register-submit').click();
	await expect(page.getByTestId('username')).toHaveText(user.username);
}

test('a chat message sent by one participant appears for the other', async ({
	browser,
}) => {
	const alice = await browser.newContext();
	const bob = await browser.newContext();

	try {
		const alicePage = await alice.newPage();
		const bobPage = await bob.newPage();

		const aliceUser = uniqueUser('alice');
		await signUp(alicePage, aliceUser);
		await signUp(bobPage, uniqueUser('bob'));

		await alicePage.getByTestId('create-call-button').click();
		await expect(alicePage.getByTestId('hang-up-button')).toBeVisible();

		const callId = (await alicePage.getByTestId('call-id').textContent()) ?? '';

		await bobPage.getByTestId('join-call-input').fill(callId);
		await bobPage.getByTestId('join-call-button').click();
		await expect(bobPage.getByTestId('hang-up-button')).toBeVisible();
		// The hang-up button appears before Bob's WebSocket join is processed;
		// until then the server still has him as a pending participant and
		// drops his chat. Seeing Alice in his participant list means the
		// join has gone through.
		await expect(bobPage.getByText(aliceUser.email).first()).toBeVisible();

		const message = `hello from bob ${Date.now()}`;
		await bobPage.getByTestId('chat-message-input').fill(message);
		await bobPage.getByTestId('chat-message-input').press('Enter');

		await expect(alicePage.getByText(message)).toBeVisible();
	} finally {
		await alice.close();
		await bob.close();
	}
});
