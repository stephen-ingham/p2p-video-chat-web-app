// Base URL of the signalling API. Expo inlines EXPO_PUBLIC_* variables into
// the JS bundle when Metro starts, so set it in mobile-app/.env (or the shell)
// before `npx expo start` — changing it needs a Metro restart.
//
// The default targets the root .env's LOCAL=true dev stack from the Android
// emulator: 10.0.2.2 is the emulator's alias for the host machine's
// localhost, and the app talks to the API's own port directly (no Astro
// proxy, no ngrok).
const defaultApiUrl = 'http://10.0.2.2:3000';

// Must stay a static `process.env.EXPO_PUBLIC_*` read for Expo to inline it —
// there's no `process` module to import in React Native.
// eslint-disable-next-line n/prefer-global/process
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;

export const apiBaseUrl = (configuredApiUrl ?? defaultApiUrl).replace(
	/\/+$/v,
	'',
);
