import type {LucideIcon} from 'lucide-react-native';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, minTouch, type} from '../theme/theme.ts';

// A round, icon-only button for the in-call controls. It has no visible text,
// so `label` is what TalkBack reads out.
export default function IconButton({
	icon: Icon,
	label,
	onPress,
	danger = false,
	disabled = false,
	// For on/off controls (mic, camera). Undefined for plain buttons.
	checked,
	badge,
	testID,
}: {
	readonly icon: LucideIcon;
	readonly label: string;
	readonly onPress: () => void;
	readonly danger?: boolean;
	readonly disabled?: boolean;
	readonly checked?: boolean;
	// A small count on the corner, e.g. unread chat messages.
	readonly badge?: number;
	readonly testID?: string;
}) {
	const background = danger ? colors.danger : colors.surfaceActive;
	const pressedBackground = danger ? colors.danger : colors.surfaceActiveHover;

	return (
		<Pressable
			accessibilityRole={checked === undefined ? 'button' : 'switch'}
			accessibilityLabel={label}
			accessibilityState={
				checked === undefined ? {disabled} : {checked, disabled}
			}
			disabled={disabled}
			testID={testID}
			style={({pressed}) => [
				styles.button,
				{backgroundColor: pressed ? pressedBackground : background},
				pressed && danger && styles.dangerPressed,
				disabled && styles.disabled,
			]}
			onPress={onPress}
		>
			<Icon color={danger ? colors.onAction : colors.ink} size={24} />
			{badge ? (
				<View style={styles.badge}>
					<Text style={styles.badgeText} maxFontSizeMultiplier={1.3}>
						{badge > 9 ? '9+' : badge}
					</Text>
				</View>
			) : undefined}
		</Pressable>
	);
}

const size = minTouch + 8;

const styles = StyleSheet.create({
	button: {
		width: size,
		height: size,
		borderRadius: size / 2,
		alignItems: 'center',
		justifyContent: 'center',
	},
	dangerPressed: {opacity: 0.85},
	disabled: {opacity: 0.5},
	badge: {
		position: 'absolute',
		top: 0,
		right: 0,
		minWidth: 20,
		height: 20,
		borderRadius: 10,
		paddingHorizontal: 4,
		backgroundColor: colors.action,
		alignItems: 'center',
		justifyContent: 'center',
	},
	badgeText: {...type.caption, fontSize: 11, color: colors.onAction},
});
