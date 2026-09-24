import {StatusBar} from 'expo-status-bar';
import {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import AuthScreen, {type AuthSession} from './src/screens/auth-screen.tsx';
import CallScreen from './src/screens/call-screen.tsx';
import {colors} from './src/theme/theme.ts';

// Root: AuthScreen while logged out, CallScreen once logged in — the same
// switch as the web app's app.tsx. Two screens with no back stack, so this is
// plain state rather than Expo Router (which would also need a new native
// build for its config plugin). The app draws edge to edge (required from
// Android 15), so each screen pads itself with the safe-area insets.
export default function App() {
	const [session, setSession] = useState<AuthSession>();

	return (
		<SafeAreaProvider>
			<View style={styles.container}>
				{session ? (
					<CallScreen
						session={session}
						onLogout={() => {
							setSession(undefined);
						}}
					/>
				) : (
					<AuthScreen onAuthenticated={setSession} />
				)}
				<StatusBar style="light" />
			</View>
		</SafeAreaProvider>
	);
}

const styles = StyleSheet.create({
	container: {flex: 1, backgroundColor: colors.canvas},
});
