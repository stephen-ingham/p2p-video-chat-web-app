import {StatusBar} from 'expo-status-bar';
import {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import AuthScreen, {type AuthSession} from './src/screens/auth-screen.tsx';
import CallScreen from './src/screens/call-screen.tsx';

// Root: AuthScreen while logged out, CallScreen once logged in — the same
// switch as the web app's app.tsx. Two screens with no back stack, so this is
// plain state rather than Expo Router (which would also need a new native
// build for its config plugin).
export default function App() {
	const [session, setSession] = useState<AuthSession>();

	return (
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
			<StatusBar style="auto" />
		</View>
	);
}

const styles = StyleSheet.create({
	container: {flex: 1, padding: 16, paddingTop: 56, backgroundColor: '#fff'},
});
