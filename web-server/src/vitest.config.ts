import {fileURLToPath} from 'node:url';
import {getViteConfig} from 'astro/config';

// @testing-library/react lives here (not in web-server/tests/node_modules)
// specifically so it shares this project's single react/react-dom instance —
// a separate copy in a sibling node_modules tree causes "Invalid hook call"
// (two distinct React module instances in one process, since React keeps
// module-scoped state). Test files in web-server/tests/ can't resolve a bare
// `@testing-library/react` import on their own (it's not in any of their
// ancestor node_modules), hence the alias below.
const testingLibraryReact = fileURLToPath(
	new URL('node_modules/@testing-library/react', import.meta.url),
);

export default getViteConfig({
	resolve: {
		alias: [{find: '@testing-library/react', replacement: testingLibraryReact}],
	},
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
