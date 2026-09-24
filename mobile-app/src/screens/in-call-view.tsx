import MessageSquare from 'lucide-react-native/icons/message-square';
import Mic from 'lucide-react-native/icons/mic';
import MicOff from 'lucide-react-native/icons/mic-off';
import PhoneOff from 'lucide-react-native/icons/phone-off';
import Video from 'lucide-react-native/icons/video';
import VideoOff from 'lucide-react-native/icons/video-off';
import {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {RTCView} from 'react-native-webrtc';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import IconButton from '../components/icon-button.tsx';
import {colors, radius, space, type} from '../theme/theme.ts';
import ChatSheet from './chat-sheet.tsx';

export type ChatLine = {id: number; email: string; message: string};

// The in-call UI: everyone else's video fills the screen, yours sits in a
// corner, and the controls are along the bottom within thumb reach. Chat
// opens as a sheet. Stateless apart from the sheet; CallScreen owns the call.
export default function InCallView({
	callId,
	localStreamUrl,
	remoteStreams,
	participants,
	chat,
	micOn,
	cameraOn,
	onToggleMic,
	onToggleCamera,
	onSendChat,
	onHangUp,
}: {
	readonly callId: string;
	readonly localStreamUrl: string | undefined;
	readonly remoteStreams: Record<string, string>;
	readonly participants: string[];
	readonly chat: ChatLine[];
	readonly micOn: boolean;
	readonly cameraOn: boolean;
	readonly onToggleMic: () => void;
	readonly onToggleCamera: () => void;
	readonly onSendChat: (message: string) => void;
	readonly onHangUp: () => void;
}) {
	const insets = useSafeAreaInsets();
	const [chatOpen, setChatOpen] = useState(false);
	const [seenMessages, setSeenMessages] = useState(0);
	const remotes = Object.entries(remoteStreams);

	// Messages count as read while the sheet is open.
	useEffect(() => {
		if (chatOpen) setSeenMessages(chat.length);
	}, [chatOpen, chat.length]);
	const unread = chatOpen ? 0 : chat.length - seenMessages;

	return (
		<View style={styles.screen}>
			<View style={styles.remotes}>
				{remotes.length === 0 ? (
					<View style={styles.waiting}>
						<Text style={styles.waitingText}>
							Share the call ID so others can join.
						</Text>
					</View>
				) : (
					remotes.map(([email, url]) => (
						<View
							key={email}
							accessible
							accessibilityLabel={`Video from ${email}`}
							style={styles.remote}
						>
							<RTCView
								testID={`remote-video-${email}`}
								streamURL={url}
								objectFit="cover"
								style={styles.fill}
							/>
							<Text numberOfLines={1} style={styles.tileLabel}>
								{email}
							</Text>
						</View>
					))
				)}
			</View>

			<View style={[styles.topBar, {paddingTop: insets.top + space.sm}]}>
				<Text
					selectable
					testID="call-id"
					style={styles.callId}
					maxFontSizeMultiplier={1.5}
				>
					Call ID: {callId}
				</Text>
				<Text
					accessibilityLiveRegion="polite"
					testID="participants"
					style={styles.participants}
				>
					{participants.length > 0
						? `On the call: ${participants.join(', ')}`
						: 'Waiting for others to join…'}
				</Text>
			</View>

			<View
				accessible
				accessibilityLabel={cameraOn ? 'Your video' : 'Your camera is off'}
				style={[
					styles.local,
					{bottom: insets.bottom + controlsHeight + space.lg},
				]}
			>
				{localStreamUrl && cameraOn ? (
					<RTCView
						mirror
						testID="local-video"
						streamURL={localStreamUrl}
						objectFit="cover"
						style={styles.fill}
						zOrder={1}
					/>
				) : (
					<VideoOff color={colors.inkMuted} size={24} />
				)}
			</View>

			<View
				style={[styles.controls, {paddingBottom: insets.bottom + space.md}]}
			>
				<View style={styles.controlGroup}>
					<IconButton
						testID="mic-toggle"
						icon={micOn ? Mic : MicOff}
						label="Microphone"
						checked={micOn}
						onPress={onToggleMic}
					/>
					<IconButton
						testID="camera-toggle"
						icon={cameraOn ? Video : VideoOff}
						label="Camera"
						checked={cameraOn}
						onPress={onToggleCamera}
					/>
					<IconButton
						testID="chat-open"
						icon={MessageSquare}
						label={unread > 0 ? `Chat, ${unread} unread` : 'Chat'}
						badge={unread}
						onPress={() => {
							setChatOpen(true);
						}}
					/>
				</View>
				<IconButton
					danger
					testID="hang-up-button"
					icon={PhoneOff}
					label="Hang up"
					onPress={onHangUp}
				/>
			</View>

			<ChatSheet
				visible={chatOpen}
				chat={chat}
				participants={participants}
				onSend={onSendChat}
				onClose={() => {
					setChatOpen(false);
				}}
			/>
		</View>
	);
}

// IconButton's height plus the bar's top padding.
const controlsHeight = 56 + space.md;

const styles = StyleSheet.create({
	screen: {flex: 1, backgroundColor: colors.canvas},
	remotes: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, gap: 2},
	remote: {flex: 1, backgroundColor: colors.surface},
	fill: {flex: 1},
	waiting: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		padding: space.xl,
	},
	waitingText: {...type.body, color: colors.inkMuted, textAlign: 'center'},
	tileLabel: {
		...type.caption,
		position: 'absolute',
		left: space.sm,
		bottom: space.sm,
		maxWidth: '80%',
		color: colors.ink,
		backgroundColor: colors.scrim,
		borderRadius: radius / 2,
		paddingHorizontal: space.sm,
		paddingVertical: 2,
	},
	topBar: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		backgroundColor: colors.scrim,
		paddingHorizontal: space.lg,
		paddingBottom: space.sm,
		gap: 2,
	},
	callId: {...type.mono, color: colors.inkSoft},
	participants: {...type.caption, color: colors.ink},
	local: {
		position: 'absolute',
		right: space.lg,
		width: 96,
		height: 128,
		borderRadius: radius,
		borderWidth: 1,
		borderColor: colors.lineControl,
		backgroundColor: colors.surface,
		overflow: 'hidden',
		alignItems: 'center',
		justifyContent: 'center',
	},
	controls: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		backgroundColor: colors.scrim,
		paddingHorizontal: space.xl,
		paddingTop: space.md,
	},
	controlGroup: {flexDirection: 'row', gap: space.md},
});
