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
import {Input} from '@/components/ui/input.tsx';
import {Button} from '@/components/ui/button.tsx';
import {useTokenWorker} from '@/lib/use-token-worker.ts';
import {useIsMobile} from '@/lib/use-is-mobile.ts';

type AuthScreenProps = {
	onAuthenticated: (email: string, username: string) => void;
};

// Inputs grow to a 48px touch target below the md breakpoint, like the mobile
// app's TextField.
const inputClass =
	'h-12 px-3 text-base md:h-8 md:px-2.5 md:text-sm bg-surface-raised border-line-control text-ink placeholder:text-ink-muted focus-visible:ring-focus';

// A visible label above its input below the md breakpoint, as in the mobile
// app; on desktop the placeholder shows the field's name and the label is
// screen-reader only.
function Field({
	label,
	id,
	children,
}: {
	label: string;
	id: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1">
			<label
				htmlFor={id}
				className="text-sm font-medium text-ink-soft md:sr-only"
			>
				{label}
			</label>
			{children}
		</div>
	);
}

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

export default function AuthScreen({onAuthenticated}: AuthScreenProps) {
	const {login, register} = useTokenWorker();

	const [loginForm, setLoginForm] = useState({email: '', password: ''});
	const [registerForm, setRegisterForm] = useState({
		username: '',
		email: '',
		password: '',
	});
	const [error, setError] = useState('');
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
		setLoading(true);
		try {
			const result = await login(loginForm.email, loginForm.password);
			if (result === 'Login failed') {
				setError('Invalid email or password.');
				return;
			}

			onAuthenticated(loginForm.email, loginForm.email.split('@')[0]);
		} catch {
			setError('Something went wrong. Please try again.');
		} finally {
			setLoading(false);
		}
	}

	async function handleRegister(event: React.SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!isRegisterValid) return;
		setError('');
		setLoading(true);
		try {
			const result = await register(
				registerForm.username,
				registerForm.email,
				registerForm.password,
			);
			if (result === 'Signup failed') {
				setError('Registration failed. Email may already be in use.');
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
			setError('Something went wrong. Please try again.');
		} finally {
			setLoading(false);
		}
	}

	const isMobile = useIsMobile();
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
						<Tabs defaultValue="login">
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
									<Field label="Email" id={`${id}-login-email`}>
										<Input
											id={`${id}-login-email`}
											type="email"
											placeholder={isMobile ? 'you@example.com' : 'Email'}
											value={loginForm.email}
											onChange={(event) => {
												setLoginForm((f) => ({
													...f,
													email: event.target.value,
												}));
											}}
											required
											className={inputClass}
											suppressHydrationWarning={true}
											data-testid="login-email"
										/>
										{loginEmailError && (
											<p
												className="text-xs text-danger"
												data-testid="login-email-error"
											>
												{loginEmailError}
											</p>
										)}
									</Field>
									<Field label="Password" id={`${id}-login-password`}>
										<Input
											id={`${id}-login-password`}
											type="password"
											placeholder={isMobile ? undefined : 'Password'}
											value={loginForm.password}
											onChange={(event) => {
												setLoginForm((f) => ({
													...f,
													password: event.target.value,
												}));
											}}
											required
											className={inputClass}
											suppressHydrationWarning={true}
											data-testid="login-password"
										/>
									</Field>
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
									<Field label="Username" id={`${id}-register-username`}>
										<Input
											id={`${id}-register-username`}
											type="text"
											placeholder={
												isMobile ? 'At least 3 characters' : 'Username'
											}
											value={registerForm.username}
											onChange={(event) => {
												setRegisterForm((f) => ({
													...f,
													username: event.target.value,
												}));
											}}
											required
											minLength={3}
											className={inputClass}
											suppressHydrationWarning={true}
											data-testid="register-username"
										/>
										{registerUsernameError && (
											<p
												className="text-xs text-danger"
												data-testid="register-username-error"
											>
												{registerUsernameError}
											</p>
										)}
									</Field>
									<Field label="Email" id={`${id}-register-email`}>
										<Input
											id={`${id}-register-email`}
											type="email"
											placeholder={isMobile ? 'you@example.com' : 'Email'}
											value={registerForm.email}
											onChange={(event) => {
												setRegisterForm((f) => ({
													...f,
													email: event.target.value,
												}));
											}}
											required
											className={inputClass}
											suppressHydrationWarning={true}
											data-testid="register-email"
										/>
										{registerEmailError && (
											<p
												className="text-xs text-danger"
												data-testid="register-email-error"
											>
												{registerEmailError}
											</p>
										)}
									</Field>
									<Field label="Password" id={`${id}-register-password`}>
										<Input
											id={`${id}-register-password`}
											type="password"
											placeholder={
												isMobile ? 'At least 6 characters' : 'Password'
											}
											value={registerForm.password}
											onChange={(event) => {
												setRegisterForm((f) => ({
													...f,
													password: event.target.value,
												}));
											}}
											required
											minLength={6}
											className={inputClass}
											suppressHydrationWarning={true}
											data-testid="register-password"
										/>
										{registerPasswordError && (
											<p
												className="text-xs text-danger"
												data-testid="register-password-error"
											>
												{registerPasswordError}
											</p>
										)}
									</Field>
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
