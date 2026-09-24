import type {LucideIcon} from 'lucide-react-native';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, minTouch, radius, space, type} from '../theme/theme.ts';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';

// The web app's shadcn button variants, as used there: primary is the light
// "action" button, outline/ghost sit on dark surfaces, danger is hang up.
const variants: Record<
	Variant,
	{background: string; pressed: string; text: string; border?: string}
> = {
	primary: {
		background: colors.action,
		pressed: colors.actionHover,
		text: colors.onAction,
	},
	outline: {
		background: colors.surface,
		pressed: colors.surfaceRaised,
		text: colors.ink,
		border: colors.lineControl,
	},
	ghost: {
		background: 'transparent',
		pressed: colors.surfaceRaised,
		text: colors.inkMuted,
	},
	danger: {
		background: colors.danger,
		pressed: colors.danger,
		text: colors.onAction,
	},
};

export default function Button({
	label,
	onPress,
	variant = 'primary',
	icon: Icon,
	disabled = false,
	busy = false,
	testID,
}: {
	readonly label: string;
	readonly onPress: () => void;
	readonly variant?: Variant;
	readonly icon?: LucideIcon;
	readonly disabled?: boolean;
	// Shows the label (e.g. "Signing in…") and blocks presses while work runs.
	readonly busy?: boolean;
	readonly testID?: string;
}) {
	const style = variants[variant];
	const inactive = disabled || busy;

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{disabled: inactive, busy}}
			disabled={inactive}
			testID={testID}
			style={({pressed}) => [
				styles.button,
				{
					backgroundColor: pressed ? style.pressed : style.background,
					borderColor: style.border ?? 'transparent',
				},
				inactive && styles.inactive,
			]}
			onPress={onPress}
		>
			<View style={styles.content}>
				{Icon ? <Icon color={style.text} size={18} /> : undefined}
				<Text style={[styles.label, {color: style.text}]}>{label}</Text>
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	button: {
		minHeight: minTouch,
		borderRadius: radius,
		borderWidth: 1,
		paddingHorizontal: space.lg,
		justifyContent: 'center',
	},
	content: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: space.sm,
	},
	label: {...type.label, fontSize: 16},
	inactive: {opacity: 0.5},
});
