import {test, expect, type Page} from '@playwright/test';

function uniqueUser(label: string) {
	const suffix = Date.now();
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

test('create call, join call, and see each other as participants', async ({
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

		const callId = (await alicePage.getByTestId('call-id').textContent()) ?? '';
		expect(callId).toMatch(/^[\w\-]+$/v);

		await bobPage.getByTestId('join-call-input').fill(callId);
		await bobPage.getByTestId('join-call-button').click();
		await expect(bobPage.getByTestId('hang-up-button')).toBeVisible();

		// Bob receives Alice in `responseCurrentCallParticipants` (participant
		// list); Alice receives Bob via a `receivedNewParticipantNotif` chat
		// line, which also shows up as a chat-log line containing the same
		// email, hence .first() rather than a single unique match.
		await expect(alicePage.getByText(bobUser.email).first()).toBeVisible();
		await expect(bobPage.getByText(aliceUser.email).first()).toBeVisible();
	} finally {
		await alice.close();
		await bob.close();
	}
});
