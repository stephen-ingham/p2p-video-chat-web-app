import {readFileSync} from 'node:fs';
import plugin from 'tailwindcss/plugin';

// Adds Voneo's shared palette (colors.json in the repo root, also used by
// mobile-app/) as Tailwind colours, so `bg-surface`, `text-ink-muted`,
// `ring-focus` etc. exist as utilities. The Docker images copy colors.json in
// through a separate `root` build context, to the same relative location as
// in the repo (see Dockerfile.dev / Dockerfile.prod).
const palette = JSON.parse(
	readFileSync(new URL('../../../../colors.json', import.meta.url), 'utf8'),
);

const colors = Object.fromEntries(
	Object.entries(palette)
		.filter(([name]) => !name.startsWith('$'))
		.map(([name, {value}]) => [name, value]),
);

// No utilities of its own: the plugin only extends the theme.
const noUtilities = () => undefined;

export default plugin(noUtilities, {theme: {extend: {colors}}});
