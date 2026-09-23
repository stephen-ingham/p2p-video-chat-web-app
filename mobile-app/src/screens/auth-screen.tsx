import {useState} from 'react';
import {
	ActivityIndicator,
	Button,
	StyleSheet,
	Text,
	TextInput,
	View,
} from 'react-native';
import * as api from '../lib/api.ts';

export type AuthSession = {token: string; email: string; username: string};

type Mode = 'login' | 'register';

// Login + register, like the web app's auth-screen.tsx. Registering signs the
// user up and then logs them in. The login response has no username, so it's
// taken from the email's local part for the call's join message.
export default function AuthScreen({
	onAuthenticated,
}: {
	readonly onAuthenticated: (session: AuthSession) => void;
}) {
	const [mode, setMode] = useState<Mode>('login');
	const [username, setUsername] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);

	async function handleSubmit() {
		setError('');
		setBusy(true);
		try {
			const trimmedEmail = email.trim();
			if (mode === 'register') {
				await api.signup(username.trim(), trimmedEmail, password);
			}

			const token = await api.login(trimmedEmail, password);
			onAuthenticated({
				token,
				email: trimmedEmail,
				username:
					mode === 'register'
						? username.trim()
						: (trimmedEmail.split('@')[0] ?? trimmedEmail),
			});
		} catch {
			setError(
				mode === 'login'
					? 'Login failed. Check your email and password.'
					: 'Registration failed. Check your details and try again.',
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<View style={styles.container}>
			<Text style={styles.heading}>Voneo</Text>
			<View style={styles.row}>
				<Button
					testID="login-tab"
					title="Log in"
					disabled={mode === 'login'}
					onPress={() => {
						setMode('login');
					}}
				/>
				<Button
					testID="register-tab"
					title="Register"
					disabled={mode === 'register'}
					onPress={() => {
						setMode('register');
					}}
				/>
			</View>
			{mode === 'register' && (
				<TextInput
					testID="username-input"
					style={styles.input}
					placeholder="Username"
					autoCapitalize="none"
					value={username}
					onChangeText={setUsername}
				/>
			)}
			<TextInput
				testID="email-input"
				style={styles.input}
				placeholder="Email"
				autoCapitalize="none"
				keyboardType="email-address"
				value={email}
				onChangeText={setEmail}
			/>
			<TextInput
				secureTextEntry
				testID="password-input"
				style={styles.input}
				placeholder="Password"
				value={password}
				onChangeText={setPassword}
			/>
			{error ? (
				<Text testID="auth-error" style={styles.error}>
					{error}
				</Text>
			) : undefined}
			{busy ? (
				<ActivityIndicator />
			) : (
				<Button
					testID="auth-submit"
					title={mode === 'login' ? 'Log in' : 'Create account'}
					onPress={() => {
						void handleSubmit();
					}}
				/>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {flex: 1, justifyContent: 'center', padding: 24, gap: 12},
	heading: {fontSize: 28, fontWeight: '700', textAlign: 'center'},
	row: {flexDirection: 'row', justifyContent: 'center', gap: 12},
	input: {borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 10},
	error: {color: '#b23b3b'},
});
