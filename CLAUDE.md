# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Voneo is a peer-to-peer video chat app: an Astro/React frontend (`web-server/`) talks to an Express.js signalling API (`web-socket-api/`), which spins up a dedicated in-memory WebSocket server per call for session coordination (participants, chat, SDP offer relay). WebRTC handles actual media peer-to-peer once signalling completes (`web-server/src/src/lib/rtc-utils.ts`).

Everything runs via Docker Compose in dev, tunnelled through ngrok so the app is reachable from devices other than the host (needed for testing real WebRTC peers). A `LOCAL=true` env mode exists to bypass ngrok and run against `localhost` only — see @README.md for the tradeoffs (single-device testing only, and `NGROK_HOST` must be unset when `LOCAL=true`).

## Commands

All commands below are run from the repo root unless noted.

- `npm run setup` — install npm deps across the repo and build dev Docker images. Not strictly required (containers self-provision) but avoids editor type/import errors.
- `npm run dev` — start both dev containers (frontend + signalling API + MySQL) via `docker compose watch`.
- `npm run halt-dev` — stop all dev containers.
- `npm run tunnel` — start the ngrok tunnel (requires `ngrok.yml` with an authtoken, copied from `ngrok.example.yml`).
- `npm run nuke` — full teardown: removes containers/images/volumes/deps, then rebuilds/reinstalls. Destructive — only run when setup is broken.
- `npm test` (root) — runs `xo` (lint) across the repo; this is the only root-level test/lint command.
- `npm run test:e2e` — run e2e tests in `e2e/` against a prod-mode simulation stack (own compose project, isolated `test-db`, Caddy TLS proxy at `https://voneo.test`; see `e2e/compose.e2e.yaml`). Brings the stack up, runs Playwright, tears down. Requires `voneo.test` to resolve to `127.0.0.1` in your hosts file, and stopping `npm run dev` first (fixed host ports collide). Don't run `npx playwright test` directly — it expects the stack already running at that URL. Only the `chromium` project is configured (see `playwright.config.ts`) — kept deliberately single-browser for dev speed/simplicity, and because the fake-media-stream flags the suite relies on are Chromium-only; no Firefox/WebKit coverage exists.
- `npm run test:e2e:happy-path` — same as `test:e2e` but filtered to specs tagged `@happy-path` (currently just call creation/join); used by the `pr-dev.yml` CI workflow for a faster PR check into `dev`.
- `npm run test:e2e:nat` — NAT-traversal e2e suite (`e2e/nat/`), run by the `e2e-nat-traversal` job in `pr-main.yml`. Adds `e2e/compose.nat.yaml` on top of the e2e stack. That overlay adds a `coturn` container, using the same pinned image and `infra/coturn/turnserver.conf` as the prod VM, plus three `playwright run-server` browser containers, two on Docker network `lan-a` and one on `lan-b`. Lan-a↔lan-b calls can only connect through the TURN relay. Don't rely on Docker for that isolation: Docker Desktop routes and NATs between bridge networks. The overlay enforces it itself, with per-browser iptables sidecars that drop the other LAN's subnet and with `enable_ip_masquerade: false` on both LANs. As a result the LANs have no internet, so the browsers run the host's mounted `node_modules/playwright-core`. The tests assert same-network = `host`↔`host` pair, cross-network = both local candidates `relay`. `E2E_NAT=1` swaps `playwright.config.ts` to this project only; the regular `chromium` project ignores `e2e/nat/`. The browser container image version comes from the installed `@playwright/test` (`PLAYWRIGHT_VERSION`, set by `scripts/test-e2e-nat.*`, which also pre-pulls that image because Compose can crash pulling one image for several services at once). No hosts entry or local browsers are needed. It uses the same host ports as `test:e2e`, so don't run both at once.
- `npm run lint` — Runs XO linting with prettier config passed in
- `npm run lint:fix` — Applies XO linting and prettier formatting fixes where possible, identifies any errors/warnings that couldn't be implemented
- `npm run test:it` — alias to run the integration tests for the API (and eventually the websocket infra)
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
- ICE servers: this depends on `TURN_URLS`/`TURN_SECRET` rather than `NODE_ENV`. Pulumi sets them only on the prod stack (`turnEnabled`); in dev they're normally unset, so the API falls back to Google STUN.

### Frontend (`web-server/src`)

Astro (SSR via `@astrojs/node`) with React islands, Tailwind v4, shadcn/ui. Paths below are relative to `web-server/src/` (the Astro source tree itself lives one level further down, at `web-server/src/src/`).

- `src/pages/index.astro` — shell page, renders `<App client:load />`.
- `src/components/app.tsx` — root, switches between `AuthScreen` (`auth-screen.tsx`, logged out) and `CallScreen` (logged in).
- `src/components/call-screen.tsx`, `video-grid.tsx`, `chat-panel.tsx` — call UI, video tiles, chat sidebar.
- `src/lib/rtc-utils.ts` — WebRTC helpers (media capture, `RTCPeerConnection` setup, WS messaging).
- `src/lib/use-token-worker.ts` — hook wrapping `token-worker.js`; the Worker instance is a **module-level singleton** so all components share one instance/token.
- `public/token-worker.js` — plain JS Web Worker owning `TokenService`, which holds the JWT access token in a private field and performs all `fetch` calls to the Express API, so the token never touches the main thread.
- `src/middleware.ts` — nonce-based CSP header, applied in production only (skipped in dev to avoid blocking Vite HMR/dev toolbar).

See `web-server/src/CLAUDE.md` for Astro-specific dev-server guidance (background mode via `astro dev --background`).

### Mobile app (`mobile-app/`)

Expo (React Native) Android app, see `mobile-app/CLAUDE.md` for Expo-specific rules. It talks to the signalling API directly: `src/lib/config.ts` (API URL from `EXPO_PUBLIC_API_URL`, default `http://10.0.2.2:3000` for the emulator against the `LOCAL=true` stack), `src/lib/call-url.ts` (WS URL from `callID`), `src/lib/api.ts`, and `src/lib/signalling.ts` (WS join handshake). `app.tsx` is a temporary connectivity check screen. There's no test runner yet, so `mobile-ci.yml`'s test job fails until Jest is added.

### Infra (`infra/`)

Pulumi (TypeScript) provisions GCP resources: Cloud Run service, Cloud SQL instance, Secret Manager secrets, and a self-hosted coturn STUN/TURN VM. The VM (`infra/turn-server.ts`) is only created when `voneo-video-chat:turnEnabled` is true, which today is the prod stack only. It's an `e2-micro` Container-Optimized OS instance with a static IP, a firewall rule, and its own service account that can read only the `turn-secret-<stack>` secret. It runs the pinned `coturn/coturn` image with `infra/coturn/turnserver.conf` plus prod-only lines (external IP, deny relaying to private/metadata ranges). Keep that image tag in sync with `e2e/compose.nat.yaml`. The Pulumi snapshot test enables TURN, so it covers these resources. Separate `dev`/`prod` stacks (`infra/Pulumi.dev.yaml` / `Pulumi.prod.yaml`, GCP resource/secret names suffixed by stack to avoid collisions). Deploy/destroy via `npm run gcp-deploy-dev` / `npm run gcp-destroy-dev` / `npm run gcp-deploy-prod` / `npm run gcp-destroy-prod` (run `pulumi up`/`pulumi destroy --stack <dev|prod>` from `infra/`). In CI, `deploy-dev.yml`/`deploy-prod.yml` run the same on merge to `dev`/`main` via GCP Workload Identity Federation — not yet configured (see TODOs in the Pulumi stack files).

## Known incomplete areas

- Calls and their WebSocket servers are in-memory only; nothing survives an API restart.
- Production CORS/WS-origin allowlist is a single `ALLOWED_ORIGIN` value, filled in via env var per deployment — not yet set for any real deployed domain.
- TODO: all calls currently share a single WS port (`3000`) via path-based routing (`/wss/:callID`), dropped in favour of Cloud Run compatibility (Cloud Run only exposes one port per service). The original per-call random-port design (`setRandomPort`, `WS_PORT_MIN`/`WS_PORT_MAX`) is removed; multiple simultaneous calls are already supported under the shared-port design (each isolated by its own `callID`-routed `WebSocketServer`), so this is only relevant if a future deployment target supports multiple exposed ports and process/connection-level isolation or scaling per call becomes worth the cost.
- TODO: no rate limiting exists anywhere on the WebSocket signalling path (`call/utils/ws-server.js`/`misc.js`). Once implemented, add an integration test alongside the existing ones in `web-socket-api/tests/it/websocket/limits.test.js` asserting the restriction actually kicks in under high enough traffic.
