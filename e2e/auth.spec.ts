import {test, expect, type Page} from '@playwright/test';

function uniqueUser() {
	const suffix = Date.now();
	return {
		username: `e2euser${suffix}`,
		email: `e2e-${suffix}@example.com`,
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

test('sign up creates an account and logs straight in', async ({page}) => {
	const user = uniqueUser();
	await signUp(page, user);

	await expect(page.getByTestId('create-call-button')).toBeVisible();
});

test('login with valid credentials reaches the call screen', async ({page}) => {
	const user = uniqueUser();
	await signUp(page, user);
	await page.getByTestId('logout-button').click();

	await page.getByTestId('login-email').fill(user.email);
	await page.getByTestId('login-password').fill(user.password);
	await page.getByTestId('login-submit').click();

	// Login (unlike signup) derives the displayed name from the email
	// prefix rather than the registered username — see AuthScreen's
	// handleLogin, which calls onAuthenticated(email, email.split('@')[0]).
	const [emailPrefix] = user.email.split('@');
	await expect(page.getByTestId('username')).toHaveText(emailPrefix);
});

test('login with invalid credentials shows an error', async ({page}) => {
	await page.goto('/');
	await page.getByTestId('login-email').fill('nobody@example.com');
	await page.getByTestId('login-password').fill('wrong-password');
	await page.getByTestId('login-submit').click();

	await expect(page.getByText('Invalid email or password.')).toBeVisible();
});

test('logout returns to the auth screen', async ({page}) => {
	const user = uniqueUser();
	await signUp(page, user);

	await page.getByTestId('logout-button').click();

	await expect(page.getByRole('tab', {name: 'Login'})).toBeVisible();
});
