# Voneo web frontend

The Astro (SSR) frontend with React islands. See [How it's put together](#how-its-put-together) below, and the [root README](../../README.md) for the rest of the project.

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

## How it's put together

**Framework:** Astro (SSR via `@astrojs/node`), accessed via Ngrok tunnel (e.g. `https://horizon-velvet-symphony.ngrok-free.dev/`) request forwarding to docker container spun up from image `web-server-dev:1.0.0`. Paths below are relative to this folder (the Astro source tree itself lives one level further down, in `src/`).

**Entry:** `src/pages/index.astro` imports global CSS and renders `<App client:load />`.

### Mobile layout

Below Tailwind's `md` breakpoint (768px) the app follows the Android app's layout (`mobile-app/src/screens/`), so the two look and read the same on a phone:

- **Auth:** labels above each field, the app's placeholders, and 48px fields and buttons. `md:` classes restore the desktop look.
- **Before a call:** `mobile-call-setup.tsx`, stacked "Start a call" and "Join a call" cards, with no chat panel.
- **In a call:** `mobile-in-call-view.tsx`. Other people's video fills the screen, yours sits in a corner, and round mic, camera, chat and hang-up buttons (`call-control-button.tsx`) run along the bottom. Chat opens as a bottom sheet (`chat-sheet.tsx`, wrapping `chat-panel.tsx`), and the chat button counts unread lines while it's closed.

CSS can't swap one component tree for another, so `src/lib/use-is-mobile.ts` (a `matchMedia` hook) picks the layout in `CallScreen`. Only one layout renders at a time, so they share test IDs. The server renders the desktop layout, and jsdom has no `matchMedia`, so tests get the desktop layout unless they stub it (see `tests/components/mobile-call-screen.test.tsx`).

### `use-token-worker.ts`

Hook that wraps the `token-worker.js` Web Worker. The Worker instance is a **module-level singleton** so all components share the same instance and the token stored after login is available to subsequent calls. Exposes: `login`, `register`, `logout`, `createCall`, `joinCall`.

### `token-worker.js`

Plain JS Web Worker served from `public/`. Owns the `TokenService` class which holds the JWT access token in a private field. Handles all `fetch` calls to the Express API so the token never touches the main thread.

### Colours (`colors.json`)

The web and mobile apps share one colour palette, `colors.json` in the repo root. Paths outside this folder in this section are from the repo root. Each entry has a role-based name (`canvas`, `surface`, `ink-muted`, `line-control`, `focus`, `danger`…), its hex value, and what it's for, including its WCAG contrast ratio where it's used for text or control edges.

- **Web:** `src/styles/colors-plugin.mjs` adds each entry as a Tailwind colour, so components use classes like `bg-surface` and `text-ink-muted` rather than raw `zinc-*` classes.
- **Mobile:** `mobile-app/src/theme/theme.ts` imports the same file.

The file sits outside `web-server/src`, which is the web images' Docker build context. So the Dockerfiles copy it in from a second build context named `root` (the repo root), set in `compose.yaml` and `e2e/compose.e2e.yaml` (`additional_contexts`) and in the setup scripts (`--build-context root=.`). Pulumi's GCP image build is the exception. It copies `colors.json` into `infra/.root-context/` (gitignored) and uses that folder as `root`, because `@pulumi/docker-build` reads and hashes every file in a build context, and hashing the whole repo made each preview take minutes. The images use `/voneo/web-server/src` as their working directory, so the plugin finds `colors.json` at the same relative path as in the repo. `npm run dev` restarts the web container when `colors.json` changes.

### CSP middleware (`src/middleware.ts`)

Sets a nonce-based `Content-Security-Policy` header on every response in production. Skipped in dev mode to avoid blocking Vite's HMR and dev toolbar scripts. Directives cover `script-src`, `worker-src`, `connect-src` (API + WebSocket), `media-src`, `style-src`, `img-src`, `object-src`, and `base-uri`.

### Dockerfiles

There are two dockerfiles for the frontend in this folder:

- `Dockerfile.dev`:

Created for local development and syncs local file changes into the container automatically.

- `Dockerfile.prod`:

Produces a production-optimised image. The e2e stack also uses it. It runs `server.mjs`, which serves the built app through `@astrojs/node`'s handler and, when `API_PROXY_TARGET` is set, forwards `/auth/`, `/call/` and `/wss/` (including WebSocket upgrades) to the signalling API. On Cloud Run it also attaches an ID token for the frontend's service account (`API_PROXY_ID_TOKEN=true`), the only identity allowed to call the API. This is the production version of the Vite dev proxy in `astro.config.mjs`: browsers only talk to the frontend's origin, so there's no need for a load balancer to route paths, and the `SameSite=Strict` refresh cookie stays first-party.

For GCP deployments, `pulumi up` builds this image and pushes it to the stack's Artifact Registry repo, as `europe-west2-docker.pkg.dev/<project>/voneo-<stack>/voneo-frontend:<stack>`. The Cloud Run service then runs it by digest. The signalling API's `Dockerfile.prod` is handled the same way.
