import {act, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import AuthScreen from '@/components/auth-screen.tsx';

const login = vi.fn();
const register = vi.fn();

vi.mock('@/lib/use-token-worker.ts', () => ({
	useTokenWorker: () => ({login, register}),
}));

beforeEach(() => {
	login.mockReset();
	register.mockReset();
});

function mockOnAuthenticated() {
	return vi.fn<(email: string, username: string) => void>();
}

describe('AuthScreen — login', () => {
	it('submits the entered credentials and authenticates on success', async () => {
		login.mockResolvedValueOnce('Login Succesful!');
		const onAuthenticated = mockOnAuthenticated();
		const user = userEvent.setup();
		render(<AuthScreen onAuthenticated={onAuthenticated} />);

		await user.type(screen.getByTestId('login-email'), 'alice@example.com');
		await user.type(screen.getByTestId('login-password'), 'secret123');
		await user.click(screen.getByTestId('login-submit'));

		expect(login).toHaveBeenCalledWith('alice@example.com', 'secret123');
		expect(onAuthenticated).toHaveBeenCalledWith('alice@example.com', 'alice');
	});

	it('shows a generic alert and does not authenticate when login fails', async () => {
		login.mockResolvedValueOnce('Login failed');
		const onAuthenticated = mockOnAuthenticated();
		const user = userEvent.setup();
		render(<AuthScreen onAuthenticated={onAuthenticated} />);

		await user.type(screen.getByLabelText('Email'), 'alice@example.com');
		await user.type(screen.getByLabelText('Password'), 'wrong-password');
		await user.click(screen.getByTestId('login-submit'));

		expect(screen.getByRole('alert')).toHaveTextContent(
			'Something went wrong. Please try again.',
		);
		expect(onAuthenticated).not.toHaveBeenCalled();
	});

	it('shows network errors as an alert', async () => {
		login.mockRejectedValueOnce(new Error('Failed to fetch'));
		const user = userEvent.setup();
		render(<AuthScreen onAuthenticated={mockOnAuthenticated()} />);

		await user.type(screen.getByLabelText('Email'), 'alice@example.com');
		await user.type(screen.getByLabelText('Password'), 'secret123');
		await user.click(screen.getByTestId('login-submit'));

		expect(screen.getByRole('alert')).toHaveTextContent(
			'Something went wrong. Please try again.',
		);
	});

	it('disables the button with a loading label while signing in', async () => {
		let resolveLogin: (value: string) => void = () => undefined;
		login.mockReturnValueOnce(
			new Promise<string>((resolve) => {
				resolveLogin = resolve;
			}),
		);
		const user = userEvent.setup();
		render(<AuthScreen onAuthenticated={mockOnAuthenticated()} />);

		await user.type(screen.getByLabelText('Email'), 'alice@example.com');
		await user.type(screen.getByLabelText('Password'), 'secret123');
		await user.click(screen.getByTestId('login-submit'));

		expect(screen.getByTestId('login-submit')).toBeDisabled();
		expect(screen.getByTestId('login-submit')).toHaveTextContent('Signing in…');
		await act(async () => {
			resolveLogin('Login Succesful!');
		});
	});

	it('keeps submit disabled and shows an error until email/password are valid', async () => {
		const user = userEvent.setup();
		render(<AuthScreen onAuthenticated={mockOnAuthenticated()} />);

		expect(screen.getByTestId('login-submit')).toBeDisabled();

		await user.type(screen.getByTestId('login-email'), 'not-an-email');
		expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
			'Enter a valid email address.',
		);
		expect(screen.getByTestId('login-submit')).toBeDisabled();

		await user.clear(screen.getByTestId('login-email'));
		await user.type(screen.getByTestId('login-email'), 'alice@example.com');
		await user.type(screen.getByTestId('login-password'), 'secret123');

		expect(screen.queryByTestId('login-email-error')).not.toBeInTheDocument();
		expect(screen.getByTestId('login-submit')).toBeEnabled();
	});
});

describe('AuthScreen — register', () => {
	it('registers, logs in automatically, and authenticates with the entered username', async () => {
		register.mockResolvedValueOnce('Succesful sign up');
		login.mockResolvedValueOnce('Login Succesful!');
		const onAuthenticated = mockOnAuthenticated();
		const user = userEvent.setup();
		render(<AuthScreen onAuthenticated={onAuthenticated} />);

		await user.click(screen.getByRole('tab', {name: 'Register'}));
		await user.type(screen.getByTestId('register-username'), 'alice');
		await user.type(screen.getByTestId('register-email'), 'alice@example.com');
		await user.type(screen.getByTestId('register-password'), 'secret123');
		await user.click(screen.getByTestId('register-submit'));

		expect(register).toHaveBeenCalledWith(
			'alice',
			'alice@example.com',
			'secret123',
		);
		expect(login).toHaveBeenCalledWith('alice@example.com', 'secret123');
		expect(onAuthenticated).toHaveBeenCalledWith('alice@example.com', 'alice');
	});

	it('shows a generic alert when signup fails, without logging in', async () => {
		register.mockResolvedValueOnce('Signup failed');
		const onAuthenticated = mockOnAuthenticated();
		const user = userEvent.setup();
		render(<AuthScreen onAuthenticated={onAuthenticated} />);

		await user.click(screen.getByRole('tab', {name: 'Register'}));
		await user.type(screen.getByTestId('register-username'), 'alice');
		await user.type(screen.getByTestId('register-email'), 'alice@example.com');
		await user.type(screen.getByTestId('register-password'), 'secret123');
		await user.click(screen.getByTestId('register-submit'));

		expect(screen.getByRole('alert')).toHaveTextContent(
			'Something went wrong. Please try again.',
		);
		expect(login).not.toHaveBeenCalled();
		expect(onAuthenticated).not.toHaveBeenCalled();
	});

	it('shows a validation error and blocks submission for a too-short username', async () => {
		const user = userEvent.setup();
		render(<AuthScreen onAuthenticated={mockOnAuthenticated()} />);

		await user.click(screen.getByRole('tab', {name: 'Register'}));
		await user.type(screen.getByTestId('register-username'), 'ab');

		expect(screen.getByTestId('register-username-error')).toHaveTextContent(
			'Username must be at least 3 characters.',
		);
		expect(screen.getByTestId('register-submit')).toBeDisabled();
	});

	it('shows a validation error and blocks submission for a too-short password', async () => {
		const user = userEvent.setup();
		render(<AuthScreen onAuthenticated={mockOnAuthenticated()} />);

		await user.click(screen.getByRole('tab', {name: 'Register'}));
		await user.type(screen.getByTestId('register-username'), 'alice');
		await user.type(screen.getByTestId('register-email'), 'alice@example.com');
		await user.type(screen.getByTestId('register-password'), 'short');

		expect(screen.getByTestId('register-password-error')).toHaveTextContent(
			'Password must be at least 6 characters.',
		);
		expect(screen.getByTestId('register-submit')).toBeDisabled();
	});
});

describe('AuthScreen — password visibility', () => {
	it('shows and hides the password, keeping focus in the field', async () => {
		const user = userEvent.setup();
		render(<AuthScreen onAuthenticated={mockOnAuthenticated()} />);
		const password = screen.getByLabelText('Password');
		await user.type(password, 'secret123');

		expect(password).toHaveAttribute('type', 'password');

		await user.click(screen.getByRole('button', {name: 'Show password'}));
		expect(password).toHaveAttribute('type', 'text');
		expect(password).toHaveFocus();

		await user.click(screen.getByRole('button', {name: 'Hide password'}));
		expect(password).toHaveAttribute('type', 'password');
	});

	it('turns off spellcheck, autocorrect and autocapitalise', async () => {
		const user = userEvent.setup();
		render(<AuthScreen onAuthenticated={mockOnAuthenticated()} />);
		const password = screen.getByLabelText('Password');

		await user.click(screen.getByRole('button', {name: 'Show password'}));

		expect(password).toHaveAttribute('type', 'text');
		expect(password).toHaveAttribute('spellcheck', 'false');
		expect(password).toHaveAttribute('autocorrect', 'off');
		expect(password).toHaveAttribute('autocapitalize', 'off');
	});

	it('hides the password again when switching tabs', async () => {
		const user = userEvent.setup();
		render(<AuthScreen onAuthenticated={mockOnAuthenticated()} />);

		await user.click(screen.getByRole('button', {name: 'Show password'}));
		await user.click(screen.getByRole('tab', {name: 'Register'}));

		expect(screen.getByLabelText('Password')).toHaveAttribute(
			'type',
			'password',
		);
		expect(
			screen.getByRole('button', {name: 'Show password'}),
		).toBeInTheDocument();
	});
});
