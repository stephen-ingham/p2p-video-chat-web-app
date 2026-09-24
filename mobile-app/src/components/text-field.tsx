import {useId, useState} from 'react';
import {
	StyleSheet,
	Text,
	TextInput,
	View,
	type TextInputProps,
} from 'react-native';
import {colors, minTouch, radius, space, type} from '../theme/theme.ts';

// A text input with a visible label (not just a placeholder), linked for
// TalkBack, a visible focus state, and an error line that's announced when
// it appears.
export default function TextField({
	label,
	error,
	errorTestID,
	surface = 'raised',
	...inputProps
}: Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
	readonly label: string;
	readonly error?: string;
	readonly errorTestID?: string;
	// Which surface the field sits on: raised inside cards, plain on the screen.
	readonly surface?: 'raised' | 'plain';
}) {
	const labelId = useId();
	const [focused, setFocused] = useState(false);

	return (
		<View style={styles.field}>
			<Text nativeID={labelId} style={styles.label}>
				{label}
			</Text>
			<TextInput
				{...inputProps}
				accessibilityLabelledBy={labelId}
				placeholderTextColor={colors.inkMuted}
				style={[
					styles.input,
					{
						backgroundColor:
							surface === 'raised' ? colors.surfaceRaised : colors.surface,
						borderColor: focused ? colors.focus : colors.lineControl,
					},
					focused && styles.focused,
				]}
				onFocus={(event) => {
					setFocused(true);
					inputProps.onFocus?.(event);
				}}
				onBlur={(event) => {
					setFocused(false);
					inputProps.onBlur?.(event);
				}}
			/>
			{error ? (
				<Text
					accessibilityLiveRegion="polite"
					testID={errorTestID}
					style={styles.error}
				>
					{error}
				</Text>
			) : undefined}
		</View>
	);
}

const styles = StyleSheet.create({
	field: {gap: space.xs},
	label: {...type.label, color: colors.inkSoft},
	input: {
		...type.body,
		minHeight: minTouch,
		borderWidth: 1,
		borderRadius: radius,
		paddingHorizontal: space.md,
		color: colors.ink,
	},
	focused: {borderWidth: 2, paddingHorizontal: space.md - 1},
	error: {...type.caption, color: colors.danger},
});
