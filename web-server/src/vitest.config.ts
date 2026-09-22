import {getViteConfig} from 'astro/config';

export default getViteConfig({
	// Web-server/tests/ sits one level above this project's root (web-server/src/,
	// per astro.config.mjs) — Vite's dev-server fs restrictions block reading
	// outside root by default, so it has to be allow-listed explicitly.
	server: {
		fs: {allow: ['..']},
	},
	test: {
		environment: 'jsdom',
		setupFiles: ['../tests/unit/setup.ts'],
		include: ['../tests/**/*.{test,spec}.{ts,tsx}'],
		exclude: ['../tests/node_modules/**'],
	},
});
