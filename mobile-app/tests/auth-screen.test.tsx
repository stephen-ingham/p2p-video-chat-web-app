import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {fireEvent, render, screen} from '@testing-library/react-native';
import * as api from '../src/lib/api.ts';
import AuthScreen, {type AuthSession} from '../src/screens/auth-screen.tsx';

jest.mock('../src/lib/api.ts');
const mockedApi = jest.mocked(api);

const onAuthenticated = jest.fn<(session: AuthSession) => void>();

async function fillAndSubmit(fields: Record<string, string>) {
	for (const [testId, value] of Object.entries(fields)) {
		// eslint-disable-next-line no-await-in-loop -- fields are typed in order, like a user would
		await fireEvent.changeText(screen.getByTestId(testId), value);
	}

	await fireEvent.press(screen.getByTestId('auth-submit'));
}

beforeEach(() => {
	jest.resetAllMocks();
});

describe('AuthScreen', () => {
	it('logs in and reports the session, with the username from the email', async () => {
		mockedApi.login.mockResolvedValueOnce('jwt-abc');
		await render(<AuthScreen onAuthenticated={onAuthenticated} />);

		await fillAndSubmit({
			'email-input': ' john.smith@gmail.com ',
			'password-input': 'secret12',
		});

		expect(mockedApi.login).toHaveBeenCalledWith(
			'john.smith@gmail.com',
			'secret12',
		);
		expect(onAuthenticated).toHaveBeenCalledWith({
			token: 'jwt-abc',
			email: 'john.smith@gmail.com',
			username: 'john.smith',
		});
	});

	it('registers, then logs in with the chosen username', async () => {
		mockedApi.signup.mockResolvedValueOnce(undefined);
		mockedApi.login.mockResolvedValueOnce('jwt-new');
		await render(<AuthScreen onAuthenticated={onAuthenticated} />);

		await fireEvent.press(screen.getByTestId('register-tab'));
		await fillAndSubmit({
			'username-input': 'alice',
			'email-input': 'alice@example.com',
			'password-input': 'secret12',
		});

		expect(mockedApi.signup).toHaveBeenCalledWith(
			'alice',
			'alice@example.com',
			'secret12',
		);
		expect(onAuthenticated).toHaveBeenCalledWith({
			token: 'jwt-new',
			email: 'alice@example.com',
			username: 'alice',
		});
	});

	it('labels its fields and marks the selected tab for screen readers', async () => {
		await render(<AuthScreen onAuthenticated={onAuthenticated} />);

		expect(screen.getByLabelText('Email')).toBeOnTheScreen();
		expect(screen.getByLabelText('Password')).toBeOnTheScreen();
		expect(screen.getByRole('tab', {name: 'Login'})).toBeSelected();

		await fireEvent.press(screen.getByRole('tab', {name: 'Register'}));
		expect(screen.getByRole('tab', {name: 'Register'})).toBeSelected();
		expect(screen.getByLabelText('Username')).toBeOnTheScreen();
	});

	it('shows an error and stays logged out when login fails', async () => {
		mockedApi.login.mockRejectedValueOnce(new Error('400'));
		await render(<AuthScreen onAuthenticated={onAuthenticated} />);

		await fillAndSubmit({
			'email-input': 'john.smith@gmail.com',
			'password-input': 'wrong',
		});

		expect(await screen.findByTestId('auth-error')).toHaveTextContent(
			'Login failed. Check your email and password.',
		);
		expect(onAuthenticated).not.toHaveBeenCalled();
	});
});
