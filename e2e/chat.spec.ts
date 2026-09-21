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
	await page.getByPlaceholder('Username').fill(user.username);
	await page.getByPlaceholder('Email').fill(user.email);
	await page.getByPlaceholder('Password').fill(user.password);
	await page.getByRole('button', {name: 'Create account'}).click();
	await expect(page.getByText(user.username)).toBeVisible();
}

test('a chat message sent by one participant appears for the other', async ({
	browser,
}) => {
	const alice = await browser.newContext();
	const bob = await browser.newContext();

	try {
		const alicePage = await alice.newPage();
		const bobPage = await bob.newPage();

		await signUp(alicePage, uniqueUser('alice'));
		await signUp(bobPage, uniqueUser('bob'));

		await alicePage.getByRole('button', {name: 'Create Call'}).click();
		await expect(
			alicePage.getByRole('button', {name: 'Hang Up'}),
		).toBeVisible();

		const callIdLocator = alicePage.getByText(/^Call ID: /v).first();
		const callIdText = await callIdLocator.evaluate(
			(element) => element.textContent ?? '',
		);
		const callId = callIdText.replace('Call ID: ', '').trim();

		await bobPage.getByPlaceholder('Enter call ID').fill(callId);
		await bobPage.getByRole('button', {name: 'Join Call'}).click();
		await expect(bobPage.getByRole('button', {name: 'Hang Up'})).toBeVisible();

		const message = `hello from bob ${Date.now()}`;
		await bobPage.getByPlaceholder('Type a message…').fill(message);
		await bobPage.getByPlaceholder('Type a message…').press('Enter');

		await expect(alicePage.getByText(message)).toBeVisible();
	} finally {
		await alice.close();
		await bob.close();
	}
});
