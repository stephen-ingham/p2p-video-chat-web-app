# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Voneo is a peer-to-peer video chat app: an Astro/React frontend (`web-server/`) and/or an Expo/React Native android app (`mobile-app/`) talks to an Express.js signalling API (`web-socket-api/`), which spins up a dedicated in-memory WebSocket server per call for session coordination (participants, chat, SDP offer relay). WebRTC handles actual media peer-to-peer once signalling completes (`web-server/src/src/lib/rtc-utils.ts`).

Everything runs via Docker Compose in dev, tunnelled through ngrok so the app is reachable from devices other than the host (needed for testing real WebRTC peers). A `LOCAL=true` env mode exists to bypass ngrok and run against `localhost` only — see @README.md for the tradeoffs (single-device testing only, and `NGROK_HOST` must be unset when `LOCAL=true`).

## Commands

Repo-wide commands live in the root `package.json` and run from the repo root. Commands for one part of the project live in that folder's `package.json` and run from that folder; its README lists them all.

| Root command                   | What it does                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `npm run setup`                | Installs npm deps across the repo and builds the dev Docker images                                              |
| `npm run setup:nuke`           | Full teardown (containers, images, volumes, deps, generated output), then sets up again. Destructive            |
| `npm run dev`                  | Starts the dev stack (frontend + signalling API + MySQL) via `docker compose watch`                             |
| `npm run dev:halt`             | Stops the dev stack                                                                                             |
| `npm run dev:tunnel`           | Starts the ngrok tunnel                                                                                         |
| `npm run lint` / `lint:fix`    | XO with Prettier across the repo, except `mobile-app/`                                                          |
| `npm run test:e2e`             | Playwright e2e suite against a local prod-mode stack                                                            |
| `npm run test:e2e:happy-path`  | The same, `@happy-path` specs only                                                                              |
| `npm run test:e2e:interactive` | The same, in Playwright's UI mode (pick, run and step through specs; the stack stays up until you close the UI) |
| `npm run test:e2e:nat`         | NAT-traversal e2e suite                                                                                         |

| Folder                | Key commands                                                                                                                                                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web-server/src/`     | `npm test` (Vitest component/unit tests), `npm run build` (the pre-commit hook runs it)                                                                                                                                                                                                         |
| `web-socket-api/src/` | `npm run test:it` (integration tests; starts MySQL if it isn't running), `npm test` (same)                                                                                                                                                                                                      |
| `mobile-app/`         | `npm test` (Jest), `npm run lint`, `npm run open` (dev client on an emulator for manual use, no tests), `npm run open:remote` (the same, against a deployed stack), `npm run test:e2e` (Maestro flows on an emulator), `npm run test:e2e:remote` (the same, CI-style, against a deployed stack) |
| `infra/`              | `npm test` (Pulumi snapshot tests), `npm run deploy-test-destroy:dev` (deploy the ephemeral GCP stack, run the e2e suite against it, destroy it)                                                                                                                                                |

Notes on the root commands:

- `setup` runs `npm install` in every folder with its own `package.json` (root, `web-server/src`, `web-server/tests`, `web-socket-api/src`, `web-socket-api/tests`, `infra`, `infra/kill-switch`, `mobile-app`); add new ones to the loop in `scripts/setup.*` and `scripts/nuke.*`. It isn't strictly required (containers self-provision) but avoids editor type/import errors. Only run `setup:nuke` when setup is broken. Besides the `node_modules` folders, Docker images and containers, it clears the npm cache and deletes generated output that the relevant commands recreate: `playwright-report/`, `test-results/`, `blob-report/`, `web-server/src/coverage/`, `mobile-app/.expo/`, `mobile-app/android/`, `mobile-app/maestro-output/` and `infra/.root-context/`.
- `dev:halt` also stops the `docker compose watch` processes `npm run dev` started (left running, they hold a lock that makes the next `npm run dev` fail with "cannot take exclusive lock").
- `dev:tunnel` requires `ngrok.yml` with an authtoken, copied from `ngrok.example.yml`.
- `lint` — Runs XO linting with prettier config passed in. Skips `mobile-app/` (`--ignore`), which `npm run lint` inside `mobile-app/` covers instead (as `mobile-ci.yml` does): its `tsconfig.json` extends `expo/tsconfig.base`, which is only installed in `mobile-app/node_modules`, so XO would crash on it wherever those deps aren't installed. The root `xo.config.mjs` still applies to both. XO type-checks the TypeScript it lints, so on a clean checkout it also needs the `web-server/src`, `web-server/tests` and `infra` deps installed and `npx astro sync` run in `web-server/src` (the `pr-dev.yml`/`pr-main.yml` lint jobs do both). Otherwise it crashes on `astro/tsconfigs/strict` or reports `no-unsafe-*` errors for unresolved types.
- `lint:fix` — Applies XO linting and prettier formatting fixes where possible, identifies any errors/warnings that couldn't be implemented. Same `mobile-app/` skip as `lint`.
- `test:e2e` — run e2e tests in `e2e/` against a prod-mode simulation stack (own compose project, isolated `test-db`, Caddy TLS proxy at `https://voneo.test` that forwards everything to the frontend, whose own proxy sends API/WS routes on, as on Cloud Run; see `e2e/compose.e2e.yaml`). Brings the stack up, runs Playwright, tears down. Requires `voneo.test` to resolve to `127.0.0.1` in your hosts file, and stopping `npm run dev` first (fixed host ports collide). Don't run `npx playwright test` directly — it expects the stack already running at that URL. Only Chromium is configured (see `playwright.config.ts`) — kept deliberately single-browser for dev speed/simplicity, and because the fake-media-stream flags the suite relies on are Chromium-only; no Firefox/WebKit coverage exists. It has two projects: `chromium` (desktop viewport, every spec except `e2e/nat/` and `e2e/web-mobile/`) and `mobile-chromium` (Pixel 7 viewport, only `e2e/web-mobile/`, which tests the web app's mobile layout, not the Android app).
- `test:e2e:happy-path` — same as `test:e2e` but filtered to specs tagged `@happy-path` (the call spec: create/join, both videos, chat, hang up; and the `mobile-chromium` phone-layout call spec); used by the `pr-dev.yml` CI workflow for a faster PR check into `dev`. Neither `pr-dev.yml` nor `pr-main.yml` has path filtering: every job runs on every PR, to catch regressions.
- `test:e2e:interactive` — `test:e2e` with `--ui`, for local use only (not CI). Extra Playwright filters still go after `--`, quoted as `'--'` in PowerShell, which otherwise swallows it, e.g. `npm run test:e2e:interactive '--' --project=mobile-chromium`.
- `test:e2e:nat` — NAT-traversal e2e suite (`e2e/nat/`), run by the `e2e-nat-traversal` job in `pr-main.yml`. Adds `e2e/compose.nat.yaml` on top of the e2e stack. That overlay adds a `coturn` container, using the same pinned image and `infra/coturn/turnserver.conf` as the prod VM, plus three `playwright run-server` browser containers, two on Docker network `lan-a` and one on `lan-b`. Lan-a↔lan-b calls can only connect through the TURN relay. Don't rely on Docker for that isolation: Docker Desktop routes and NATs between bridge networks. The overlay enforces it itself, with per-browser iptables sidecars that drop the other LAN's subnet and with `enable_ip_masquerade: false` on both LANs. As a result the LANs have no internet, so the browsers run the host's mounted `node_modules/playwright-core`. The tests assert same-network = `host`↔`host` pair, cross-network = both local candidates `relay`. `E2E_NAT=1` swaps `playwright.config.ts` to this project only; the regular `chromium` project ignores `e2e/nat/`. The browser container image version comes from the installed `@playwright/test` (`PLAYWRIGHT_VERSION`, set by `scripts/test-e2e-nat.*`, which also pre-pulls that image because Compose can crash pulling one image for several services at once). No hosts entry or local browsers are needed. It uses the same host ports as `test:e2e`, so don't run both at once.

Notes on the folder commands:

- `web-socket-api/src`: `npm run dev` runs the API outside Docker (`node --env-file=.env app.js`). `tests/it/api` and `tests/it/websocket` cover auth, call lifecycle, DB persistence and WebSocket signalling; `tests/unit` is still empty scaffolding.
- `web-server/src`: `npm test` runs Vitest via `vitest.config.ts` (Astro's `getViteConfig` integration, jsdom environment). Tests live in `web-server/tests/unit/` (token-worker/TokenService, CSP middleware) and `web-server/tests/components/` (AuthScreen/App/CallScreen — auth and use-token-worker.ts mocked at the module boundary since jsdom has no real Worker; call-screen.test.tsx mocks rtc-utils.ts entirely, since real WebRTC/getUserMedia isn't something jsdom implements and e2e/call.spec.ts + chat.spec.ts already exercise real negotiation in actual browsers). `web-server/tests/` has its own `package.json`/`node_modules` (testing-library, a type-only copy of `astro`), separate from `web-server/src/` — same sibling-`node_modules` pattern as `web-socket-api/tests/`. The one exception is `@testing-library/react` itself, kept in `web-server/src/`'s own node_modules alongside the real `react`/`react-dom` — a separate copy elsewhere creates two React module instances in one process ("Invalid hook call"), since react-dom's CJS internals resolve `react` via plain Node `require`, bypassing Vite's alias/SSR handling for externalized deps.
- `mobile-app`: `open` and `test:e2e` are `scripts/mobile.*` and `scripts/test-maestro.*`. Both boot an emulator if no device is connected (first AVD, or `VONEO_AVD`; cold boot, no snapshots, no file-backed RAM) and need the dev-client build installed. `open` leaves the emulator running, turns off stylus handwriting on emulators (`stylus_handwriting_enabled 0`: the emulator reports clicks as stylus input, so Gboard shows its handwriting toolbar instead of the keyboard on non-password fields), never starts the API (only warns if `:3000` isn't answering), and runs Metro in the foreground with `--android` (or, if Metro is already on `:8081`, opens the app via its deep link). `open:remote` (`--remote`) points the app at `MOBILE_E2E_APP_URL` (shell env, else root `.env`) instead: it checks that stack rather than `:3000`, starts Metro with it as `EXPO_PUBLIC_API_URL` and `--clear`, and refuses to reuse a running Metro, which serves whichever URL it was started with. `test:e2e` starts the signalling API + MySQL (`LOCAL=true`, `NODE_ENV=dev`) and Metro if they aren't already running, runs `maestro test -e DEV_CLIENT=true` (all flows, or the paths after `--`; logs and screenshots go in the gitignored `mobile-app/maestro-output/`), then stops what it started, closes the emulator it ran on (physical devices are left alone) and deletes the ~220 MB APK copy each Maestro run leaves in the temp dir. `test:e2e:remote` (the same scripts with `--remote`) reproduces CI's GCP Maestro run instead: no API, MySQL or Metro. `scripts/e2e-apk.mjs` reads `MOBILE_E2E_APP_URL` (shell env, else root `.env`), waits for that stack, signs up the flows' user, and builds a release APK against it (`expo prebuild --clean` + Gradle, device ABI only, cached in `mobile-app/maestro-output/e2e-apk/` on URL + ABI + source hash). The script backs up the installed app (normally the dev client, same package, different signing key) via `adb pull`, installs the release APK, runs Maestro with `DEV_CLIENT=false`, then restores the backup. It sets `MAESTRO_DRIVER_STARTUP_TIMEOUT` (default 180s) for slow emulators, and finds Maestro on PATH or in `~/.maestro-cli` (Windows) / `~/.maestro/bin`.
- `infra`: `deploy:<stack>`, `test:e2e:<stack>`, `destroy:<stack>` and `deploy-test-destroy:<stack>` run `scripts/gcp-e2e.mjs`, for `dev` and `prod-preview` only; prod has the interactive `deploy:prod`/`destroy:prod`. The script passes the stack's `appUrl` output (the frontend's `run.app` URL) to Playwright as `E2E_BASE_URL`, and `e2e/global-setup.ts` skips its local DB truncation when `E2E_BASE_URL` is set. The NAT suite isn't run against GCP stacks.

A root `.env` (copied from `.env.example`) is required and is shared by both the frontend and backend containers — see the @README.md Environment Variables section for the full variable list (`JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `DB_*`, `NGROK_HOST`, `LOCAL`, `NODE_ENV`).

Pre-commit hook (Husky) runs `lint-staged` (`xo --prettier` on staged `.js`/`.css`) and verifies the Astro frontend builds.

## Ticket Management

Tickets covering development tasks for this project are recorded under a [Trello board called 'Video Chat Web App'](https://trello.com/b/PnfDFRNd/video-chat-web-app). This board should be used whenever you are asked to check on the status of or record work/tickets for this project.

## Git Conventions

Before a git commit is created, staged and pushed to the remote branch, it is essential that the changeset meets the following requirements with occasional exceptions (detailed below):

### - Keep the change small and focused:

The change should be small and focused, scoped to one specific type of change (refer to [Types of Git Commit](#types-of-git-commit) below to classify the change).
The commit message should clearly identify what the changes were in a good level of technical detail, covering what changed and where.

The commit message itself should generally be at most 30 characters in total, however if this length restricts a clear explanation of the changes these should be covered in the extended commit message.

Commit messages should always start with one prefix from the [Types of Git Commit](#types-of-git-commit) section.
However, in the case the change doesn't neatly fall into any of these categories opt to classify it as a `chore` type.

#### Types of Git Commit

The following types of git commits exist:

- `chore:`

For most changes which help implement code as part of an overarching feature, where it be source code or automated tests. The feature it is contributing to is ideally indicated by the name of the current branch (which should start with the `feat/` prefix).

- `fix:`

For any changes which implement a bug fix, which could have been identified during implementation of a feature or pulled from a GitHub issue.

- `docs:`

For any project documentation changes, i.e. any `CLAUDE.md` or `README.md` files contained within the source code of this project.

- `test:`

Any changes to or newly created test files or related config, i.e. relating to `vitest`, `playwright` or `supertest` testing frameworks

### - Do not make too many changes

Does not modify more than 5 files and make more than 200 lines of code changes at once.
If the changeset exceeds this, separate out the changes into numerous commits to be sequentially pushed to the remote branch per the [guidance in the previous requirement](#--keep-the-change-small-and-focused)

The 200-line figure counts hand-written code only. Lockfiles (`package-lock.json`), generated fixtures/snapshots, and other machine-generated files that can't reasonably be split or trimmed are excluded from that count — don't split a commit purely to dodge their line count, and don't hand-edit them to stay under the limit.

### - Pass the required git hooks

Ensures the git hooks in the `pre-commit` husky script succesfully pass before a git commit is pushed (there is currently no `pre-push` hook — only `.husky/pre-commit` exists).
However, on `feat/` branches in the case that the needed changes to make this hook scripts pass would exceed the change size requirement, add `WIP:` after the [git commit type prefix]().
e.g. `chore(WIP):`

This indicates that a developer should expect errors if they try to use the system at this commit hash.

### - Add a README badge for any new technology

If a commit introduces a new technology to the stack (a new library, framework, service, or tool — not just a version bump of something already listed), add a badge for it to the badge row at the top of README.md, hyperlinked to that technology's main docs page (follow the existing badges' format/style, e.g. via https://shields.io).

### Check README.md && CLAUDE.md for any discrepancies

Before you stage and push a commit, ALWAYS double check that the change hasn't implemented new differences between the reality of the implementation versus the project documentation itself, i.e. the README.md and CLAUDE.md.
If anything is noticed, whether due to the change itself or due to the change being identifed by chance: raise the issue and clarify how it should be handled.

## Architecture

### Signalling API (`web-socket-api/src`)

- `app.js` — Express entry point (port 3000 in dev).
- `authorization/` — signup/login/logout/refresh routes and controller. JWT-based; access token via `Authorization: Bearer`, refresh token via cookie.
- `call/` — call lifecycle:
  - `controller.js` / `routes.js` — `GET /call/ice-servers`, `POST /call/create`, `PUT /call/:callID/join`, `DELETE /call/:callID/leave`, `POST /call/:callID/messages`.
  - `utils/ice-servers.js` — builds the `RTCPeerConnection` `iceServers` list. With `TURN_URLS` and `TURN_SECRET` set (prod, CI NAT stack), it returns the self-hosted coturn STUN/TURN URLs with short-lived credentials in the TURN REST API format (`<expiry>:<email>` / base64 HMAC-SHA1 of that, keyed with the shared secret), valid for 1 hour. Without them it returns Google's public STUN servers only (dev default, no relay).
  - `utils/session-store.js` — in-memory `Map` of `callId → { wsURL, participants, pendingParticipants }`. **No persistence** — restarting the API drops all active calls.
  - `utils/ws-server.js` — creates a WebSocket server per call for signalling.
  - `utils/misc.js` — WS message handlers plus `verifyClient` (WS origin check, see below).
- `common/` — `database.js` (MySQL via Sequelize, `sync()` on first run; dev seeder adds test users only when `NODE_ENV=dev`), `middlewares/` (auth/permission/token handling, plus `rate-limits.js`: signups capped at 50/hour across all clients and `GET /call/ice-servers` at 60/hour per user, in every environment, held in memory, overridable with `SIGNUP_RATE_LIMIT_PER_HOUR`/`ICE_SERVERS_RATE_LIMIT_PER_HOUR`; not keyed on IP, since the client's IP only arrives in a forgeable `X-Forwarded-For` chain), `models/` (`User`, `Call`, `CallParticipants`, `RefreshToken`).
- `openapi.yaml` — Located at @web-socket-api/src/openapi.yaml - the API schema reference, kept in sync with the controllers/routes as of this writing; re-verify against the controller if it's been a while since it was last updated.

WebSocket message protocol (client ↔ per-call WS server):

- Client → server: `newParticipantOnCall`, `chatMessage`, `offer` (relayed to a named recipient).
- Server → client: `receivedNewParticipantNotif`, `responseCurrentCallParticipants`, `offer`, `chatMessage` / `receivedNewChatMessage`.

### Dev vs. production divergence (signalling API)

Several behaviors branch on `NODE_ENV`/`LOCAL` — check these before assuming behavior is environment-independent:

- WS server port: every call's WebSocket server shares the app's single listening port (`3000`) in both dev and production, via `noServer: true` and the shared HTTP server's `upgrade` event (`handleUpgrade` in `call/utils/ws-server.js`), routed by `callID` path.
- WS URL construction: the API returns only a `callID` from create/join. Clients build the URL: `/wss/:callID`, or `/ws/:callID` when `LOCAL=true`, on whichever host routes to the API for them. The web app derives it from the page origin (`web-server/src/src/lib/call-url.ts`). The mobile app uses its own configured API host (e.g. `10.0.2.2:3000` in the emulator).
- WS origin verification (`verifyClient` in `call/utils/misc.js`) checks `Origin` against `ALLOWED_ORIGIN` in production only, and allows every origin in dev. CORS (`app.js`) checks against `ALLOWED_ORIGIN` in production and `LOCAL`/`NGROK_HOST`-derived origins in dev. Both allow requests with no `Origin` (non-browser clients). React Native on Android does send an `Origin` on WebSocket upgrades, built from the socket URL, so it isn't treated as a missing-`Origin` client.
- Refresh token cookie: `Secure` only set in production.
- ICE servers: this depends on `TURN_URLS`/`TURN_SECRET` rather than `NODE_ENV`. Pulumi sets them only on the prod and prod-preview stacks (`turnEnabled`); in dev they're normally unset, so the API falls back to Google STUN.

### Frontend (`web-server/src`)

Astro (SSR via `@astrojs/node`) with React islands, Tailwind v4, shadcn/ui. Paths below are relative to `web-server/src/` (the Astro source tree itself lives one level further down, at `web-server/src/src/`).

- `src/pages/index.astro` — shell page, renders `<App client:load />`.
- `src/components/app.tsx` — root, switches between `AuthScreen` (`auth-screen.tsx`, logged out) and `CallScreen` (logged in).
- `src/components/call-screen.tsx`, `video-grid.tsx`, `chat-panel.tsx` — call UI, video tiles, chat sidebar. Mic/camera toggles flip the local tracks' `enabled` (`setLocalTrackEnabled` in `rtc-utils.ts`).
- Mobile layout: below Tailwind's `md` breakpoint (768px) the UI follows the Android app's. Auth uses `md:` classes plus `src/lib/use-is-mobile.ts` (a `matchMedia` hook, desktop on the server and in jsdom) for placeholders. `CallScreen` uses the hook to render `mobile-call-setup.tsx` (stacked cards) or `mobile-in-call-view.tsx` (full-screen call, `call-control-button.tsx` round buttons, chat in `chat-sheet.tsx` with an unread badge) instead of the desktop layout. Only one layout renders at a time, so both share test IDs (`create-call-button`, `hang-up-button`, `call-id`…) without duplicates. Tests stub `window.matchMedia` to get the mobile layout.
- `src/lib/rtc-utils.ts` — WebRTC helpers (media capture, `RTCPeerConnection` setup, WS messaging).
- `src/lib/use-token-worker.ts` — hook wrapping `token-worker.js`; the Worker instance is a **module-level singleton** so all components share one instance/token.
- `public/token-worker.js` — plain JS Web Worker owning `TokenService`, which holds the JWT access token in a private field and performs all `fetch` calls to the Express API, so the token never touches the main thread.
- `server.mjs` — production entry point (`Dockerfile.prod`). Wraps the `@astrojs/node` standalone handler (`ASTRO_NODE_AUTOSTART=disabled`) and, when `API_PROXY_TARGET` is set, forwards `/auth/`, `/call/` and `/wss/` (WebSocket upgrades included) to the API with `http-proxy-3`, rewriting `Host` but keeping `Origin`. With `API_PROXY_ID_TOKEN=true` (set on Cloud Run) it also sends an ID token for the frontend's service account, fetched from the metadata server (`GCE_METADATA_HOST` overrides the host) and cached until 5 minutes before expiry, as `X-Serverless-Authorization`, the header Cloud Run checks when `Authorization` carries the user's JWT. It's the prod counterpart of the Vite dev proxy in `astro.config.mjs`: browsers only ever talk to the frontend's origin, which keeps the `SameSite=Strict` refresh cookie first-party.
- `src/middleware.ts` — nonce-based CSP header, applied in production only (skipped in dev to avoid blocking Vite HMR/dev toolbar).
- Colours come from the shared palette in the repo-root `colors.json` (also used by the mobile app): `src/styles/colors-plugin.mjs` adds each entry as a Tailwind colour (`bg-surface`, `text-ink-muted`, `border-line-control`, `ring-focus`…). Use those, not raw `zinc-*` classes. Because the file is outside `web-server/src`, both Dockerfiles use `WORKDIR /voneo/web-server/src` and `COPY --from=root colors.json /voneo/colors.json`, with the `root` build context set in `compose.yaml` / `e2e/compose.e2e.yaml` (`additional_contexts`) and the setup scripts (`--build-context root=.`). Pulumi (`infra/index.ts`) instead copies `colors.json` into a gitignored `infra/.root-context/` and uses that as `root`: `@pulumi/docker-build` hashes every file in each context (ignoring `.dockerignore` for named ones), so the repo root made previews take minutes. Don't point it back at `..`. `npm run dev` restarts the container when `colors.json` changes.

See `web-server/src/CLAUDE.md` for Astro-specific dev-server guidance (background mode via `astro dev --background`).

### Mobile app (`mobile-app/`)

Expo (React Native) Android app, see `mobile-app/CLAUDE.md` for Expo-specific rules. It talks to the signalling API directly and uses `react-native-webrtc`, so it needs the dev-client build (Expo Go can't load it; run with `npx expo start --dev-client`), from EAS (`eas build --profile development`) or the manual-only `mobile-dev-client.yml` workflow (a Gradle debug build of just the chosen ABIs, default `x86_64`, uploaded as the `voneo-dev-client` artifact; debug-signed, so uninstall an EAS build first). Rebuild it after any native change: an outdated one crashes on load with `IllegalViewOperationException: Can't find ViewManager ...`.

- `app.tsx` switches between `src/screens/auth-screen.tsx` and `call-screen.tsx` (+ `in-call-view.tsx`, `chat-sheet.tsx`) with plain state, not Expo Router (two screens, and Expo Router needs a native rebuild).
- UI matches the web app: `src/theme/theme.ts` reads the repo-root `colors.json` (so `metro.config.js` watches the repo root, blocking everything there but `colors.json` and `mobile-app/`) and defines the Geist type scale, spacing and 48dp touch size; `src/components/` holds `Button`, `IconButton`, `TextField`, `Tabs`, `Card`. Geist is embedded by the `expo-font` config plugin in `app.json`, so font or icon (`react-native-svg`) changes need a new dev-client build. Import Lucide icons one at a time (`lucide-react-native/icons/<name>`): Metro doesn't tree-shake the package index.
- `src/lib/`: `config.ts` (API URL from `EXPO_PUBLIC_API_URL`, default `http://10.0.2.2:3000` for the emulator against the `LOCAL=true` stack), `call-url.ts` (WS URL from `callID`, call ID check), `api.ts`, `signalling.ts` (WS join handshake), `call-session.ts` (WebRTC signalling matching the web client's `rtc-utils.ts`, peers injected via `call-types.ts`), `webrtc.ts` (the only `react-native-webrtc` user), `use-call.ts` (hook wiring them together).
- Tests: `npm test` in `mobile-app/` runs Jest (`jest-expo`) + React Native Testing Library over `mobile-app/tests/`; Maestro flows in `mobile-app/.maestro/` (run locally with `npm run test:e2e` in `mobile-app/`, which needs the dev build installed on the emulator; in CI, the composite action `.github/actions/maestro-e2e` builds a release APK with `expo prebuild` + Gradle, pointed at a given API URL, and runs them on an emulator: `pr-dev.yml`'s `e2e-gcp-dev` runs the `happy-path`-tagged flow against the GCP dev stack, `pr-main.yml`'s `e2e-gcp-prod-preview` runs every flow against `prod-preview` (both first sign up the seed user the flows log in as, since GCP stacks run with `NODE_ENV=production`), and `mobile-e2e.yml` runs every flow on manual dispatch only, against a local API on the runner or, with its `api_url` input set, a deployed stack after signing up the seed user). The action caches the APK keyed on API URL + app source (not `.maestro/`), plus npm/Gradle downloads; `mobile-apk-cache.yml` warms it on pushes to `dev`/`main` (PRs can only restore their own and their base branch's caches), using the `DEV_APP_URL`/`PROD_PREVIEW_APP_URL` repo variables, which must match each stack's `appUrl` or PR jobs silently rebuild. `tests/setup.ts` stubs safe-area insets and reduced motion with plain functions, because the tests' `jest.resetAllMocks()` wipes the libraries' own `jest.fn()` mocks.
- No regexes in `mobile-app/` app code: XO requires the `v` flag, which Hermes rejects at load. (Node-only config like `metro.config.js` is exempt.)

### Infra (`infra/`)

Pulumi (TypeScript) provisions GCP resources. `infra/README.md` lists each one with its AWS equivalent and has the one-time setup steps per stack. The resources:

- the GCP APIs the stack uses (enabled from code)
- a VPC and subnet, for the TURN VM
- an Artifact Registry repo, with both prod images built and pushed by Pulumi itself (`@pulumi/docker-build`) and deployed to Cloud Run by digest. The images set `exec: true`, so the provider runs the host's `docker buildx` (which must be installed) instead of its embedded v0.12 client, whose registry auth timed out on pushes lasting about a minute. A cleanup policy deletes untagged images after a week, always keeping each image's 3 newest versions
- frontend and backend Cloud Run services, each with its own service account. Both have public `run.app` URLs; there's no load balancer, domain or certificate. Anyone can call the frontend, but the backend requires IAM: only the frontend's service account has `roles/run.invoker` on it (`backendInvoker`), so everything reaches it through the frontend's proxy. Users open the frontend's URL (the `appUrl` output, built from the service name and project number, since reading the frontend's URL would make the services depend on each other), and its `server.mjs` proxies API/WS routes to the backend's `run.app` URL (`API_PROXY_TARGET`). The backend's `ALLOWED_ORIGIN` is `appUrl`. Both have a 3600s request timeout, since signalling WebSockets pass through both
- Cloud SQL MySQL 8.4 (Enterprise edition), reached only through the Cloud SQL connector socket, which `common/database.js` uses as `socketPath` when `DB_HOST` is a path
- Secret Manager secrets
- a self-hosted coturn STUN/TURN VM
- on stacks that set `billingAccount` (prod only), a monthly budget with a kill switch (`infra/budget.ts`): alert emails at 50/90/100% actual and 100% forecast spend, and every budget update published to a Pub/Sub topic that triggers a Cloud Run function (`infra/kill-switch/`, `nodejs22`, own `package.json`/lock, built by its own build service account). Once actual spend reaches `budgetAmount` (£20, `budgetCurrency` GBP), it disables billing on the whole project, stopping prod and prod-preview. The budget needs an explicit `gcp.Provider` with `billingProject`/`userProjectOverride`, and the deploy identity needs `roles/billing.costsManager` on the billing account. The source zip is named by content hash, and the snapshot helper replaces archives with `<archive>` since the mock sees their contents as unresolved Promises. `infra/README.md` (Spending limits) covers turning billing back on

`infra/package.json` is `"type": "module"`, which Pulumi's built-in ts-node can't load, so `Pulumi.yaml` sets `typescript: false` and `nodeargs: --import tsx`, running `index.ts` through `tsx` as the tests do. Each stack's Pulumi Cloud page shows a stack README: the `infra/Pulumi.README.md` template, exported as the `readme` output, with its `${outputs.*}` placeholders filled in by Pulumi Cloud. Pulumi has no conditionals, so `stackReadme()` in `index.ts` drops the `<!-- ephemeral -->`, `<!-- prod -->` and `<!-- turn -->` sections that don't apply to the stack. Keep comment markers out of Markdown tables, because Prettier splits a table around them. Required stack config: `gcp:project` and the secrets. `dev` and `prod` each deploy into their own GCP project, keeping dev away from prod's data. `prod-preview` deploys into prod's project, in its own VPC, with every name stack-suffixed (including the Artifact Registry repo, `voneo-<stack>`). The VM (`infra/turn-server.ts`) is only created when `voneo-video-chat:turnEnabled` is true: prod and prod-preview. It's an `e2-micro` Container-Optimized OS instance with a static IP, a firewall rule, and its own service account that can read only the `turn-secret-<stack>` secret. It runs the pinned `coturn/coturn` image with `infra/coturn/turnserver.conf` plus prod-only lines (external IP, deny relaying to private/metadata ranges). That base config caps relay bandwidth (500 KB/s per allocation, 5 MB/s in total via `bps-capacity`, 20 allocations), which bounds TURN egress cost. Keep that image tag in sync with `e2e/compose.nat.yaml`. Stacks (`infra/Pulumi.<stack>.yaml`, GCP resource/secret names suffixed by stack): `dev` and `prod-preview` are ephemeral (`voneo-video-chat:ephemeral: true`), deployed for one e2e run and destroyed straight after. That gives them no Cloud SQL deletion protection and a Pulumi auto-named instance (GCP reserves deleted instance names for about a week). `prod` is long-lived, with deletion protection. Every stack labels its Cloud SQL instance, Cloud Run services and TURN VM with `git-sha`/`git-dirty` (the `gitSha` config overrides detection). The snapshot tests (`infra/tests/prod.test.ts`, `ephemeral.test.ts`, sharing `snapshot.ts`) cover both configs; the prod one enables TURN and the budget. In CI, `pr-dev.yml`'s `e2e-gcp-dev` and `pr-main.yml`'s `e2e-gcp-prod-preview` deploy the PR head, test, then destroy on `if: always()`, one run at a time per stack (a `concurrency` group), skipping fork PRs. `deploy-prod.yml` runs `pulumi up` on merge to `main`. All of it goes through GCP Workload Identity Federation. All three stacks are set up. `dev` has been deployed from a local machine. The prod GCP project (`voneo-prod-u6p3sp`, shared with `prod-preview`) exists, and both projects have the `github-deploy` service account and Workload Identity Federation pool, with `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT` and `PULUMI_ACCESS_TOKEN` set on all three GitHub environments. The `prod` and `prod-preview` Pulumi stacks exist with their config and secrets. `prod` is deployed and live at its `appUrl`, `https://voneo-frontend-prod-90498326779.europe-west2.run.app` (`pulumi stack output --stack prod` lists its outputs, including the deployed `gitSha`); `deploy-prod.yml` redeploys it on each merge to `main`. `infra/README.md` walks through the setup.

## Known incomplete areas

- Calls and their WebSocket servers are in-memory only; nothing survives an API restart.
- Production CORS/WS-origin allowlist is a single `ALLOWED_ORIGIN` value: each Pulumi stack's `appUrl` (the frontend's `run.app` URL). The app is served only from that URL; there's no custom domain.
- TODO: all calls currently share a single WS port (`3000`) via path-based routing (`/wss/:callID`), dropped in favour of Cloud Run compatibility (Cloud Run only exposes one port per service). The original per-call random-port design (`setRandomPort`, `WS_PORT_MIN`/`WS_PORT_MAX`) is removed; multiple simultaneous calls are already supported under the shared-port design (each isolated by its own `callID`-routed `WebSocketServer`), so this is only relevant if a future deployment target supports multiple exposed ports and process/connection-level isolation or scaling per call becomes worth the cost.
- TODO: no rate limiting exists anywhere on the WebSocket signalling path (`call/utils/ws-server.js`/`misc.js`). Once implemented, add an integration test alongside the existing ones in `web-socket-api/tests/it/websocket/limits.test.js` asserting the restriction actually kicks in under high enough traffic.
