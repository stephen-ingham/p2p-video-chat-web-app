import {jest} from '@jest/globals';

// Screens pad themselves with safe-area insets, which come from a native
// provider. Zero insets stand in for it. These are plain functions rather than
// the library's own jest/mock, whose jest.fn() hooks are wiped by the
// jest.resetAllMocks() calls in the tests.
jest.mock('react-native-safe-area-context', () => {
	const insets = {top: 0, right: 0, bottom: 0, left: 0};
	return {
		...jest.requireActual<Record<string, unknown>>(
			'react-native-safe-area-context',
		),
		useSafeAreaInsets: () => insets,
	};
});

// Same reason: React Native's AccessibilityInfo mock is a jest.fn().
jest.mock('../src/lib/use-reduce-motion.ts', () => ({
	useReduceMotion: () => false,
}));
