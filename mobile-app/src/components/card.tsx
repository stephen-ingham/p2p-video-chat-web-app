import type {ReactNode} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, radius, space, type} from '../theme/theme.ts';

// The web app's shadcn Card as used there: dark surface, subtle edge, an
// optional title and description.
export default function Card({
	title,
	description,
	children,
}: {
	readonly title?: string;
	readonly description?: string;
	readonly children: ReactNode;
}) {
	return (
		<View style={styles.card}>
			{title ? (
				<View style={styles.header}>
					<Text accessibilityRole="header" style={styles.title}>
						{title}
					</Text>
					{description ? (
						<Text style={styles.description}>{description}</Text>
					) : undefined}
				</View>
			) : undefined}
			{children}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		backgroundColor: colors.surface,
		borderColor: colors.line,
		borderWidth: 1,
		borderRadius: radius + 4,
		padding: space.lg,
		gap: space.lg,
	},
	header: {gap: space.xs},
	title: {...type.heading, color: colors.ink},
	description: {...type.caption, color: colors.inkMuted},
});
