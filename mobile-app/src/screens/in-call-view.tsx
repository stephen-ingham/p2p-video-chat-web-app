import {useState} from 'react';
import {
	Button,
	FlatList,
	StyleSheet,
	Text,
	TextInput,
	View,
} from 'react-native';
import {RTCView} from 'react-native-webrtc';

export type ChatLine = {id: number; email: string; message: string};

// The in-call UI: local + remote video, participants, chat and hang up.
// Stateless apart from the chat draft; CallScreen owns the call state.
export default function InCallView({
	callId,
	localStreamUrl,
	remoteStreams,
	participants,
	chat,
	onSendChat,
	onHangUp,
}: {
	readonly callId: string;
	readonly localStreamUrl: string | undefined;
	readonly remoteStreams: Record<string, string>;
	readonly participants: string[];
	readonly chat: ChatLine[];
	readonly onSendChat: (message: string) => void;
	readonly onHangUp: () => void;
}) {
	const [draft, setDraft] = useState('');

	return (
		<View style={styles.container}>
			<Text selectable testID="call-id" style={styles.callId}>
				Call ID: {callId}
			</Text>
			<Text testID="participants" style={styles.dim}>
				{participants.length > 0
					? `On the call: ${participants.join(', ')}`
					: 'Waiting for others to join…'}
			</Text>
			<View style={styles.videos}>
				{localStreamUrl ? (
					<RTCView
						mirror
						testID="local-video"
						streamURL={localStreamUrl}
						objectFit="cover"
						style={styles.video}
					/>
				) : undefined}
				{Object.entries(remoteStreams).map(([email, url]) => (
					<RTCView
						key={email}
						testID={`remote-video-${email}`}
						streamURL={url}
						objectFit="cover"
						style={styles.video}
					/>
				))}
			</View>
			<FlatList
				style={styles.chat}
				data={chat}
				keyExtractor={(line) => String(line.id)}
				renderItem={({item}) => (
					<Text style={styles.chatLine}>
						<Text style={styles.bold}>{item.email}: </Text>
						{item.message}
					</Text>
				)}
			/>
			<View style={styles.row}>
				<TextInput
					testID="chat-input"
					style={[styles.input, styles.grow]}
					placeholder="Message"
					value={draft}
					onChangeText={setDraft}
				/>
				<Button
					testID="chat-send"
					title="Send"
					disabled={draft.trim() === ''}
					onPress={() => {
						onSendChat(draft.trim());
						setDraft('');
					}}
				/>
			</View>
			<Button
				testID="hang-up-button"
				title="Hang up"
				color="#b23b3b"
				onPress={onHangUp}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {flex: 1, gap: 8},
	callId: {fontFamily: 'monospace', fontSize: 12},
	dim: {color: '#666'},
	videos: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
	video: {width: 160, height: 213, backgroundColor: '#222'},
	chat: {flex: 1, backgroundColor: '#f4f4f4', padding: 8},
	chatLine: {marginBottom: 4},
	bold: {fontWeight: '600'},
	row: {flexDirection: 'row', gap: 8, alignItems: 'center'},
	input: {borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8},
	grow: {flex: 1},
});
