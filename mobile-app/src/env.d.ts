// Expo inlines EXPO_PUBLIC_* variables at bundle time (see src/lib/config.ts).
// React Native has no Node `process` types, so declare just what's read,
// including VONEO_E2E_BUILD, which app.config.ts reads when Expo evaluates it.
declare const process: {
	env: {
		EXPO_PUBLIC_API_URL?: string;
		VONEO_E2E_BUILD?: string;
	};
};
