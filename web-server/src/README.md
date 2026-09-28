# Voneo web frontend

The Astro (SSR) frontend with React islands. See the [root README](../../README.md#frontend-astro--react) for how it's put together.

## Commands

Run from this folder (`web-server/src/`). For everyday development, run the whole stack with `npm run dev` from the repo root instead.

| Command             | What it does                                                             |
| ------------------- | ------------------------------------------------------------------------ |
| `npm run dev`       | Starts Astro's dev server at `localhost:4321`, outside Docker            |
| `npm run build`     | Builds the production app into `dist/`. The pre-commit hook runs this    |
| `npm run preview`   | Serves the production build locally                                      |
| `npm test`          | Component and unit tests in `../tests/` (Vitest in jsdom, with coverage) |
| `npm run astro ...` | Runs other Astro CLI commands, e.g. `npm run astro -- check`             |

See `CLAUDE.md` in this folder for running `astro dev` in the background.
