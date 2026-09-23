import {StatusBar} from 'expo-status-bar';
import {useRef, useState} from 'react';
import {
	Button,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from 'react-native';
import * as api from './src/lib/api.ts';
import {apiBaseUrl} from './src/lib/config.ts';
import {connectToCall, type CallConnection} from './src/lib/signalling.ts';

// Phase 2 connectivity check: log in -> create or join a call -> connect to
// its WebSocket and list the participants, against the real dev backend.
// Stand-in until the Phase 3 auth/call screens replace it.
export default function App() {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [joinId, setJoinId] = useState('');
	const [token, setToken] = useState<string>();
	const [callId, setCallId] = useState<string>();
	const [log, setLog] = useState<string[]>([]);
	const connection = useRef<CallConnection | undefined>(undefined);

	function addLog(line: string) {
		setLog((lines) => [...lines, line]);
	}

	async function run(label: string, action: () => Promise<void>) {
		try {
			await action();
		} catch (error) {
			addLog(
				`✖ ${label}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async function enterCall(id: string) {
		const username = email.split('@')[0] ?? email;
		connection.current = await connectToCall({callId: id, email, username});
		setCallId(id);
		const others = connection.current.participants;
		addLog(
			`✔ WebSocket joined ${id} — others on call: ${others.length > 0 ? others.join(', ') : 'none'}`,
		);
		connection.current.socket.addEventListener('message', (event) => {
			addLog(`← ${String(event.data)}`);
		});
	}

	async function handleLogin() {
		await run('login', async () => {
			setToken(await api.login(email.trim(), password));
			addLog(`✔ Logged in as ${email.trim()}`);
		});
	}

	async function handleCreate() {
		await run('create', async () => {
			if (!token) return;
			const id = await api.createCall(token);
			addLog(`✔ Created call ${id}`);
			await enterCall(id);
		});
	}

	async function handleJoin() {
		await run('join', async () => {
			if (!token) return;
			const id = await api.joinCall(token, joinId.trim());
			addLog(`✔ Joined call ${id} over HTTP`);
			await enterCall(id);
		});
	}

	async function handleLeave() {
		await run('leave', async () => {
			if (!token || !callId) return;
			await api.leaveCall(token, callId);
			connection.current?.socket.close();
			connection.current = undefined;
			setCallId(undefined);
			addLog('✔ Left call');
		});
	}

	return (
		<View style={styles.container}>
			<Text style={styles.heading}>Voneo — connectivity check</Text>
			<Text style={styles.dim}>API: {apiBaseUrl}</Text>
			<TextInput
				style={styles.input}
				placeholder="Email"
				autoCapitalize="none"
				keyboardType="email-address"
				value={email}
				onChangeText={setEmail}
			/>
			<TextInput
				secureTextEntry
				style={styles.input}
				placeholder="Password"
				value={password}
				onChangeText={setPassword}
			/>
			<Button
				title="Log in"
				onPress={() => {
					void handleLogin();
				}}
			/>
			<View style={styles.row}>
				<Button
					title="Create call"
					disabled={!token || Boolean(callId)}
					onPress={() => {
						void handleCreate();
					}}
				/>
				<Button
					title="Leave call"
					disabled={!callId}
					onPress={() => {
						void handleLeave();
					}}
				/>
			</View>
			<TextInput
				style={styles.input}
				placeholder="Call ID to join"
				autoCapitalize="none"
				value={joinId}
				onChangeText={setJoinId}
			/>
			<Button
				title="Join call"
				disabled={!token || Boolean(callId)}
				onPress={() => {
					void handleJoin();
				}}
			/>
			<ScrollView style={styles.log}>
				{log.map((line, index) => (
					// Append-only log: lines never reorder, so the index is a stable key.
					<Text key={index} selectable style={styles.logLine}>
						{line}
					</Text>
				))}
			</ScrollView>
			<StatusBar style="auto" />
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: 16,
		paddingTop: 56,
		gap: 8,
		backgroundColor: '#fff',
	},
	heading: {fontSize: 18, fontWeight: '600'},
	dim: {color: '#666'},
	input: {borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8},
	row: {flexDirection: 'row', justifyContent: 'space-between'},
	log: {flex: 1, marginTop: 8, backgroundColor: '#f4f4f4', padding: 8},
	logLine: {fontFamily: 'monospace', fontSize: 12, marginBottom: 4},
});
