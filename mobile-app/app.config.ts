import type {ConfigContext, ExpoConfig} from 'expo/config';

// Extends app.json. The Maestro e2e build (mobile-e2e.yml sets
// VONEO_E2E_BUILD=true) is a release build that talks to the dev API over
// plain http://10.0.2.2:3000, which Android blocks outside debug builds. So
// cleartext HTTP is allowed for that build only; every other build keeps
// Android's HTTPS-only default.
export default function appConfig({config}: ConfigContext): ExpoConfig {
	// eslint-disable-next-line n/prefer-global/process -- declared in src/env.d.ts; mobile-app has no Node types to import it from
	const isMaestroBuild = process.env.VONEO_E2E_BUILD === 'true';

	return {
		...config,
		name: config.name ?? 'Voneo',
		slug: config.slug ?? 'voneo',
		plugins: [
			...(config.plugins ?? []),
			...(isMaestroBuild
				? [
						[
							'expo-build-properties',
							{android: {usesCleartextTraffic: true}},
						] as [string, unknown],
					]
				: []),
		],
	};
}
