import {Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, minTouch, radius, space, type} from '../theme/theme.ts';

type Tab<Value extends string> = {value: Value; label: string; testId?: string};

// A segmented tab bar like the web app's login/register tabs.
export default function Tabs<Value extends string>({
	tabs,
	value,
	onChange,
}: {
	readonly tabs: ReadonlyArray<Tab<Value>>;
	readonly value: Value;
	readonly onChange: (value: Value) => void;
}) {
	return (
		<View accessibilityRole="tablist" style={styles.list}>
			{tabs.map((tab) => {
				const selected = tab.value === value;
				return (
					<Pressable
						key={tab.value}
						accessibilityRole="tab"
						accessibilityState={{selected}}
						testID={tab.testId}
						style={[styles.tab, selected && styles.selected]}
						onPress={() => {
							onChange(tab.value);
						}}
					>
						<Text style={[styles.label, selected && styles.selectedLabel]}>
							{tab.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	list: {
		flexDirection: 'row',
		backgroundColor: colors.surfaceRaised,
		borderRadius: radius,
		padding: 3,
		gap: 3,
	},
	tab: {
		flex: 1,
		minHeight: minTouch - 6,
		borderRadius: radius - 3,
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: space.sm,
	},
	selected: {backgroundColor: colors.surfaceActive},
	label: {...type.label, color: colors.inkMuted},
	selectedLabel: {color: colors.ink},
});
