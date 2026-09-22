import React, {useState} from 'react';
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

	return (
		<div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
			<div className="w-full max-w-md space-y-6">
				<div className="flex flex-col items-center gap-2">
					<div className="bg-zinc-800 p-3 rounded-full">
						<Video className="h-7 w-7 text-zinc-100" />
					</div>
					<h1 className="text-2xl font-bold text-zinc-100">Voneo</h1>
					<p className="text-sm text-zinc-400">
						Peer-to-peer video calls, right in your browser
					</p>
				</div>

				<Card className="bg-zinc-900 border-zinc-800">
					<CardHeader className="pb-2">
						<CardTitle className="text-zinc-100 text-lg">Get started</CardTitle>
						<CardDescription className="text-zinc-400">
							Sign in or create a new account
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Tabs defaultValue="login">
							<TabsList className="w-full bg-zinc-800 mb-4">
								<TabsTrigger
									value="login"
									className="flex-1 data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100 text-zinc-400"
								>
									Login
								</TabsTrigger>
								<TabsTrigger
									value="register"
									className="flex-1 data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100 text-zinc-400"
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
									<Input
										type="email"
										placeholder="Email"
										value={loginForm.email}
										onChange={(event) => {
											setLoginForm((f) => ({...f, email: event.target.value}));
										}}
										required
										className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-zinc-600"
										suppressHydrationWarning={true}
										data-testid="login-email"
									/>
									{loginEmailError && (
										<p
											className="text-xs text-red-400"
											data-testid="login-email-error"
										>
											{loginEmailError}
										</p>
									)}
									<Input
										type="password"
										placeholder="Password"
										value={loginForm.password}
										onChange={(event) => {
											setLoginForm((f) => ({
												...f,
												password: event.target.value,
											}));
										}}
										required
										className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-zinc-600"
										suppressHydrationWarning={true}
										data-testid="login-password"
									/>
									{error && <p className="text-sm text-red-400">{error}</p>}
									<Button
										type="submit"
										disabled={loading || !isLoginValid}
										className="w-full bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
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
									<Input
										type="text"
										placeholder="Username"
										value={registerForm.username}
										onChange={(event) => {
											setRegisterForm((f) => ({
												...f,
												username: event.target.value,
											}));
										}}
										required
										minLength={3}
										className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-zinc-600"
										suppressHydrationWarning={true}
										data-testid="register-username"
									/>
									{registerUsernameError && (
										<p
											className="text-xs text-red-400"
											data-testid="register-username-error"
										>
											{registerUsernameError}
										</p>
									)}
									<Input
										type="email"
										placeholder="Email"
										value={registerForm.email}
										onChange={(event) => {
											setRegisterForm((f) => ({
												...f,
												email: event.target.value,
											}));
										}}
										required
										className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-zinc-600"
										suppressHydrationWarning={true}
										data-testid="register-email"
									/>
									{registerEmailError && (
										<p
											className="text-xs text-red-400"
											data-testid="register-email-error"
										>
											{registerEmailError}
										</p>
									)}
									<Input
										type="password"
										placeholder="Password"
										value={registerForm.password}
										onChange={(event) => {
											setRegisterForm((f) => ({
												...f,
												password: event.target.value,
											}));
										}}
										required
										minLength={6}
										className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-zinc-600"
										suppressHydrationWarning={true}
										data-testid="register-password"
									/>
									{registerPasswordError && (
										<p
											className="text-xs text-red-400"
											data-testid="register-password-error"
										>
											{registerPasswordError}
										</p>
									)}
									{error && <p className="text-sm text-red-400">{error}</p>}
									<Button
										type="submit"
										disabled={loading || !isRegisterValid}
										className="w-full bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
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
