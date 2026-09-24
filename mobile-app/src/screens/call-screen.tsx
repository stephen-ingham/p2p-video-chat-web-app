import LogOut from 'lucide-react-native/icons/log-out';
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
import TextField from '../components/text-field.tsx';
import * as api from '../lib/api.ts';
import {isCallId} from '../lib/call-url.ts';
import {useCall} from '../lib/use-call.ts';
import {colors, space, type} from '../theme/theme.ts';
import type {AuthSession} from './auth-screen.tsx';
import InCallView from './in-call-view.tsx';

// Create or join a call; once in one, hands over to InCallView. The web app
// puts both in one row; here they stack, full width, for thumbs.
export default function CallScreen({
	session,
	onLogout,
}: {
	readonly session: AuthSession;
	readonly onLogout: () => void;
}) {
	const insets = useSafeAreaInsets();
	const {token, username} = session;
	const [joinInput, setJoinInput] = useState('');
	const [busy, setBusy] = useState<'create' | 'join'>();
	const [error, setError] = useState('');
	const call = useCall({
		...session,
		onPeerError() {
			setError('Something went wrong connecting to a participant.');
		},
	});

	async function run(
		kind: 'create' | 'join',
		action: () => Promise<void>,
		failure: string,
	) {
		setError('');
		setBusy(kind);
		try {
			await action();
		} catch {
			call.teardown();
			setError(failure);
		} finally {
			setBusy(undefined);
		}
	}

	async function handleCreate() {
		await run(
			'create',
			async () => {
				await call.enter(await api.createCall(token));
			},
			'Failed to create a call.',
		);
	}

	async function handleJoin() {
		await run(
			'join',
			async () => {
				await call.enter(await api.joinCall(token, joinInput.trim()));
			},
			'Failed to join the call. Check the call ID.',
		);
	}

	if (call.callId) {
		return (
			<InCallView
				callId={call.callId}
				localStreamUrl={call.localStreamUrl}
				remoteStreams={call.remoteStreams}
				participants={call.participants}
				chat={call.chat}
				micOn={call.micOn}
				cameraOn={call.cameraOn}
				onToggleMic={call.toggleMic}
				onToggleCamera={call.toggleCamera}
				onSendChat={call.sendChat}
				onHangUp={() => {
					void call.hangUp();
				}}
			/>
		);
	}

	const joinId = joinInput.trim();
	const joinIdValid = isCallId(joinId);
	return (
		<View style={styles.screen}>
			<View style={[styles.topBar, {paddingTop: insets.top + space.sm}]}>
				<View style={styles.brand}>
					<Video color={colors.inkSoft} size={20} />
					<Text style={styles.brandName}>Voneo</Text>
				</View>
				<View style={styles.account}>
					<Text
						numberOfLines={1}
						style={styles.username}
						accessibilityLabel={`Signed in as ${username}`}
					>
						{username}
					</Text>
					<Button
						testID="logout-button"
						variant="ghost"
						label="Log out"
						icon={LogOut}
						onPress={onLogout}
					/>
				</View>
			</View>

			<KeyboardAvoidingView behavior="padding" style={styles.screen}>
				<ScrollView
					keyboardShouldPersistTaps="handled"
					contentContainerStyle={[
						styles.content,
						{paddingBottom: insets.bottom + space.xl},
					]}
				>
					<Card
						title="Start a call"
						description="Create a call, then share its ID with the people you want to talk to."
					>
						<Button
							testID="create-call-button"
							label={busy === 'create' ? 'Creating…' : 'Create call'}
							icon={Video}
							busy={busy === 'create'}
							disabled={busy !== undefined}
							onPress={() => {
								void handleCreate();
							}}
						/>
					</Card>

					<Card
						title="Join a call"
						description="Paste the call ID someone shared with you."
					>
						<TextField
							testID="join-call-input"
							label="Call ID"
							placeholder="e.g. a1b2c3d4-e5f6-…"
							autoCapitalize="none"
							autoCorrect={false}
							value={joinInput}
							error={
								joinId !== '' && !joinIdValid
									? 'Enter a valid call ID (UUID format).'
									: undefined
							}
							errorTestID="join-call-input-error"
							onChangeText={setJoinInput}
						/>
						<Button
							testID="join-call-button"
							variant="outline"
							label={busy === 'join' ? 'Joining…' : 'Join call'}
							busy={busy === 'join'}
							disabled={busy !== undefined || !joinIdValid}
							onPress={() => {
								void handleJoin();
							}}
						/>
					</Card>

					{error ? (
						<Text
							accessibilityLiveRegion="polite"
							testID="call-error"
							style={styles.error}
						>
							{error}
						</Text>
					) : undefined}
				</ScrollView>
			</KeyboardAvoidingView>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {flex: 1},
	topBar: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: space.lg,
		paddingBottom: space.sm,
		borderBottomWidth: 1,
		borderBottomColor: colors.line,
		gap: space.md,
	},
	brand: {flexDirection: 'row', alignItems: 'center', gap: space.sm},
	brandName: {...type.heading, fontSize: 16, color: colors.ink},
	account: {
		flexShrink: 1,
		flexDirection: 'row',
		alignItems: 'center',
		gap: space.xs,
	},
	username: {...type.caption, color: colors.inkMuted, flexShrink: 1},
	content: {padding: space.lg, gap: space.lg},
	error: {...type.caption, color: colors.danger},
});
