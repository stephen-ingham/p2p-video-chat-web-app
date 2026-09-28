# Note: WORK IN PROGRESS

# Voneo - P2P Video Chat App

![Voneo](readme%20gif.gif)

[![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![WebSocket](https://img.shields.io/badge/WebSocket-010101?logo=websocket&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
[![WebRTC](https://img.shields.io/badge/WebRTC-333333?logo=webrtc&logoColor=white)](https://webrtc.org/)
[![http-proxy-3](https://img.shields.io/badge/http--proxy--3-4B5563?logo=&logoColor=white)](https://github.com/sagemathinc/http-proxy-3#readme)
[![coturn](https://img.shields.io/badge/coturn-2C3E50?logo=&logoColor=white)](https://github.com/coturn/coturn/wiki)
[![MySQL](https://img.shields.io/badge/MySQL-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Sequelize](https://img.shields.io/badge/Sequelize-52B0E7?logo=sequelize&logoColor=white)](https://sequelize.org/)
[![JWT](https://img.shields.io/badge/JWT-black?logo=jsonwebtokens&logoColor=white)](https://jwt.io/)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![Astro](https://img.shields.io/badge/Astro-FF5D01?logo=astro&logoColor=white)](https://astro.build/)
[![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![React Native](https://img.shields.io/badge/React_Native-20232A?logo=react&logoColor=61DAFB)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![shadcn/ui](https://img.shields.io/badge/shadcn/ui-000000?logo=shadcnui&logoColor=white)](https://ui.shadcn.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Google Cloud](https://img.shields.io/badge/Google_Cloud-4285F4?logo=googlecloud&logoColor=white)](https://cloud.google.com/)
[![XO](https://img.shields.io/badge/XO-5ED9C7?logo=xo&logoColor=black)](https://github.com/xojs/xo)
[![Prettier](https://img.shields.io/badge/Prettier-F7B93E?logo=prettier&logoColor=black)](https://prettier.io/)
[![Playwright](https://img.shields.io/badge/Playwright-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/)
[![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![Jest](https://img.shields.io/badge/Jest-C21325?logo=jest&logoColor=white)](https://jestjs.io/)
[![Maestro](https://img.shields.io/badge/Maestro-4A4AFF?logo=&logoColor=white)](https://maestro.mobile.dev/)
[![Supertest](https://img.shields.io/badge/Supertest-07B203?logo=&logoColor=white)](https://github.com/visionmedia/supertest)
[![Testing Library](https://img.shields.io/badge/Testing_Library-E33332?logo=testinglibrary&logoColor=white)](https://testing-library.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Pulumi](https://img.shields.io/badge/Pulumi-8A3391?logo=pulumi&logoColor=white)](https://www.pulumi.com/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![ngrok](https://img.shields.io/badge/ngrok-1F232C?style=flat&logo=ngrok&logoColor=white)](https://ngrok.com/)

Voneo is a peer-to-peer video chat app with a web client (Astro/React) and an Android mobile client (Expo/React Native), backed by the same Node.js signalling stack.
Users authenticate then create or join calls through an Express.js API, which provisions per-call WebSocket servers for session coordination. WebRTC handles media between peers once signalling completes.

## Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Commands](#commands)
- [Local Setup](#local-setup-web)
- [Signalling Server (Express.js API)](#signalling-server-expressjs-api)
- [Environment Variables](#environment-variables)
- [Database Structure & Data Models](#database-structure--data-models)
- [Frontend (Astro + React)](#frontend-astro--react)
- [Mobile app (Expo, Android)](#mobile-app-expo-android)
- [End-to-end tests (Playwright)](#end-to-end-tests-playwright)
  - [NAT traversal suite (STUN/TURN)](#nat-traversal-suite-stunturn)
  - [Against a GCP deployment](#against-a-gcp-deployment)
- [Gotchas & Experimentation](#gotchas--experimentation)

## Overview

This project demonstrates a classic WebRTC architecture: an HTTP API and WebSocket layer for **signalling** (call creation, join/leave, SDP offers, chat), and the browser for **media** (camera/microphone via `getUserMedia`, peer connections via `RTCPeerConnection`).

Typical flow:

1. A user opens the app, authenticates (login or register), then creates a call or joins one with a call ID.
2. The Express API spins up a dedicated WebSocket server for that call and returns the call's ID. The client builds the WebSocket URL from that ID itself.
3. The client connects to that WebSocket server and exchanges signalling messages (participants, offers, chat).
4. WebRTC negotiation runs in the browser (`rtc-utils.ts`) to establish P2P video/audio where implemented, using the STUN/TURN servers returned by `GET /call/ice-servers` (see [STUN/TURN](web-socket-api/src/README.md#stunturn-nat-traversal)).

## Project Structure

<details>
<summary>Expand file tree</summary>

```
video-chat-application/
├── web-socket-api/              # Express.js signalling API + per-call WebSocket servers
│   ├── src/
│   │   ├── app.js               # API entry point (port 3000 by default)
│   │   ├── README.md            # API commands, routes, WebSocket protocol, STUN/TURN, data models
│   │   ├── openapi.yaml         # API schema reference (may drift from implementation)
│   │   ├── Dockerfile.prod      # Production Docker image for the signalling API
│   │   ├── Dockerfile.dev       # Signalling server Dev image — mounts source and watches for changes
│   │   ├── compose.yaml         # Docker Compose services (dev)
│   │   ├── authorization/       # Signup, login, logout, reset token provision routes
│   │   ├── call/                # Create / join / leave call routes + WS utilities
│   │   │   ├── controller.js
│   │   │   ├── routes.js
│   │   │   └── utils/           # Session store, WebSocket server, misc helpers
│   │   └── common/              # DB config (MySQL), models, JWT middleware
│   │       ├── database.js
│   │       ├── middlewares/     # Auth, permission checks, token handling
│   │       └── models/          # User, Call, CallParticipants, RefreshToken
│   └── tests/
│       ├── it/                  # Integration tests
│       └── unit/                # Unit tests (backend utilities, i.e. token generators, helper utils)
├── web-server/                  # Astro.js frontend (SSR, React + Tailwind + shadcn/ui)
│   ├── tests/
│   │   └── components/          # Component tests, i.e. validating interactive components respond to user
│   └── src/
│       ├── .gitignore           # Ignores build output, generated types, deps
│       ├── README.md            # Frontend commands
│       ├── CLAUDE.md            # Astro dev-server guidance for Claude Code
│       ├── AGENTS.md            # Astro dev-server guidance for other coding agents
│       ├── Dockerfile.prod      # Production Docker image — serving the built Astro SSR app
│       ├── server.mjs           # Production entry point: serves the app, proxies /auth, /call, /wss to the API
│       ├── Dockerfile.dev       # Astro SSR Dev image — mounts source and watches for changes
│       ├── compose.yaml         # Docker Compose services (prod + dev)
│       ├── public/
│       │   └── token-worker.js  # Web Worker: token storage + all API fetch calls
│       └── src/
│           ├── pages/
│           │   └── index.astro  # Shell page — imports global CSS, renders <App client:load />
│           ├── components/
│           │   ├── app.tsx      # Root — switches between AuthScreen / CallScreen
│           │   ├── auth-screen.tsx # Login + register tabs (shown when logged out)
│           │   ├── call-screen.tsx # Create/join call controls, video grid, chat sidebar
│           │   ├── video-grid.tsx  # Local + remote video tiles
│           │   ├── chat-panel.tsx  # Chat message list + send input
│           │   └── ui/          # shadcn/ui primitives
│           ├── lib/
│           │   ├── rtc-utils.ts # WebRTC helpers (media, peer connections, WS messaging)
│           │   ├── call-url.ts  # Builds a call's WebSocket URL from its callID + the page origin
│           │   ├── use-token-worker.ts # Hook — module-level singleton Worker
│           │   └── utils.ts     # shadcn cn() class utility
│           ├── styles/
│           │   ├── global.css   # Tailwind v4 + shadcn CSS variable theme
│           │   └── colors-plugin.mjs # Adds the shared colors.json palette as Tailwind colours
│           └── middleware.ts    # CSP header (nonce-based, skipped in dev mode)
├── mobile-app/                  # Expo (React Native) Android app — react-native-webrtc for calling, talks to web-socket-api directly (shares only colors.json with web-server)
│   └── README.md                # Mobile app commands (open on an emulator, tests, Maestro flows)
├── infra/                       # Pulumi (TypeScript) IaC — GCP deployment (Cloud Run, Cloud SQL, Artifact Registry, secrets); see infra/README.md for setup
│   ├── index.ts                 # Everything except the TURN VM; also builds and pushes the prod images
│   ├── turn-server.ts           # Self-hosted coturn STUN/TURN VM (prod stack only)
│   ├── Pulumi.README.md         # Stack README template shown on each stack's Pulumi Cloud page
│   ├── gcp-prod.drawio / .svg   # Architecture diagram of the prod GCP project (source / export shown in infra/README.md)
│   ├── gcp-dev.drawio / .svg    # Architecture diagram of the dev GCP project
│   └── coturn/turnserver.conf   # Base coturn config shared by the prod VM and the CI NAT e2e stack
├── scripts/                     # OS-specific scripts backing npm run commands, at the root and in the project folders
│   ├── dispatch.mjs             # Detects the host OS and runs the matching .ps1/.sh script
│   ├── setup.sh / setup.ps1
│   ├── nuke.sh / nuke.ps1
│   ├── dev.sh / dev.ps1
│   ├── halt-dev.sh / halt-dev.ps1
│   ├── test-e2e.sh / test-e2e.ps1
│   ├── test-e2e-nat.sh / test-e2e-nat.ps1
│   ├── test-maestro.sh / test-maestro.ps1
│   ├── mobile.sh / mobile.ps1
│   ├── gcp-e2e.mjs              # Deploys, e2e-tests and destroys an ephemeral GCP stack (dev, prod-preview)
│   └── buildx-cleanup.mjs       # Removes the buildx builder container Pulumi's image build leaves running
├── e2e/                         # End-to-end tests (Playwright)
│   ├── compose.nat.yaml         # NAT-traversal overlay: coturn + browsers on isolated Docker networks
│   └── nat/                     # Same-network vs cross-network (TURN relay) call tests
├── .github/workflows/           # CI/CD workflows
├── .husky/                      # Git hooks
├── colors.json                  # Shared colour palette for the web and mobile apps (see Colours)
├── .env.example                 # Example environment variables for local setup
├── .prettierrc                  # Prettier configuration
├── package.json                 # Root scripts to run both servers
├── playwright.config.ts         # Playwright configuration
└── ngrok.example.yml            # Ngrok tunnel config
```

</details>

## Commands

Commands that cover the whole repo run from the root:

| Command                       | What it does                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run setup`               | Installs every folder's npm dependencies and builds the dev Docker images                                            |
| `npm run setup:nuke`          | Deletes all of that (dependencies, images, volumes, containers) and sets it up again                                 |
| `npm run dev`                 | Starts the dev stack: frontend, signalling API and MySQL, rebuilding on changes                                      |
| `npm run dev:halt`            | Stops the dev stack                                                                                                  |
| `npm run dev:tunnel`          | Starts the ngrok tunnel to the dev stack                                                                             |
| `npm run lint` / `lint:fix`   | Lints the repo with XO and Prettier (except `mobile-app/`) / applies the fixes it can                                |
| `npm run test:e2e`            | Runs the Playwright e2e suite against a local prod-mode stack (see [End-to-end tests](#end-to-end-tests-playwright)) |
| `npm run test:e2e:happy-path` | The same, only the `@happy-path` specs                                                                               |
| `npm run test:e2e:nat`        | The NAT traversal suite (see [NAT traversal suite](#nat-traversal-suite-stunturn))                                   |

Commands for one part of the project run from that part's folder. Some key ones:

| Folder                                                | Command                           | What it does                                                          |
| ----------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------- |
| [`web-server/src/`](web-server/src/README.md)         | `npm test`                        | Frontend component and unit tests                                     |
| [`web-socket-api/src/`](web-socket-api/src/README.md) | `npm run test:it`                 | Signalling API integration tests                                      |
| [`mobile-app/`](mobile-app/README.md)                 | `npm run open`                    | Opens the app on an Android emulator for manual use                   |
| [`mobile-app/`](mobile-app/README.md)                 | `npm run test:e2e`                | Runs the Maestro flows on an Android emulator                         |
| [`infra/`](infra/README.md)                           | `npm run deploy-test-destroy:dev` | Deploys the dev GCP stack, runs the e2e suite against it, destroys it |

Each folder's README lists all of its commands.

## Local Setup (Web)

### Prerequisites

- [Docker](https://docs.docker.com/desktop/setup/install/) (v28+)
- [Node.js](https://nodejs.org/) (LTS recommended)
- [Ngrok](https://ngrok.com/download/)
- [Git](https://git-scm.com/install/)
- A machine with camera/microphone access for testing WebRTC

### 1. Clone repo, install npm deps & build dev docker images

```bash
# Clones the repo
git clone https://github.com/stephen-ingham/p2p-video-chat-web-app

# Auto installs the npm dependencies and builds the development docker images
npm run setup
```

`npm run setup` auto-detects your OS (via `scripts/dispatch.mjs`) and runs `scripts/setup.ps1` on Windows or `scripts/setup.sh` everywhere else - no need to pick a variant yourself.

Note: the `npm run setup` command above isn't technically necessary for developing using the docker containers as they will setup their own dependencies from scratch. However, it will help you avoid a lot of in-editor errors related to typing and package imports that could be inconvenient!

### 2. Provide your Ngrok auth token in `ngrok.yml`

- Copy `ngrok.example.yml` to `ngrok.yml`
- [Create an Ngrok account](https://dashboard.ngrok.com/login)
- Grab your account Auth Token and put it in the `authtoken` field in your new `ngrok.yml`.
  Alternatively you can add your authtoken to the default `ngrok.yml` configuration file at your system root using the following command:

```bash
ngrok config add-authtoken $YOUR_AUTHTOKEN
```

For further details, [refer to the Ngrok setup instructions here](https://dashboard.ngrok.com/get-started/setup/)

### 3. Create the .env in the root

Copy `.env.example` to new `.env`:

Note: you will need to replace the `WS_HOST` in `.env` with the ngrok tunnel URL prefixed explicitly by `wss://`. Otherwise the current defaults should be sufficient for local dev.

### 4. Run the docker dev containers

Spins up the built images for the Astro.js/React SSR frontend (`web-server-dev:1.0.0`), the Express.js/WebSockets backend (`signalling-server-dev:1.0.0`) and pulls/builds the MySQL 8.4 image (`mysql:8.4`)

```bash
npm run dev
```

### 5. Start the Ngrok tunnel

```bash
npm run dev:tunnel
```

### 6. Navigate to the UI

If the docker container setup went well then the frontend should be accessible at the your Ngrok tunnel URL in the browser and ready for use!:

For example:

App URL: **https://horizon-velvet-symphony.ngrok-free.dev/**

To spin down the dev containers smoothly use the following command. It also stops the `docker compose watch` processes that `npm run dev` started, which would otherwise keep a lock on the Compose projects and make the next `npm run dev` fail with "cannot take exclusive lock":

```bash
npm run dev:halt
```

#### Handling setup errors:

If something goes wrong during setup, you can run `npm run setup:nuke` to delete and re-setup all npm dependencies, cache, docker dev images/volumes and containers. Like `npm run setup`, it auto-detects your OS and runs the matching `scripts/nuke.ps1` or `scripts/nuke.sh`:

```bash
npm run setup:nuke
```

### Alternative Setup: using localhost directly (no Ngrok)

Instead of tunnelling through Ngrok (steps 2 and 5 above), you can run the app directly against `localhost` by setting `LOCAL=true` in your `.env`. This is quicker to get going but comes with major limitations — most notably you won't be able to reach the app from any device other than the machine running the containers. See [Using `LOCAL` instead of an Ngrok tunnel](#using-local-instead-of-an-ngrok-tunnel) in the Environment Variables section for full details before choosing this route.

---

## Signalling Server (Express.js API)

The Express.js API in `web-socket-api/src/` handles sign-up and login, and each call's lifecycle: create, join and leave. It runs on port `3000`.

- **Authentication:** logging in returns a JWT access token, sent as `Authorization: Bearer <token>`, and sets a refresh token cookie used to get new access tokens.
- **Calls:** creating a call starts a WebSocket server for it, which shares the API's port and is routed by call ID (`/wss/:callID`, or `/ws/:callID` with `LOCAL=true`). Clients exchange participant updates, WebRTC offers and chat messages over it. Active calls are held in memory only.
- **NAT traversal:** `GET /call/ice-servers` gives clients their STUN/TURN servers: Google's public STUN servers in local dev, and a self-hosted coturn server (STUN and TURN relay) in production.
- **Dev users:** with `NODE_ENV=dev`, two test users are seeded into the database.
- **Production:** with `NODE_ENV=production`, the refresh cookie is `Secure`, and CORS and WebSocket upgrades only accept the `ALLOWED_ORIGIN` origin.

See [`web-socket-api/src/README.md`](web-socket-api/src/README.md) for the full route reference, WebSocket message types, example requests, STUN/TURN setup and production behaviour.

## Environment Variables

In order to sign JWT access and reset tokens, the API requires a `.env` to define the following environment variables:

```ini
JWT_SECRET=thesecret
REFRESH_TOKEN_SECRET=anothersecret
NODE_ENV=dev
DB_NAME=dev-db
DB_PASSWORD=testpassword123
DB_HOST=mysql-db
DB_PORT=3306
NGROK_HOST=wss://<tunnel>.ngrok-free.dev
LOCAL=false
TURN_URLS=
TURN_SECRET=
MOBILE_E2E_APP_URL=
```

`MOBILE_E2E_APP_URL` is only read by `npm run open:remote` and `npm run test:e2e:remote` in `mobile-app/`: it's the deployed stack the mobile app talks to in those commands (see [`mobile-app/README.md`](mobile-app/README.md#against-a-deployed-stack-as-ci-does-npm-run-teste2eremote)).

This should be defined in the root directory in order for both the Astro frontend and Express.js/WebSockets backend to access these variables.
`NODE_ENV` can be set to either `dev` or `production`.

A `.env.example` file has been defined using these defaults for local testing. For production usage, ensure to set your own.

### Using `LOCAL` instead of an Ngrok tunnel

`LOCAL` can be set to `true` or `false`, and is only consulted when `NODE_ENV` is `dev`. Setting `LOCAL=true` tells the frontend and signalling server that you're accessing everything directly via `localhost` rather than through an Ngrok tunnel, and switches over the CORS/WebSocket origin checks, Astro's allowed hosts, and the WebSocket upgrade path (`/ws/:callID` instead of `/wss/:callID`) accordingly.

If you set `LOCAL=true`, you must leave `NGROK_HOST` with no value in your `.env` — having both set at once leads to the wrong host/allowed-origins configuration being used and will prevent correct deployment.

Bear in mind that running this way restricts your ability to test with anything other than the machine you're developing on: the app will only be reachable at `http://localhost:4321`, so you won't be able to test from another device (e.g. a phone on the same network, or a remote peer) unless you expose your local server to your LAN or the wider internet by some other means. That isn't covered here, since this README only documents the Ngrok tunnel approach.

---

## Database Structure & Data Models

The API stores users, calls, each user's participation in a call, and refresh tokens in MySQL, through Sequelize models in `web-socket-api/src/common/models/` (`User`, `Call`, `CallParticipants`, `RefreshToken`). A user's email is their primary key. Live call state (who's connected to each call's WebSocket server) is kept in memory and isn't persisted.

See [`web-socket-api/src/README.md`](web-socket-api/src/README.md#database-structure--data-models) for the entity-relationship diagram and how the models relate.

---

## Frontend (Astro + React)

**Framework:** Astro (SSR via `@astrojs/node`), accessed via Ngrok tunnel (e.g. `https://horizon-velvet-symphony.ngrok-free.dev/`) request forwarding to docker container spun up from image `web-server-dev:1.0.0`. Paths below are relative to `web-server/src/` (the Astro source tree itself lives one level further down, at `web-server/src/src/`).

**Entry:** `src/pages/index.astro` imports global CSS and renders `<App client:load />`.

### `use-token-worker.ts`

Hook that wraps the `token-worker.js` Web Worker. The Worker instance is a **module-level singleton** so all components share the same instance and the token stored after login is available to subsequent calls. Exposes: `login`, `register`, `logout`, `createCall`, `joinCall`.

### `token-worker.js`

Plain JS Web Worker served from `public/`. Owns the `TokenService` class which holds the JWT access token in a private field. Handles all `fetch` calls to the Express API so the token never touches the main thread.

### Colours (`colors.json`)

The web and mobile apps share one colour palette, `colors.json` in the repo root. Each entry has a role-based name (`canvas`, `surface`, `ink-muted`, `line-control`, `focus`, `danger`…), its hex value, and what it's for, including its WCAG contrast ratio where it's used for text or control edges.

- **Web:** `src/styles/colors-plugin.mjs` adds each entry as a Tailwind colour, so components use classes like `bg-surface` and `text-ink-muted` rather than raw `zinc-*` classes.
- **Mobile:** `mobile-app/src/theme/theme.ts` imports the same file.

The file sits outside `web-server/src`, which is the web images' Docker build context. So the Dockerfiles copy it in from a second build context named `root` (the repo root), set in `compose.yaml` and `e2e/compose.e2e.yaml` (`additional_contexts`) and in the setup scripts (`--build-context root=.`). Pulumi's GCP image build is the exception. It copies `colors.json` into `infra/.root-context/` (gitignored) and uses that folder as `root`, because `@pulumi/docker-build` reads and hashes every file in a build context, and hashing the whole repo made each preview take minutes. The images use `/voneo/web-server/src` as their working directory, so the plugin finds `colors.json` at the same relative path as in the repo. `npm run dev` restarts the web container when `colors.json` changes.

### CSP middleware (`src/middleware.ts`)

Sets a nonce-based `Content-Security-Policy` header on every response in production. Skipped in dev mode to avoid blocking Vite's HMR and dev toolbar scripts. Directives cover `script-src`, `worker-src`, `connect-src` (API + WebSocket), `media-src`, `style-src`, `img-src`, `object-src`, and `base-uri`.

### Dockerfiles

There are two dockerfiles for the frontend in `web-server/src/`:

- `Dockerfile.dev`:

Created for local development and syncs local file changes into the container automatically.

- `Dockerfile.prod`:

Produces a production-optimised image. The e2e stack also uses it. It runs `server.mjs`, which serves the built app through `@astrojs/node`'s handler and, when `API_PROXY_TARGET` is set, forwards `/auth/`, `/call/` and `/wss/` (including WebSocket upgrades) to the signalling API. On Cloud Run it also attaches an ID token for the frontend's service account (`API_PROXY_ID_TOKEN=true`), the only identity allowed to call the API. This is the production version of the Vite dev proxy in `astro.config.mjs`: browsers only talk to the frontend's origin, so there's no need for a load balancer to route paths, and the `SameSite=Strict` refresh cookie stays first-party.

For GCP deployments, `pulumi up` builds this image and pushes it to the stack's Artifact Registry repo, as `europe-west2-docker.pkg.dev/<project>/voneo-<stack>/voneo-frontend:<stack>`. The Cloud Run service then runs it by digest. The signalling API's `Dockerfile.prod` is handled the same way.

---

## Mobile app (Expo, Android)

`mobile-app/` is an Expo (React Native) Android app. It talks to the signalling API directly, with no code shared with `web-server`, and uses `react-native-webrtc` for calls. Its signalling matches the web client's, so web and mobile users can be on the same call.

- `app.tsx` — shows `AuthScreen` while logged out and `CallScreen` once logged in. It uses plain state rather than Expo Router: there are only two screens, and Expo Router would need a new native build.
- `src/screens/` — `auth-screen.tsx` (login/register), `call-screen.tsx` (create or join a call), `in-call-view.tsx` (full-screen remote video, your video in a corner, mic/camera/chat/hang-up controls), `chat-sheet.tsx` (chat as a bottom sheet).
- `src/theme/theme.ts` and `src/components/` — the look shared with the web app: the palette from the root `colors.json`, Geist type scale, spacing and 48dp touch targets, and the `Button`, `IconButton`, `TextField`, `Tabs` and `Card` primitives. `metro.config.js` lets Metro read `colors.json` from outside `mobile-app/`.
- `src/lib/config.ts` — API base URL, from `EXPO_PUBLIC_API_URL`. The default, `http://10.0.2.2:3000`, is the Android emulator's alias for the host machine, direct to the API port. It suits the `LOCAL=true` dev stack. Expo inlines the variable when Metro starts, so restart Metro after changing it.
- `src/lib/call-url.ts` — builds a call's WebSocket URL from its `callID` (`ws://<host>/ws/:callID` for an `http` API URL, `wss://<host>/wss/:callID` for `https`), and validates call IDs.
- `src/lib/api.ts` / `src/lib/signalling.ts` — REST client (including ICE servers) and the WebSocket join handshake.
- `src/lib/call-session.ts` — the call's WebRTC signalling: the joiner offers to everyone already on the call, they answer, and ICE candidates are exchanged. Peers are injected, so it's tested with fakes.
- `src/lib/webrtc.ts` — the only module using `react-native-webrtc` directly: camera/mic capture and the real peer connections.
- `src/lib/use-call.ts` — the hook tying these together for the call screen.

**Running it against the dev stack:**

The app needs a development build, because Expo Go doesn't include `react-native-webrtc`'s native code. Build it once with `eas build --profile development --platform android` and install the APK on the emulator, or build it on a GitHub runner with the `mobile-dev-client.yml` workflow (see [`mobile-app/README.md`](mobile-app/README.md)). Rebuild only after adding native packages or changing native config in `app.json`, including the fonts embedded by the `expo-font` config plugin.

1. Set `LOCAL=true` in the root `.env` and run `npm run dev`.
2. Start an Android emulator (Android Studio → Device Manager).
3. From `mobile-app/`, run `npx expo start --dev-client` and press `a`.

Steps 2 and 3 can be replaced with `npm run open` in `mobile-app/`. It boots an emulator if none is connected (the first in Device Manager, or the one named in `VONEO_AVD`) and leaves it running. It then starts Metro and opens the app. It doesn't start the API, so do step 1 yourself first. To use a deployed stack instead of a local API, e.g. prod, set `MOBILE_E2E_APP_URL` in `.env` to its `appUrl` and run `npm run open:remote`, skipping step 1.

`react-native-webrtc` asks for camera and microphone permission itself when a call starts.

**Tests:**

- `npm test` in `mobile-app/` runs Jest (`jest-expo` preset) with [React Native Testing Library](https://callstack.github.io/react-native-testing-library/). Tests live in `mobile-app/tests/`: unit tests for `api.ts`, `call-url.ts` and `call-session.ts`, and component tests for the auth and call screens with the API, signalling and WebRTC modules mocked. These include accessibility checks (labelled fields, tab and switch states, button names). `mobile-ci.yml` runs them on PRs that touch `mobile-app/` or `colors.json`.
- [Maestro](https://maestro.mobile.dev/) flows in `mobile-app/.maestro/` cover logging in, creating a call and hanging up, and a failed login. In CI they run on an emulator with a release APK built on the runner, against the GCP deployments (see [Against a GCP deployment](#against-a-gcp-deployment)): PRs into `dev` run only the happy path (`create-call.yaml`, tagged `happy-path`) against the dev stack, and PRs into `main` run every flow against `prod-preview`. `mobile-e2e.yml` runs every flow when started manually (Actions tab, or `gh workflow run mobile-e2e.yml`): against a local API on the runner by default, or against a deployed stack with its `api_url` input set to that stack's `appUrl` (`gh workflow run mobile-e2e.yml -f api_url=<appUrl>`), after signing up the user the flows log in as. The APK build and emulator steps live in `.github/actions/maestro-e2e`, shared by all three. The built APK is cached per API URL, keyed on the app's source (not the Maestro flows), so it's only rebuilt when the app changes. `mobile-apk-cache.yml` builds it after every push to `dev` (dev stack) and `main` (`prod-preview`), because a PR can only restore caches from its own runs and its base branch. It reads those stacks' URLs from the `DEV_APP_URL`/`PROD_PREVIEW_APP_URL` repo variables, which must match each stack's `appUrl`. npm and Gradle downloads are cached too, to speed up the builds that do happen. To run them locally, install the dev-client build on an Android emulator and run `npm run test:e2e` in `mobile-app/` (see [its README](mobile-app/README.md)). It needs [Maestro](https://docs.maestro.dev/getting-started/installing-maestro) installed, and starts the API, MySQL, Metro and the emulator itself if they aren't already running. To run them the way CI does, on a release APK against a deployed stack, set `MOBILE_E2E_APP_URL` in `.env` to that stack's `appUrl` and run `npm run test:e2e:remote` instead.

Avoid regular expressions in `mobile-app/` app code: XO requires the `v` flag on them, and Hermes (React Native's JavaScript engine) rejects that flag when the app loads. Node-only config files such as `metro.config.js` don't run on Hermes, so they're exempt.

A physical phone can't reach `10.0.2.2`. Point `EXPO_PUBLIC_API_URL` at your machine's LAN IP, or at the ngrok tunnel with `LOCAL=false`.

---

## End-to-end tests (Playwright)

E2e tests (`e2e/*.spec.ts`) run against a **prod-mode simulation** of the app rather than the local dev containers or a real deployed environment: the existing `signalling-server-prod`/`web-server-prod`/`mysql-db` compose services, run with `NODE_ENV=production` and an isolated `test-db`, behind a local [Caddy](https://caddyserver.com/) reverse proxy that terminates TLS at `https://voneo.test`. Caddy forwards everything to the frontend, which proxies the API and WebSocket routes itself (`web-server/src/server.mjs`), as it does on Cloud Run. This lets the suite exercise real production-only behavior (`Secure` cookies, the `ALLOWED_ORIGIN` CORS/WS-origin allowlist) without needing a deployed GCP environment or incurring any cloud cost — see `e2e/compose.e2e.yaml` and `e2e/Caddyfile`.

**One-time local setup:** add a hosts file entry pointing `voneo.test` at `127.0.0.1`:

- macOS/Linux: add `127.0.0.1 voneo.test` to `/etc/hosts`
- Windows: add `127.0.0.1 voneo.test` to `C:\Windows\System32\drivers\etc\hosts` (as Administrator)

**Running the suite:**

```bash
npm run test:e2e
```

This brings up the e2e compose stack (building fresh images), runs Playwright, and tears the stack down afterwards regardless of outcome. Stop `npm run dev` first — the e2e stack publishes the same fixed host ports (`3000`, `8080`, `3306`, plus `443` for the Caddy proxy) and the two will collide.

Camera/microphone are faked via Chromium's `--use-fake-device-for-media-stream` flag (see `playwright.config.ts`), so no real hardware or OS permission prompts are needed. Test data is isolated per run: `e2e/global-setup.ts` truncates the `test-db` tables before the suite starts, and specs create their own users with unique emails rather than relying on any pre-seeded data.

**In CI:** `pr-dev.yml` and `pr-main.yml` run all their jobs on every PR, whatever files it changes, to catch regressions (there's no path filtering).

**Browser coverage:** only the `chromium` Playwright project is configured — no Firefox or WebKit. This is deliberate, for dev speed/simplicity, and because the fake-media-stream flags above are Chromium-specific.

**Media on the same network:** `e2e/media.spec.ts` checks that both participants actually receive each other's video. It also checks, from the peer connections' ICE stats, that media flows directly and not through a relay.

### NAT traversal suite (STUN/TURN)

```bash
npm run test:e2e:nat
```

This checks how calls behave for devices on the same network versus different networks, through the self-hosted coturn server. It runs on PRs into `main` (the `e2e-nat-traversal` job in `pr-main.yml`).

It layers `e2e/compose.nat.yaml` on top of the e2e stack. That file adds a `coturn` container using the same image and base config as the production VM. It also adds three containerised Chromium browsers, which the host's Playwright runner drives remotely over `playwright run-server`:

- two browsers on a simulated LAN, `lan-a`
- one browser on a separate one, `lan-b`

`lan-a` and `lan-b` devices can only reach each other through the TURN relay. The overlay enforces that itself, not through Docker. Docker's isolation between bridge networks varies by platform: Docker Desktop was found to route and NAT traffic between them, which let calls connect directly.

- Each browser has a firewall sidecar that drops traffic to and from the other LAN.
- IP masquerading is off on both LANs, so nothing gets rewritten past those rules. As a side effect the LANs have no internet access, so the browsers run your installed `playwright-core` from a mount instead of downloading it.

The two tests in `e2e/nat/nat-traversal.spec.ts` check:

- **Same network (`lan-a` ↔ `lan-a`):** the call connects directly over a `host`↔`host` candidate pair, even though TURN is available.
- **Different networks (`lan-a` ↔ `lan-b`):** both peers send media through their TURN allocations (`relay` local candidates), and video still plays on both sides.

This suite needs no `voneo.test` hosts entry and no local Playwright browsers, because the browsers run in containers. It uses the same host ports as `npm run test:e2e`, so don't run the two at the same time. In CI the coturn container differs from production in two ways: it doesn't block private IP ranges (the simulated LANs are private Docker networks), and it doesn't need an external IP mapping.

### Against a GCP deployment

PRs also run e2e tests against a real, short-lived GCP deployment of the PR. The deployment is created, tested, then always destroyed:

- **PRs into `dev`:** the `e2e-gcp-dev` job in `pr-dev.yml` uses the `dev` stack. It runs only the happy paths: the web one (`@happy-path` Playwright specs), and the mobile one (the Maestro `happy-path` flow, on an emulator with an APK built against the stack's `appUrl`). Both run on every PR, whatever it changes. The stack runs with `NODE_ENV=production`, so there are no seeded users: the job signs up the one the Maestro flow logs in as first.
- **PRs into `main`:** the `e2e-gcp-prod-preview` job in `pr-main.yml` uses `prod-preview`, which has prod's settings (TURN VM included) and deploys into prod's GCP project. It runs the full web e2e suite and then every Maestro flow (after signing up the user the flows log in as, as on `dev`). Real prod isn't touched until the PR merges.

The app is served from the frontend Cloud Run service's own `run.app` URL (the stack's `appUrl` output), which has real DNS and a Google-managed certificate, so no domain, hosts entry or certificate workaround is needed. You can open it on any device, including a phone. `scripts/gcp-e2e.mjs` passes it to Playwright as `E2E_BASE_URL`. To do the same from your machine, run these in `infra/`:

```bash
npm run deploy-test-destroy:dev   # deploy, test, and always destroy
npm run deploy:dev                # or one step at a time
npm run test:e2e:dev
npm run destroy:dev
```

The `prod-preview` equivalents end in `:prod-preview` instead. A run costs a few cents. None of this works until the GCP projects, Pulumi stacks and GitHub secrets exist: see [`infra/README.md`](infra/README.md), which also covers how the ephemeral stacks work.

---

## Gotchas & Experimentation

1. **Leaving a call requires an active WebSocket connection first** — `DELETE /call/:callID/leave` returns `400 "Call is not active"` until a participant has actually connected to the call's WebSocket server at least once (that's what flips `Call.activeCall` to `true` — see `call/utils/misc.js`). Joining via `PUT /call/:callID/join` alone isn't enough; the [Leave a call](web-socket-api/src/README.md#api-examples) curl example will 400 unless you connect a WebSocket client to the call first.
2. **In-memory calls** — Restarting the API clears all active calls and WebSocket servers. No persistence of web socket calls to persistent storage at current.
3. **TODO: per-call WebSocket ports** — call WebSocket servers used to each get a randomly assigned port (`setRandomPort()`) in production. This was dropped in favour of a single shared port (`3000`, path-routed by call ID) so the API stays deployable on Cloud Run, which only exposes one port per service; multiple simultaneous calls are already supported under this shared-port design, each isolated by its own `callID`-routed `WebSocketServer` instance. If a future deployment target supports multiple exposed ports and there's a need to isolate or independently scale calls at the process/connection level, consider re-adding per-call ports.
4. **TODO: try a smaller frontend runtime base image** — every stage of `web-server/src/Dockerfile.prod` uses `dhi.io/node:26-alpine-dev`, including the runtime stage. The `-dev` variant includes a shell and npm, which the running server doesn't need. Switching the runtime stage to the non-`-dev` `dhi.io/node:26-alpine` should make the image smaller (it's about 412 MB, most of it the `node_modules` that `astro` pulls in) and give it less attack surface. Check that `node server.mjs` still starts without a shell, then run the e2e suite.
