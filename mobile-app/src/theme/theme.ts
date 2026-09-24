import type {TextStyle} from 'react-native';
import palette from '../../../colors.json';

type TokenName = Exclude<keyof typeof palette, '$description'>;
const token = (name: TokenName) => palette[name].value;

// Voneo's shared palette (colors.json in the repo root, also used by the web
// app's Tailwind classes). See that file for what each colour is for and its
// contrast ratios.
export const colors = {
	canvas: token('canvas'),
	surface: token('surface'),
	surfaceRaised: token('surface-raised'),
	surfaceActive: token('surface-active'),
	surfaceActiveHover: token('surface-active-hover'),
	line: token('line'),
	lineStrong: token('line-strong'),
	lineControl: token('line-control'),
	ink: token('ink'),
	inkSoft: token('ink-soft'),
	inkMuted: token('ink-muted'),
	focus: token('focus'),
	action: token('action'),
	actionHover: token('action-hover'),
	onAction: token('on-action'),
	danger: token('danger'),
	scrim: token('scrim'),
} as const;

// Geist, like the web app. The expo-font config plugin (app.json) embeds each
// weight into one Android font family, so fontWeight picks the weight. Builds
// without the fonts (Expo Go, Jest) fall back to the system font.
export const fonts = {sans: 'Geist', mono: 'GeistMono'} as const;

// Sizes are in sp, so they follow the phone's font-size setting. Body text is
// 16 rather than the web's 14, which reads small on a phone.
export const type = {
	title: {
		fontFamily: fonts.sans,
		fontSize: 28,
		lineHeight: 34,
		fontWeight: '700',
	},
	heading: {
		fontFamily: fonts.sans,
		fontSize: 18,
		lineHeight: 24,
		fontWeight: '600',
	},
	body: {
		fontFamily: fonts.sans,
		fontSize: 16,
		lineHeight: 22,
		fontWeight: '400',
	},
	label: {
		fontFamily: fonts.sans,
		fontSize: 14,
		lineHeight: 20,
		fontWeight: '500',
	},
	caption: {
		fontFamily: fonts.sans,
		fontSize: 13,
		lineHeight: 18,
		fontWeight: '400',
	},
	mono: {
		fontFamily: fonts.mono,
		fontSize: 13,
		lineHeight: 18,
		fontWeight: '400',
	},
} as const satisfies Record<string, TextStyle>;

export const space = {xs: 4, sm: 8, md: 12, lg: 16, xl: 24} as const;

// Matches the web's --radius (0.625rem).
export const radius = 10;

// Android's minimum touch target.
export const minTouch = 48;
