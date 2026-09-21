import {test, expect} from '@playwright/test';

function uniqueUser() {
	const suffix = Date.now();
	return {
		username: `e2euser${suffix}`,
		email: `e2e-${suffix}@example.com`,
		password: 'ExamplePassword123',
	};
}

test('sign up creates an account and logs straight in', async ({page}) => {
	const user = uniqueUser();
	await page.goto('/');

	await page.getByRole('tab', {name: 'Register'}).click();
	await page.getByPlaceholder('Username').fill(user.username);
	await page.getByPlaceholder('Email').fill(user.email);
	await page.getByPlaceholder('Password').fill(user.password);
	await page.getByRole('button', {name: 'Create account'}).click();

	await expect(page.getByText(user.username)).toBeVisible();
	await expect(page.getByRole('button', {name: 'Create Call'})).toBeVisible();
});

test('login with valid credentials reaches the call screen', async ({page}) => {
	const user = uniqueUser();
	await page.goto('/');
	await page.getByRole('tab', {name: 'Register'}).click();
	await page.getByPlaceholder('Username').fill(user.username);
	await page.getByPlaceholder('Email').fill(user.email);
	await page.getByPlaceholder('Password').fill(user.password);
	await page.getByRole('button', {name: 'Create account'}).click();
	await page.getByRole('button', {name: 'Logout'}).click();

	await page.getByPlaceholder('Email').fill(user.email);
	await page.getByPlaceholder('Password').fill(user.password);
	await page.getByRole('button', {name: 'Sign in'}).click();

	await expect(page.getByText(user.username)).toBeVisible();
});

test('login with invalid credentials shows an error', async ({page}) => {
	await page.goto('/');
	await page.getByPlaceholder('Email').fill('nobody@example.com');
	await page.getByPlaceholder('Password').fill('wrong-password');
	await page.getByRole('button', {name: 'Sign in'}).click();

	await expect(page.getByText('Invalid email or password.')).toBeVisible();
});

test('logout returns to the auth screen', async ({page}) => {
	const user = uniqueUser();
	await page.goto('/');
	await page.getByRole('tab', {name: 'Register'}).click();
	await page.getByPlaceholder('Username').fill(user.username);
	await page.getByPlaceholder('Email').fill(user.email);
	await page.getByPlaceholder('Password').fill(user.password);
	await page.getByRole('button', {name: 'Create account'}).click();

	await page.getByRole('button', {name: 'Logout'}).click();

	await expect(page.getByRole('tab', {name: 'Login'})).toBeVisible();
});
