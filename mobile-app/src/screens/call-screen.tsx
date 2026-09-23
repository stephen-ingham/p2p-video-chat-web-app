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
import {isCallId} from '../lib/call-url.ts';
import {useCall} from '../lib/use-call.ts';
import type {AuthSession} from './auth-screen.tsx';
import InCallView from './in-call-view.tsx';

// Create or join a call; once in one, hands over to InCallView.
export default function CallScreen({
	session,
	onLogout,
}: {
	readonly session: AuthSession;
	readonly onLogout: () => void;
}) {
	const {token, email} = session;
	const [joinInput, setJoinInput] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const call = useCall({
		...session,
		onPeerError() {
			setError('Something went wrong connecting to a participant.');
		},
	});

	async function run(action: () => Promise<void>, failure: string) {
		setError('');
		setBusy(true);
		try {
			await action();
		} catch {
			call.teardown();
			setError(failure);
		} finally {
			setBusy(false);
		}
	}

	async function handleCreate() {
		await run(async () => {
			await call.enter(await api.createCall(token));
		}, 'Failed to create a call.');
	}

	async function handleJoin() {
		await run(async () => {
			await call.enter(await api.joinCall(token, joinInput.trim()));
		}, 'Failed to join the call. Check the call ID.');
	}

	if (call.callId) {
		return (
			<InCallView
				callId={call.callId}
				localStreamUrl={call.localStreamUrl}
				remoteStreams={call.remoteStreams}
				participants={call.participants}
				chat={call.chat}
				onSendChat={call.sendChat}
				onHangUp={() => {
					void call.hangUp();
				}}
			/>
		);
	}

	const joinIdValid = isCallId(joinInput.trim());
	return (
		<View style={styles.container}>
			<Text style={styles.heading}>Signed in as {email}</Text>
			{busy ? <ActivityIndicator /> : undefined}
			<Button
				testID="create-call-button"
				title="Create call"
				disabled={busy}
				onPress={() => {
					void handleCreate();
				}}
			/>
			<TextInput
				testID="join-call-input"
				style={styles.input}
				placeholder="Call ID to join"
				autoCapitalize="none"
				value={joinInput}
				onChangeText={setJoinInput}
			/>
			{joinInput.trim() !== '' && !joinIdValid ? (
				<Text testID="join-call-input-error" style={styles.error}>
					Enter a valid call ID (UUID format).
				</Text>
			) : undefined}
			<Button
				testID="join-call-button"
				title="Join call"
				disabled={busy || !joinIdValid}
				onPress={() => {
					void handleJoin();
				}}
			/>
			{error ? (
				<Text testID="call-error" style={styles.error}>
					{error}
				</Text>
			) : undefined}
			<Button testID="logout-button" title="Log out" onPress={onLogout} />
		</View>
	);
}

const styles = StyleSheet.create({
	container: {flex: 1, justifyContent: 'center', gap: 12},
	heading: {fontSize: 16, textAlign: 'center'},
	input: {borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 10},
	error: {color: '#b23b3b'},
});
