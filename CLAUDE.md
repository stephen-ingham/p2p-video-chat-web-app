# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Voneo is a peer-to-peer video chat app: an Astro/React frontend (`web-server/`) talks to an Express.js signalling API (`web-socket-api/`), which spins up a dedicated in-memory WebSocket server per call for session coordination (participants, chat, SDP offer relay). WebRTC handles actual media peer-to-peer once signalling completes (`web-server/src/src/lib/rtc-utils.ts`).

Everything runs via Docker Compose in dev, tunnelled through ngrok so the app is reachable from devices other than the host (needed for testing real WebRTC peers). A `LOCAL=true` env mode exists to bypass ngrok and run against `localhost` only — see @README.md for the tradeoffs (single-device testing only, and `NGROK_HOST` must be unset when `LOCAL=true`).

## Commands

All commands below are run from the repo root unless noted.

- `npm run setup` — install npm deps across the repo and build dev Docker images. Not strictly required (containers self-provision) but avoids editor type/import errors.
- `npm run dev` — start both dev containers (frontend + signalling API + MySQL) via `docker compose watch`.
- `npm run halt-dev` — stop all dev containers, and the `docker compose watch` processes `npm run dev` started (left running, they hold a lock that makes the next `npm run dev` fail with "cannot take exclusive lock").
- `npm run tunnel` — start the ngrok tunnel (requires `ngrok.yml` with an authtoken, copied from `ngrok.example.yml`).
- `npm run nuke` — full teardown: removes containers/images/volumes/deps, then rebuilds/reinstalls. Destructive — only run when setup is broken.
- `npm test` (root) — runs `xo` (lint) across the repo; this is the only root-level test/lint command.
- `npm run test:e2e` — run e2e tests in `e2e/` against a prod-mode simulation stack (own compose project, isolated `test-db`, Caddy TLS proxy at `https://voneo.test` that forwards everything to the frontend, whose own proxy sends API/WS routes on, as on Cloud Run; see `e2e/compose.e2e.yaml`). Brings the stack up, runs Playwright, tears down. Requires `voneo.test` to resolve to `127.0.0.1` in your hosts file, and stopping `npm run dev` first (fixed host ports collide). Don't run `npx playwright test` directly — it expects the stack already running at that URL. Only the `chromium` project is configured (see `playwright.config.ts`) — kept deliberately single-browser for dev speed/simplicity, and because the fake-media-stream flags the suite relies on are Chromium-only; no Firefox/WebKit coverage exists.
- `npm run test:e2e:happy-path` — same as `test:e2e` but filtered to specs tagged `@happy-path` (currently just call creation/join); used by the `pr-dev.yml` CI workflow for a faster PR check into `dev`.
- `npm run test:e2e:nat` — NAT-traversal e2e suite (`e2e/nat/`), run by the `e2e-nat-traversal` job in `pr-main.yml`. Adds `e2e/compose.nat.yaml` on top of the e2e stack. That overlay adds a `coturn` container, using the same pinned image and `infra/coturn/turnserver.conf` as the prod VM, plus three `playwright run-server` browser containers, two on Docker network `lan-a` and one on `lan-b`. Lan-a↔lan-b calls can only connect through the TURN relay. Don't rely on Docker for that isolation: Docker Desktop routes and NATs between bridge networks. The overlay enforces it itself, with per-browser iptables sidecars that drop the other LAN's subnet and with `enable_ip_masquerade: false` on both LANs. As a result the LANs have no internet, so the browsers run the host's mounted `node_modules/playwright-core`. The tests assert same-network = `host`↔`host` pair, cross-network = both local candidates `relay`. `E2E_NAT=1` swaps `playwright.config.ts` to this project only; the regular `chromium` project ignores `e2e/nat/`. The browser container image version comes from the installed `@playwright/test` (`PLAYWRIGHT_VERSION`, set by `scripts/test-e2e-nat.*`, which also pre-pulls that image because Compose can crash pulling one image for several services at once). No hosts entry or local browsers are needed. It uses the same host ports as `test:e2e`, so don't run both at once.
- `npm run test:maestro` — run the mobile app's Maestro flows (`mobile-app/.maestro/`) against the dev-client build (`scripts/test-maestro.*`). Boots an emulator if no device is connected (first AVD, or `VONEO_AVD`; cold boot, no snapshots, no file-backed RAM) and closes the emulator it ran on at the end, whoever started it (physical devices are left alone). Starts the signalling API + MySQL (`LOCAL=true`, `NODE_ENV=dev`) and Metro if they aren't already running, runs `maestro test -e DEV_CLIENT=true` (all flows, or the paths after `--`, relative to `mobile-app/`), then stops what it started and deletes the ~220 MB APK copy each Maestro run leaves in the temp dir. Sets `MAESTRO_DRIVER_STARTUP_TIMEOUT` (default 180s) for slow emulators. Finds Maestro on PATH or in `~/.maestro-cli` (Windows) / `~/.maestro/bin`.
- `npm run lint` — Runs XO linting with prettier config passed in
- `npm run lint:fix` — Applies XO linting and prettier formatting fixes where possible, identifies any errors/warnings that couldn't be implemented
- `npm run test:it` — alias to run the integration tests for the API (and eventually the websocket infra)
- `npm run gcp-e2e-dev` — deploy the ephemeral `dev` GCP stack, run the e2e suite (not NAT) against it, then destroy it whatever happened (`scripts/gcp-e2e.mjs run dev`). The steps also exist separately: `gcp-deploy-dev`, `test:e2e:gcp-dev`, `gcp-destroy-dev`. Same four for `prod-preview` (`gcp-e2e-prod-preview`, …). Only `dev`/`prod-preview` are accepted; prod keeps the interactive `gcp-deploy-prod`/`gcp-destroy-prod`. The script passes the stack's `appUrl` output (the frontend's `run.app` URL) to Playwright as `E2E_BASE_URL`, and `e2e/global-setup.ts` skips its local DB truncation when `E2E_BASE_URL` is set.
  Per-workspace:
- `web-socket-api/src`: `npm run dev` runs the API directly with `node --env-file=.env app.js` (outside Docker). No test runner is currently wired up (`npm test` is a placeholder); `tests/it/api` and `tests/it/websocket` have substantial integration test coverage (auth, call lifecycle, DB persistence, WebSocket signalling — run via `npm run test:it`), but `tests/unit` is still empty scaffolding.
- `web-server/src`: `npm run dev` runs Astro directly (`astro dev`); `npm run build` / `npm run preview` for production builds. `npm test` (or `npm run test:component` from the repo root) runs Vitest via `web-server/src/vitest.config.ts` (Astro's `getViteConfig` integration, jsdom environment). Tests live in `web-server/tests/unit/` (token-worker/TokenService, CSP middleware) and `web-server/tests/components/` (AuthScreen/App/CallScreen — auth and use-token-worker.ts mocked at the module boundary since jsdom has no real Worker; call-screen.test.tsx mocks rtc-utils.ts entirely, since real WebRTC/getUserMedia isn't something jsdom implements and e2e/call.spec.ts + chat.spec.ts already exercise real negotiation in actual browsers). `web-server/tests/` has its own `package.json`/`node_modules` (testing-library, a type-only copy of `astro`), separate from `web-server/src/` — same sibling-`node_modules` pattern as `web-socket-api/tests/`. The one exception is `@testing-library/react` itself, kept in `web-server/src/`'s own node_modules alongside the real `react`/`react-dom` — a separate copy elsewhere creates two React module instances in one process ("Invalid hook call"), since react-dom's CJS internals resolve `react` via plain Node `require`, bypassing Vite's alias/SSR handling for externalized deps.

A root `.env` (copied from `.env.example`) is required and is shared by both the frontend and backend containers — see the @README.md Environment Variables section for the full variable list (`JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `DB_*`, `NGROK_HOST`, `LOCAL`, `NODE_ENV`).

Pre-commit hook (Husky) runs `lint-staged` (`xo --prettier` on staged `.js`/`.css`) and verifies the Astro frontend builds.

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
  - `utils/ice-servers.js` — builds the `RTCPeerConnection` `iceServers` list. With `TURN_URLS` and `TURN_SECRET` set (prod, CI NAT stack), it returns the self-hosted coturn STUN/TURN URLs with short-lived credentials in the TURN REST API format (`<expiry>:<email>` / base64 HMAC-SHA1 of that, keyed with the shared secret). Without them it returns Google's public STUN servers only (dev default, no relay).
  - `utils/session-store.js` — in-memory `Map` of `callId → { wsURL, participants, pendingParticipants }`. **No persistence** — restarting the API drops all active calls.
  - `utils/ws-server.js` — creates a WebSocket server per call for signalling.
  - `utils/misc.js` — WS message handlers plus `verifyClient` (WS origin check, see below).
- `common/` — `database.js` (MySQL via Sequelize, `sync()` on first run; dev seeder adds test users only when `NODE_ENV=dev`), `middlewares/` (auth/permission/token handling), `models/` (`User`, `Call`, `CallParticipants`, `RefreshToken`).
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
- `src/components/call-screen.tsx`, `video-grid.tsx`, `chat-panel.tsx` — call UI, video tiles, chat sidebar.
- `src/lib/rtc-utils.ts` — WebRTC helpers (media capture, `RTCPeerConnection` setup, WS messaging).
- `src/lib/use-token-worker.ts` — hook wrapping `token-worker.js`; the Worker instance is a **module-level singleton** so all components share one instance/token.
- `public/token-worker.js` — plain JS Web Worker owning `TokenService`, which holds the JWT access token in a private field and performs all `fetch` calls to the Express API, so the token never touches the main thread.
- `server.mjs` — production entry point (`Dockerfile.prod`). Wraps the `@astrojs/node` standalone handler (`ASTRO_NODE_AUTOSTART=disabled`) and, when `API_PROXY_TARGET` is set, forwards `/auth/`, `/call/` and `/wss/` (WebSocket upgrades included) to the API with `http-proxy-3`, rewriting `Host` but keeping `Origin`. It's the prod counterpart of the Vite dev proxy in `astro.config.mjs`: browsers only ever talk to the frontend's origin, which keeps the `SameSite=Strict` refresh cookie first-party.
- `src/middleware.ts` — nonce-based CSP header, applied in production only (skipped in dev to avoid blocking Vite HMR/dev toolbar).
- Colours come from the shared palette in the repo-root `colors.json` (also used by the mobile app): `src/styles/colors-plugin.mjs` adds each entry as a Tailwind colour (`bg-surface`, `text-ink-muted`, `border-line-control`, `ring-focus`…). Use those, not raw `zinc-*` classes. Because the file is outside `web-server/src`, both Dockerfiles use `WORKDIR /voneo/web-server/src` and `COPY --from=root colors.json /voneo/colors.json`, with the `root` build context set in `compose.yaml` / `e2e/compose.e2e.yaml` (`additional_contexts`) and the setup scripts (`--build-context root=.`). Pulumi (`infra/index.ts`) instead copies `colors.json` into a gitignored `infra/.root-context/` and uses that as `root`: `@pulumi/docker-build` hashes every file in each context (ignoring `.dockerignore` for named ones), so the repo root made previews take minutes. Don't point it back at `..`. `npm run dev` restarts the container when `colors.json` changes.

See `web-server/src/CLAUDE.md` for Astro-specific dev-server guidance (background mode via `astro dev --background`).

### Mobile app (`mobile-app/`)

Expo (React Native) Android app, see `mobile-app/CLAUDE.md` for Expo-specific rules. It talks to the signalling API directly and uses `react-native-webrtc`, so it needs the EAS dev-client build (Expo Go can't load it; run with `npx expo start --dev-client`).
- `app.tsx` switches between `src/screens/auth-screen.tsx` and `call-screen.tsx` (+ `in-call-view.tsx`, `chat-sheet.tsx`) with plain state, not Expo Router (two screens, and Expo Router needs a native rebuild).
- UI matches the web app: `src/theme/theme.ts` reads the repo-root `colors.json` (so `metro.config.js` watches the repo root, blocking everything there but `colors.json` and `mobile-app/`) and defines the Geist type scale, spacing and 48dp touch size; `src/components/` holds `Button`, `IconButton`, `TextField`, `Tabs`, `Card`. Geist is embedded by the `expo-font` config plugin in `app.json`, so font or icon (`react-native-svg`) changes need a new dev-client build. Import Lucide icons one at a time (`lucide-react-native/icons/<name>`): Metro doesn't tree-shake the package index.
- `src/lib/`: `config.ts` (API URL from `EXPO_PUBLIC_API_URL`, default `http://10.0.2.2:3000` for the emulator against the `LOCAL=true` stack), `call-url.ts` (WS URL from `callID`, call ID check), `api.ts`, `signalling.ts` (WS join handshake), `call-session.ts` (WebRTC signalling matching the web client's `rtc-utils.ts`, peers injected via `call-types.ts`), `webrtc.ts` (the only `react-native-webrtc` user), `use-call.ts` (hook wiring them together).
- Tests: `npm test` in `mobile-app/` runs Jest (`jest-expo`) + React Native Testing Library over `mobile-app/tests/`; Maestro flows in `mobile-app/.maestro/` (run locally with `npm run test:maestro` from the repo root, which needs the dev build installed on the emulator; `mobile-e2e.yml` builds a release APK with `expo prebuild` + Gradle and runs them on an emulator). `tests/setup.ts` stubs safe-area insets and reduced motion with plain functions, because the tests' `jest.resetAllMocks()` wipes the libraries' own `jest.fn()` mocks.
- No regexes in `mobile-app/` app code: XO requires the `v` flag, which Hermes rejects at load. (Node-only config like `metro.config.js` is exempt.)

### Infra (`infra/`)

Pulumi (TypeScript) provisions GCP resources. `infra/README.md` lists each one with its AWS equivalent and has the one-time setup steps per stack. The resources:
- the GCP APIs the stack uses (enabled from code)
- a VPC and subnet, for the TURN VM
- an Artifact Registry repo, with both prod images built and pushed by Pulumi itself (`@pulumi/docker-build`) and deployed to Cloud Run by digest. The images set `exec: true`, so the provider runs the host's `docker buildx` (which must be installed) instead of its embedded v0.12 client, whose registry auth timed out on pushes lasting about a minute
- frontend and backend Cloud Run services, each with its own service account. Both are public at their `run.app` URLs; there's no load balancer, domain or certificate. Users open the frontend's URL (the `appUrl` output, built from the service name and project number, since reading the frontend's URL would make the services depend on each other), and its `server.mjs` proxies API/WS routes to the backend's `run.app` URL (`API_PROXY_TARGET`). The backend's `ALLOWED_ORIGIN` is `appUrl`. Both have a 3600s request timeout, since signalling WebSockets pass through both
- Cloud SQL MySQL 8.4 (Enterprise edition), reached only through the Cloud SQL connector socket, which `common/database.js` uses as `socketPath` when `DB_HOST` is a path
- Secret Manager secrets
- a self-hosted coturn STUN/TURN VM

`infra/package.json` is `"type": "module"`, which Pulumi's built-in ts-node can't load, so `Pulumi.yaml` sets `typescript: false` and `nodeargs: --import tsx`, running `index.ts` through `tsx` as the tests do. Each stack's Pulumi Cloud page shows a stack README: the `infra/Pulumi.README.md` template, exported as the `readme` output, with its `${outputs.*}` placeholders filled in by Pulumi Cloud. Pulumi has no conditionals, so `stackReadme()` in `index.ts` drops the `<!-- ephemeral -->`, `<!-- prod -->` and `<!-- turn -->` sections that don't apply to the stack. Keep comment markers out of Markdown tables, because Prettier splits a table around them. Required stack config: `gcp:project` and the secrets. `dev` and `prod` each deploy into their own GCP project, keeping dev away from prod's data. `prod-preview` deploys into prod's project, in its own VPC, with every name stack-suffixed (including the Artifact Registry repo, `voneo-<stack>`). The VM (`infra/turn-server.ts`) is only created when `voneo-video-chat:turnEnabled` is true: prod and prod-preview. It's an `e2-micro` Container-Optimized OS instance with a static IP, a firewall rule, and its own service account that can read only the `turn-secret-<stack>` secret. It runs the pinned `coturn/coturn` image with `infra/coturn/turnserver.conf` plus prod-only lines (external IP, deny relaying to private/metadata ranges). Keep that image tag in sync with `e2e/compose.nat.yaml`. Stacks (`infra/Pulumi.<stack>.yaml`, GCP resource/secret names suffixed by stack): `dev` and `prod-preview` are ephemeral (`voneo-video-chat:ephemeral: true`), deployed for one e2e run and destroyed straight after. That gives them no Cloud SQL deletion protection and a Pulumi auto-named instance (GCP reserves deleted instance names for about a week). `prod` is long-lived, with deletion protection. Every stack labels its Cloud SQL instance, Cloud Run services and TURN VM with `git-sha`/`git-dirty` (the `gitSha` config overrides detection). The snapshot tests (`infra/tests/prod.test.ts`, `ephemeral.test.ts`, sharing `snapshot.ts`) cover both configs; the prod one enables TURN. In CI, `pr-dev.yml`'s `e2e-gcp-dev` and `pr-main.yml`'s `e2e-gcp-prod-preview` deploy the PR head, test, then destroy on `if: always()`, one run at a time per stack (a `concurrency` group), skipping fork PRs. `deploy-prod.yml` runs `pulumi up` on merge to `main`. All of it goes through GCP Workload Identity Federation. Only `dev` is set up so far: its GCP project and Pulumi stack exist, and it has been deployed from a local machine. There are no `prod` or `prod-preview` stacks and no GitHub environment secrets yet, so the CI GCP jobs and `deploy-prod.yml` can't deploy. `infra/README.md` walks through the setup.

## Known incomplete areas

- Calls and their WebSocket servers are in-memory only; nothing survives an API restart.
- Production CORS/WS-origin allowlist is a single `ALLOWED_ORIGIN` value: each Pulumi stack's `appUrl` (the frontend's `run.app` URL). The app is served only from that URL; there's no custom domain.
- TODO: all calls currently share a single WS port (`3000`) via path-based routing (`/wss/:callID`), dropped in favour of Cloud Run compatibility (Cloud Run only exposes one port per service). The original per-call random-port design (`setRandomPort`, `WS_PORT_MIN`/`WS_PORT_MAX`) is removed; multiple simultaneous calls are already supported under the shared-port design (each isolated by its own `callID`-routed `WebSocketServer`), so this is only relevant if a future deployment target supports multiple exposed ports and process/connection-level isolation or scaling per call becomes worth the cost.
- TODO: no rate limiting exists anywhere on the WebSocket signalling path (`call/utils/ws-server.js`/`misc.js`). Once implemented, add an integration test alongside the existing ones in `web-socket-api/tests/it/websocket/limits.test.js` asserting the restriction actually kicks in under high enough traffic.
