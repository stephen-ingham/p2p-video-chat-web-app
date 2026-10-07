import React, {useId, useState} from 'react';
import {Video} from 'lucide-react';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from '@/components/ui/card.tsx';
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from '@/components/ui/tabs.tsx';
import {Button} from '@/components/ui/button.tsx';
import {useTokenWorker} from '@/lib/use-token-worker.ts';
import {PasswordField, TextField} from '@/components/auth-field.tsx';

type AuthScreenProps = {
	onAuthenticated: (email: string, username: string) => void;
};

function isValidEmail(email: string) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/v.test(email);
}

function validateLoginForm(form: {email: string; password: string}) {
	return {
		emailError:
			form.email.length > 0 && !isValidEmail(form.email)
				? 'Enter a valid email address.'
				: '',
		isValid: isValidEmail(form.email) && form.password.length > 0,
	};
}

function validateRegisterForm(form: {
	username: string;
	email: string;
	password: string;
}) {
	return {
		usernameError:
			form.username.length > 0 && form.username.length < 3
				? 'Username must be at least 3 characters.'
				: '',
		emailError:
			form.email.length > 0 && !isValidEmail(form.email)
				? 'Enter a valid email address.'
				: '',
		passwordError:
			form.password.length > 0 && form.password.length < 6
				? 'Password must be at least 6 characters.'
				: '',
		isValid:
			form.username.length >= 3 &&
			isValidEmail(form.email) &&
			form.password.length >= 6,
	};
}

const genericError = 'Something went wrong. Please try again.';

export default function AuthScreen({onAuthenticated}: AuthScreenProps) {
	const {login, register} = useTokenWorker();

	const [loginForm, setLoginForm] = useState({email: '', password: ''});
	const [registerForm, setRegisterForm] = useState({
		username: '',
		email: '',
		password: '',
	});
	// Any failed request. Kept generic until the API's error cases are mapped
	// to specific messages (Trello Awy72A9S).
	const [error, setError] = useState('');
	const [passwordVisible, setPasswordVisible] = useState(false);
	const [loading, setLoading] = useState(false);

	const {emailError: loginEmailError, isValid: isLoginValid} =
		validateLoginForm(loginForm);
	const {
		usernameError: registerUsernameError,
		emailError: registerEmailError,
		passwordError: registerPasswordError,
		isValid: isRegisterValid,
	} = validateRegisterForm(registerForm);

	async function handleLogin(event: React.SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!isLoginValid) return;
		setError('');
		setPasswordVisible(false);
		setLoading(true);
		try {
			const result = await login(loginForm.email, loginForm.password);
			if (result === 'Login failed') {
				setError(genericError);
				return;
			}

			onAuthenticated(loginForm.email, loginForm.email.split('@')[0]);
		} catch {
			setError(genericError);
		} finally {
			setLoading(false);
		}
	}

	async function handleRegister(event: React.SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!isRegisterValid) return;
		setError('');
		setPasswordVisible(false);
		setLoading(true);
		try {
			const result = await register(
				registerForm.username,
				registerForm.email,
				registerForm.password,
			);
			if (result === 'Signup failed') {
				setError(genericError);
				return;
			}

			// Signup doesn't return an access token, so log in immediately after
			// to actually authenticate the session the UI is about to show.
			const loginResult = await login(
				registerForm.email,
				registerForm.password,
			);
			if (loginResult === 'Login failed') {
				setError('Account created, but sign-in failed. Please sign in.');
				return;
			}

			onAuthenticated(registerForm.email, registerForm.username);
		} catch {
			setError(genericError);
		} finally {
			setLoading(false);
		}
	}

	const id = useId();

	return (
		<div className="min-h-screen bg-canvas flex items-center justify-center p-4">
			<div className="w-full max-w-md space-y-6">
				<div className="flex flex-col items-center gap-2">
					<div className="bg-surface-raised p-3 rounded-full">
						<Video className="h-7 w-7 text-ink" />
					</div>
					<h1 className="text-[28px] md:text-2xl font-bold text-ink">Voneo</h1>
					<p className="text-sm text-ink-muted">
						Peer-to-peer video calls, wherever you are
					</p>
				</div>

				<Card className="bg-surface border-line">
					<CardHeader className="pb-2">
						<CardTitle className="text-ink text-lg">Get started</CardTitle>
						<CardDescription className="text-ink-muted">
							Sign in or create a new account
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Tabs
							defaultValue="login"
							onValueChange={() => {
								setError('');
								setPasswordVisible(false);
							}}
						>
							<TabsList className="w-full bg-surface-raised mb-4 group-data-horizontal/tabs:h-12 md:group-data-horizontal/tabs:h-8">
								<TabsTrigger
									value="login"
									className="flex-1 text-base md:text-sm data-active:bg-surface-active data-active:text-ink text-ink-muted"
								>
									Login
								</TabsTrigger>
								<TabsTrigger
									value="register"
									className="flex-1 text-base md:text-sm data-active:bg-surface-active data-active:text-ink text-ink-muted"
								>
									Register
								</TabsTrigger>
							</TabsList>

							<TabsContent value="login">
								<form
									onSubmit={(event) => {
										void handleLogin(event);
									}}
									className="space-y-3"
									suppressHydrationWarning={true}
								>
									<TextField
										label="Email"
										id={`${id}-login-email`}
										type="email"
										autoComplete="email"
										placeholder="you@example.com"
										value={loginForm.email}
										error={loginEmailError}
										errorTestId="login-email-error"
										onChange={(event) => {
											setLoginForm((f) => ({
												...f,
												email: event.target.value,
											}));
										}}
										required
										data-testid="login-email"
									/>
									<PasswordField
										label="Password"
										id={`${id}-login-password`}
										autoComplete="current-password"
										value={loginForm.password}
										visible={passwordVisible}
										toggleTestId="login-password-toggle"
										onVisibleChange={setPasswordVisible}
										onChange={(event) => {
											setLoginForm((f) => ({
												...f,
												password: event.target.value,
											}));
										}}
										required
										data-testid="login-password"
									/>
									{error && (
										<p role="alert" className="text-sm text-danger">
											{error}
										</p>
									)}
									<Button
										type="submit"
										disabled={loading || !isLoginValid}
										className="h-12 w-full bg-action text-base text-on-action hover:bg-action-hover md:h-8 md:text-sm"
										data-testid="login-submit"
									>
										{loading ? 'Signing in…' : 'Sign in'}
									</Button>
								</form>
							</TabsContent>

							<TabsContent value="register">
								<form
									onSubmit={(event) => {
										void handleRegister(event);
									}}
									className="space-y-3"
									suppressHydrationWarning={true}
								>
									<TextField
										label="Username"
										id={`${id}-register-username`}
										type="text"
										autoComplete="username"
										placeholder="At least 3 characters"
										value={registerForm.username}
										error={registerUsernameError}
										errorTestId="register-username-error"
										onChange={(event) => {
											setRegisterForm((f) => ({
												...f,
												username: event.target.value,
											}));
										}}
										required
										minLength={3}
										data-testid="register-username"
									/>
									<TextField
										label="Email"
										id={`${id}-register-email`}
										type="email"
										autoComplete="email"
										placeholder="you@example.com"
										value={registerForm.email}
										error={registerEmailError}
										errorTestId="register-email-error"
										onChange={(event) => {
											setRegisterForm((f) => ({
												...f,
												email: event.target.value,
											}));
										}}
										required
										data-testid="register-email"
									/>
									<PasswordField
										label="Password"
										id={`${id}-register-password`}
										autoComplete="new-password"
										placeholder="At least 6 characters"
										value={registerForm.password}
										error={registerPasswordError}
										errorTestId="register-password-error"
										visible={passwordVisible}
										toggleTestId="register-password-toggle"
										onVisibleChange={setPasswordVisible}
										onChange={(event) => {
											setRegisterForm((f) => ({
												...f,
												password: event.target.value,
											}));
										}}
										required
										minLength={6}
										data-testid="register-password"
									/>
									{error && (
										<p role="alert" className="text-sm text-danger">
											{error}
										</p>
									)}
									<Button
										type="submit"
										disabled={loading || !isRegisterValid}
										className="h-12 w-full bg-action text-base text-on-action hover:bg-action-hover md:h-8 md:text-sm"
										data-testid="register-submit"
									>
										{loading ? 'Creating account…' : 'Create account'}
									</Button>
								</form>
							</TabsContent>
						</Tabs>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
