import Send from 'lucide-react-native/icons/send';
import X from 'lucide-react-native/icons/x';
import {useState} from 'react';
import {
	FlatList,
	KeyboardAvoidingView,
	Modal,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import IconButton from '../components/icon-button.tsx';
import {useReduceMotion} from '../lib/use-reduce-motion.ts';
import {colors, minTouch, radius, space, type} from '../theme/theme.ts';
import type {ChatLine} from './in-call-view.tsx';

// The call's chat, as a bottom sheet over the video. The web app's chat
// sidebar doesn't fit beside video on a phone. Android's back button closes it.
export default function ChatSheet({
	visible,
	chat,
	participants,
	onSend,
	onClose,
}: {
	readonly visible: boolean;
	readonly chat: ChatLine[];
	readonly participants: string[];
	readonly onSend: (message: string) => void;
	readonly onClose: () => void;
}) {
	const insets = useSafeAreaInsets();
	const reduceMotion = useReduceMotion();
	const [draft, setDraft] = useState('');
	const message = draft.trim();

	function send() {
		if (!message) return;
		onSend(message);
		setDraft('');
	}

	return (
		<Modal
			transparent
			statusBarTranslucent
			navigationBarTranslucent
			visible={visible}
			animationType={reduceMotion ? 'none' : 'slide'}
			onRequestClose={onClose}
		>
			<KeyboardAvoidingView behavior="padding" style={styles.overlay}>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Close chat"
					style={styles.backdrop}
					onPress={onClose}
				/>
				<View
					accessibilityViewIsModal
					style={[styles.sheet, {paddingBottom: insets.bottom + space.md}]}
				>
					<View style={styles.header}>
						<View style={styles.headerText}>
							<Text accessibilityRole="header" style={styles.title}>
								Chat
							</Text>
							{participants.length > 0 ? (
								<Text numberOfLines={2} style={styles.caption}>
									{participants.join(', ')}
								</Text>
							) : undefined}
						</View>
						<IconButton icon={X} label="Close chat" onPress={onClose} />
					</View>

					<FlatList
						style={styles.messages}
						contentContainerStyle={styles.messageList}
						data={chat}
						keyExtractor={(line) => String(line.id)}
						ListEmptyComponent={
							<Text style={[styles.caption, styles.empty]}>
								No messages yet
							</Text>
						}
						renderItem={({item}) => (
							<View accessible style={styles.message}>
								<View style={styles.avatar}>
									<Text style={styles.avatarText}>
										{item.email[0]?.toUpperCase() ?? '?'}
									</Text>
								</View>
								<View style={styles.messageText}>
									<Text style={styles.sender}>{item.email}</Text>
									<Text style={styles.body}>{item.message}</Text>
								</View>
							</View>
						)}
					/>

					<View style={styles.composer}>
						<TextInput
							testID="chat-input"
							accessibilityLabel="Chat message"
							placeholder="Type a message…"
							placeholderTextColor={colors.inkMuted}
							returnKeyType="send"
							style={styles.input}
							value={draft}
							onChangeText={setDraft}
							onSubmitEditing={send}
						/>
						<IconButton
							testID="chat-send"
							icon={Send}
							label="Send message"
							disabled={!message}
							onPress={send}
						/>
					</View>
				</View>
			</KeyboardAvoidingView>
		</Modal>
	);
}

const styles = StyleSheet.create({
	overlay: {flex: 1, justifyContent: 'flex-end'},
	backdrop: {flex: 1, backgroundColor: colors.scrim},
	sheet: {
		maxHeight: '75%',
		backgroundColor: colors.surface,
		borderTopLeftRadius: radius + 6,
		borderTopRightRadius: radius + 6,
		borderColor: colors.line,
		borderWidth: 1,
		paddingHorizontal: space.lg,
		paddingTop: space.md,
		gap: space.md,
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: space.md,
	},
	headerText: {flexShrink: 1, gap: 2},
	title: {...type.heading, color: colors.ink},
	caption: {...type.caption, color: colors.inkMuted},
	messages: {flexGrow: 0},
	messageList: {gap: space.md, paddingVertical: space.xs},
	empty: {textAlign: 'center', paddingVertical: space.lg},
	message: {flexDirection: 'row', gap: space.sm, alignItems: 'flex-start'},
	avatar: {
		width: 28,
		height: 28,
		borderRadius: 14,
		backgroundColor: colors.surfaceActive,
		alignItems: 'center',
		justifyContent: 'center',
	},
	avatarText: {...type.caption, fontWeight: '600', color: colors.ink},
	messageText: {flexShrink: 1},
	sender: {...type.caption, fontWeight: '500', color: colors.inkSoft},
	body: {...type.body, color: colors.ink},
	composer: {flexDirection: 'row', alignItems: 'center', gap: space.sm},
	input: {
		...type.body,
		flex: 1,
		minHeight: minTouch,
		borderWidth: 1,
		borderColor: colors.lineControl,
		borderRadius: radius,
		backgroundColor: colors.surfaceRaised,
		paddingHorizontal: space.md,
		color: colors.ink,
	},
});
