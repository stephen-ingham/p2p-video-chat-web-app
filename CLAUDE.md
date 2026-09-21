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
- `npx playwright test` — run e2e tests in `e2e/` (Playwright config at `playwright.config.ts`).
- `npm run lint` —  Runs XO linting with prettier config passed in
- `npm run lint:fix` — Applies XO linting and prettier formatting fixes where possible, identifies any errors/warnings that couldn't be implemented
- `npm run test:it` — alias to run the integration tests for the API (and eventually the websocket infra)
Per-workspace:
- `web-socket-api/src`: `npm run dev` runs the API directly with `node --env-file=.env app.js` (outside Docker). No test runner is currently wired up (`npm test` is a placeholder); `tests/it` and `tests/unit` exist but are empty scaffolding.
- `web-server/src`: `npm run dev` runs Astro directly (`astro dev`); `npm run build` / `npm run preview` for production builds. `web-server/tests/components` exists but is empty scaffolding. Vitest is a devDependency but no tests are written yet.

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

### - Pass the required git hooks

Ensures the git hooks in the `pre-commit` and `pre-push` husky scripts succesfully pass before a git commit is pushed.
However, on `feat/` branches in the case that the needed changes to make this hook scripts pass would exceed the change size requirement, add `WIP:` after the [git commit type prefix]().
e.g. `chore(WIP):`

This indicates that a developer should expect errors if they try to use the system at this commit hash.

## Architecture

### Signalling API (`web-socket-api/src`)

- `app.js` — Express entry point (port 3000 in dev).
- `authorization/` — signup/login/logout/refresh routes and controller. JWT-based; access token via `Authorization: Bearer`, refresh token via cookie.
- `call/` — call lifecycle:
  - `controller.js` / `routes.js` — `POST /call/create`, `PUT /call/:callID/join`, `DELETE /call/:callID/leave`, `POST /call/:callID/messages`.
  - `utils/session-store.js` — in-memory `Map` of `callId → { wsURL, participants, pendingParticipants }`. **No persistence** — restarting the API drops all active calls.
  - `utils/ws-server.js` — creates a WebSocket server per call for signalling.
  - `utils/misc.js` — helpers including `constructURI`, which behaves differently in dev vs. production (see below).
- `common/` — `database.js` (MySQL via Sequelize, `sync()` on first run; dev seeder adds test users only when `NODE_ENV=dev`), `middlewares/` (auth/permission/token handling), `models/` (`User`, `Call`, `CallParticipants`, `RefreshToken`).
- `openapi.yaml` — Located at @web-socket-api/src/openapi.yaml - the API schema reference, kept in sync with the controllers/routes as of this writing; re-verify against the controller if it's been a while since it was last updated.

WebSocket message protocol (client ↔ per-call WS server):
- Client → server: `newParticipantOnCall`, `chatMessage`, `offer` (relayed to a named recipient).
- Server → client: `receivedNewParticipantNotif`, `responseCurrentCallParticipants`, `offer`, `chatMessage` / `receivedNewChatMessage`.

### Dev vs. production divergence (signalling API)

Several behaviors branch on `NODE_ENV`/`LOCAL` — check these before assuming behavior is environment-independent:
- WS server port: every call's WebSocket server shares the app's single listening port (`3000`) in both dev and production, via `noServer: true` and the shared HTTP server's `upgrade` event (`handleUpgrade` in `call/utils/ws-server.js`), routed by `callID` path.
- WS URL construction (`constructURI` in `call/utils/misc.js`): dev path is `/wss/:callID` (or `/ws/:callID` when `LOCAL=true`); production builds `wss://<ALLOWED_ORIGIN>/wss/:callID` — same path shape, different scheme/host.
- WS origin verification (`verifyClient` in `call/utils/misc.js`) and CORS (`app.js`) both check the `Origin` header against `ALLOWED_ORIGIN` (env var) in production, and against `LOCAL`/`NGROK_HOST`-derived origins in dev.
- Refresh token cookie: `Secure` only set in production.

### Frontend (`web-server/src`)

Astro (SSR via `@astrojs/node`) with React islands, Tailwind v4, shadcn/ui. Paths below are relative to `web-server/src/` (the Astro source tree itself lives one level further down, at `web-server/src/src/`).

- `src/pages/index.astro` — shell page, renders `<App client:load />`.
- `src/components/App.tsx` — root, switches between `AuthScreen` (logged out) and `CallScreen` (logged in).
- `src/components/CallScreen.tsx`, `VideoGrid.tsx`, `ChatPanel.tsx` — call UI, video tiles, chat sidebar.
- `src/lib/rtcUtils.ts` — WebRTC helpers (media capture, `RTCPeerConnection` setup, WS messaging).
- `src/lib/useTokenWorker.ts` — hook wrapping `token-worker.js`; the Worker instance is a **module-level singleton** so all components share one instance/token.
- `public/token-worker.js` — plain JS Web Worker owning `TokenService`, which holds the JWT access token in a private field and performs all `fetch` calls to the Express API, so the token never touches the main thread.
- `src/middleware.ts` — nonce-based CSP header, applied in production only (skipped in dev to avoid blocking Vite HMR/dev toolbar).

See `web-server/src/CLAUDE.md` for Astro-specific dev-server guidance (background mode via `astro dev --background`).

### Infra (`infra/`)

Pulumi (TypeScript) provisions GCP resources for production: Cloud Run service, Cloud SQL instance, Secret Manager secrets. Deploy/destroy via `npm run gcp-deploy-dev` / `npm run gcp-destroy-dev` (runs `pulumi up`/`pulumi destroy` from `infra/`).

## Known incomplete areas

- Calls and their WebSocket servers are in-memory only; nothing survives an API restart.
- Production CORS/WS-origin allowlist is a single `ALLOWED_ORIGIN` value, filled in via env var per deployment — not yet set for any real deployed domain.
- TODO: all calls currently share a single WS port (`3000`) via path-based routing (`/wss/:callID`), dropped in favour of Cloud Run compatibility (Cloud Run only exposes one port per service). The original per-call random-port design (`setRandomPort`, `WS_PORT_MIN`/`WS_PORT_MAX`) is removed; if a future deployment target supports multiple exposed ports, consider re-adding per-call ports for connection isolation/scaling.
