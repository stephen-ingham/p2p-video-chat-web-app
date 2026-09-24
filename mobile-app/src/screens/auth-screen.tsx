import Video from 'lucide-react-native/icons/video';
import {useState} from 'react';
import {
	KeyboardAvoidingView,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Button from '../components/button.tsx';
import Card from '../components/card.tsx';
import Tabs from '../components/tabs.tsx';
import TextField from '../components/text-field.tsx';
import * as api from '../lib/api.ts';
import {colors, space, type} from '../theme/theme.ts';

export type AuthSession = {token: string; email: string; username: string};

type Mode = 'login' | 'register';

const tabs = [
	{value: 'login', label: 'Login', testId: 'login-tab'},
	{value: 'register', label: 'Register', testId: 'register-tab'},
] as const;

// Login + register, laid out like the web app's auth-screen.tsx. Registering
// signs the user up and then logs them in. The login response has no
// username, so it's taken from the email's local part for the call's join
// message.
export default function AuthScreen({
	onAuthenticated,
}: {
	readonly onAuthenticated: (session: AuthSession) => void;
}) {
	const insets = useSafeAreaInsets();
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

	let submitLabel = mode === 'login' ? 'Sign in' : 'Create account';
	if (busy) {
		submitLabel = mode === 'login' ? 'Signing in…' : 'Creating account…';
	}

	return (
		<KeyboardAvoidingView behavior="padding" style={styles.screen}>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={[
					styles.content,
					{
						paddingTop: insets.top + space.xl,
						paddingBottom: insets.bottom + space.xl,
					},
				]}
			>
				<View style={styles.brand}>
					<View style={styles.logo}>
						<Video color={colors.ink} size={28} />
					</View>
					<Text accessibilityRole="header" style={styles.title}>
						Voneo
					</Text>
					<Text style={styles.tagline}>
						Peer-to-peer video calls, wherever you are
					</Text>
				</View>

				<Card title="Get started" description="Sign in or create a new account">
					<Tabs
						tabs={tabs}
						value={mode}
						onChange={(next) => {
							setMode(next);
							setError('');
						}}
					/>
					<View style={styles.form}>
						{mode === 'register' && (
							<TextField
								testID="username-input"
								label="Username"
								placeholder="At least 3 characters"
								autoCapitalize="none"
								autoComplete="username-new"
								value={username}
								onChangeText={setUsername}
							/>
						)}
						<TextField
							testID="email-input"
							label="Email"
							placeholder="you@example.com"
							autoCapitalize="none"
							autoComplete="email"
							keyboardType="email-address"
							value={email}
							onChangeText={setEmail}
						/>
						<TextField
							secureTextEntry
							testID="password-input"
							label="Password"
							placeholder={mode === 'register' ? 'At least 6 characters' : ''}
							autoComplete={
								mode === 'register' ? 'new-password' : 'current-password'
							}
							value={password}
							onChangeText={setPassword}
						/>
						{error ? (
							<Text
								accessibilityLiveRegion="polite"
								testID="auth-error"
								style={styles.error}
							>
								{error}
							</Text>
						) : undefined}
						<Button
							testID="auth-submit"
							label={submitLabel}
							busy={busy}
							onPress={() => {
								void handleSubmit();
							}}
						/>
					</View>
				</Card>
			</ScrollView>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	screen: {flex: 1},
	content: {
		flexGrow: 1,
		justifyContent: 'center',
		paddingHorizontal: space.lg,
		gap: space.xl,
	},
	brand: {alignItems: 'center', gap: space.sm},
	logo: {
		backgroundColor: colors.surfaceRaised,
		padding: space.md,
		borderRadius: 999,
	},
	title: {...type.title, color: colors.ink},
	tagline: {...type.caption, color: colors.inkMuted, textAlign: 'center'},
	form: {gap: space.md},
	error: {...type.caption, color: colors.danger},
});
