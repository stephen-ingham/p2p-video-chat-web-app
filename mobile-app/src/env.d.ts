// Expo inlines EXPO_PUBLIC_* variables at bundle time (see src/lib/config.ts).
// React Native has no Node `process` types, so declare just what's read.
declare const process: {
	env: {
		EXPO_PUBLIC_API_URL?: string;
	};
};
