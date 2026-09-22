# Note: WORK IN PROGRESS

# Voneo - P2P Video Chat Web App

![Voneo](readme%20gif.gif)

[![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![WebSocket](https://img.shields.io/badge/WebSocket-010101?logo=websocket&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
[![WebRTC](https://img.shields.io/badge/WebRTC-333333?logo=webrtc&logoColor=white)](https://webrtc.org/)
[![MySQL](https://img.shields.io/badge/MySQL-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Sequelize](https://img.shields.io/badge/Sequelize-52B0E7?logo=sequelize&logoColor=white)](https://sequelize.org/)
[![JWT](https://img.shields.io/badge/JWT-black?logo=jsonwebtokens&logoColor=white)](https://jwt.io/)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![Astro](https://img.shields.io/badge/Astro-FF5D01?logo=astro&logoColor=white)](https://astro.build/)
[![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![shadcn/ui](https://img.shields.io/badge/shadcn/ui-000000?logo=shadcnui&logoColor=white)](https://ui.shadcn.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Google Cloud](https://img.shields.io/badge/Google_Cloud-4285F4?logo=googlecloud&logoColor=white)](https://cloud.google.com/)
[![XO](https://img.shields.io/badge/XO-5ED9C7?logo=xo&logoColor=black)](https://github.com/xojs/xo)
[![Prettier](https://img.shields.io/badge/Prettier-F7B93E?logo=prettier&logoColor=black)](https://prettier.io/)
[![Playwright](https://img.shields.io/badge/Playwright-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/)
[![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![Supertest](https://img.shields.io/badge/Supertest-07B203?logo=&logoColor=white)](https://github.com/visionmedia/supertest)
[![Testing Library](https://img.shields.io/badge/Testing_Library-E33332?logo=testinglibrary&logoColor=white)](https://testing-library.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Pulumi](https://img.shields.io/badge/Pulumi-8A3391?logo=pulumi&logoColor=white)](https://www.pulumi.com/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![ngrok](https://img.shields.io/badge/ngrok-1F232C?style=flat&logo=ngrok&logoColor=white)](https://ngrok.com/)

Voneo is a peer-to-peer video chat application built with an Astro/React frontend and a Node.js signalling stack. Users authenticate then create or join calls through an Express.js API, which provisions per-call WebSocket servers for session coordination. WebRTC handles media between peers once signalling completes.

## Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Local Setup](#local-setup)
- [Signalling Server (Express.js API)](#signalling-server-expressjs-api)
  - [API Routes](#api-routes)
  - [Authentication](#authentication)
  - [WebSocket Signalling](#websocket-signalling-per-call)
  - [API Examples](#api-examples)
  - [Environment Variables](#environment-variables)
- [Database Structure & Data Models](#database-structure--data-models)
- [Frontend (Astro + React)](#frontend-astro--react)
- [End-to-end tests (Playwright)](#end-to-end-tests-playwright)
- [Gotchas & Experimentation](#gotchas--experimentation)

## Overview

This project demonstrates a classic WebRTC architecture: an HTTP API and WebSocket layer for **signalling** (call creation, join/leave, SDP offers, chat), and the browser for **media** (camera/microphone via `getUserMedia`, peer connections via `RTCPeerConnection`).

Typical flow:

1. A user opens the app, authenticates (login or register), then creates a call or joins one with a call ID.
2. The Express API spins up a dedicated WebSocket server for that call and returns its URL.
3. The client connects to that WebSocket server and exchanges signalling messages (participants, offers, chat).
4. WebRTC negotiation runs in the browser (`rtcUtils.ts`) to establish P2P video/audio where implemented.

## Project Structure

<details>
<summary>Expand file tree</summary>

```
video-chat-application/
├── web-socket-api/              # Express.js signalling API + per-call WebSocket servers
│   ├── src/
│   │   ├── app.js               # API entry point (port 3000 by default)
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
│       ├── README.md            # Frontend-specific overview
│       ├── CLAUDE.md            # Astro dev-server guidance for Claude Code
│       ├── AGENTS.md            # Astro dev-server guidance for other coding agents
│       ├── Dockerfile.prod      # Production Docker image — serving the built Astro SSR app
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
│           │   ├── use-token-worker.ts # Hook — module-level singleton Worker
│           │   └── utils.ts     # shadcn cn() class utility
│           ├── styles/
│           │   └── global.css   # Tailwind v4 + shadcn CSS variable theme
│           └── middleware.ts    # CSP header (nonce-based, skipped in dev mode)
├── infra/                       # Pulumi (TypeScript) IaC — provisions GCP resources (Cloud Run service, Cloud SQL instance, Secret Manager secrets) for production deployments
├── scripts/                     # OS-specific scripts backing root npm run commands (setup, nuke, dev, halt-dev)
│   ├── dispatch.mjs             # Detects the host OS and runs the matching .ps1/.sh script
│   ├── setup.sh / setup.ps1
│   ├── nuke.sh / nuke.ps1
│   ├── dev.sh / dev.ps1
│   └── halt-dev.sh / halt-dev.ps1
├── e2e/                         # End-to-end tests (Playwright)
├── .github/workflows/           # CI/CD workflows
├── .husky/                      # Git hooks
├── .env.example                 # Example environment variables for local setup
├── .prettierrc                  # Prettier configuration
├── package.json                 # Root scripts to run both servers
├── playwright.config.ts         # Playwright configuration
└── ngrok.example.yml            # Ngrok tunnel config
```

</details>

| Component                             | Role                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Express.js API** (`web-socket-api`) | REST signalling: auth, users, call lifecycle; creates in-memory WebSocket servers per call |
| **Astro frontend** (`web-server`)     | SSR Astro app with React components, Tailwind CSS, and shadcn/ui; port **4321** in dev     |


## Local Setup

### Prerequisites

- [Docker](https://docs.docker.com/desktop/setup/install/) (v28+)
- [Node.js](https://nodejs.org/) (LTS recommended)
- [Ngrok](https://ngrok.com/download/) 
- [Git](https://git-scm.com/install/)
- A machine with camera/microphone access for testing WebRTC

### 1. Clone repo, install npm deps & build dev docker images

```bash
# Clones the repo
git clone https://github.com/cyprste2717218/p2p-video-chat-web-app

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
npm run tunnel
```

### 6. Navigate to the UI

If the docker container setup went well then the frontend should be accessible at the your Ngrok tunnel URL in the browser and ready for use!:

For example:

App URL: **https://horizon-velvet-symphony.ngrok-free.dev/**


To spin down the dev containers smoothly use the following command:

```bash
npm run halt-dev
```

#### Handling setup errors:

If something goes wrong during setup, you can run `npm run nuke` to delete and re-setup all npm dependencies, cache, docker dev images/volumes and containers. Like `npm run setup`, it auto-detects your OS and runs the matching `scripts/nuke.ps1` or `scripts/nuke.sh`:

```bash
npm run nuke
```

### Alternative Setup: using localhost directly (no Ngrok)

Instead of tunnelling through Ngrok (steps 2 and 5 above), you can run the app directly against `localhost` by setting `LOCAL=true` in your `.env`. This is quicker to get going but comes with major limitations — most notably you won't be able to reach the app from any device other than the machine running the containers. See [Using `LOCAL` instead of an Ngrok tunnel](#using-local-instead-of-an-ngrok-tunnel) in the Environment Variables section for full details before choosing this route.

---

## Signalling Server (Express.js API)

**Base URL:** `http://localhost:3000` (or the host/port configured in `web-socket-api/app.js`)

**Database:** MySQL at `http://localhost:3306` (created on first run via Sequelize `sync()`, with sequelize seeder function adding data for test users described below)
<br><br>
<i>Note:</i> 'Sequelize' seeder function only runs when `NODE_ENV`=`dev`, for development convenience
### API Routes

#### Auth (`/auth`)


| Method | Path      | Auth | Request body                                                                          | Success response                                                                       |
| ------ | --------- | ---- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `POST` | `/auth/signup` | No   | `{ "username": string (min 3), "email": string (email), "password": string (min 6) }` | `201` — `{ "success": true, "data": {"message": "Succesful sign up"}}` |
| `POST` | `/auth/login`  | No   | `{ "email": string (email), "password": string (min 6) }`                             | `200` — `{ "success": true, "data": { "accessToken": "<jwt>"}}`                        |
| `POST` | `/auth/logout` | Yes  | —                                                                                     | `200` — `{ "success": true, "data": {"message": "Logged out succesfully"}}`           |
| `POST` | `/auth/refresh` | Yes | —                                                                                     | `200` — `{ "success": true}`                                                           |


**Signup errors:** 

- `400` — invalid body: `{ "success": "false", "data": { "message": "Invalid credentials"}}`
- `500` — server error: `{ "success": false, "data": { "message": "Server error" } }`

**Login errors:**

- `400` — invalid body: `{ "success": "false", "data": { "message": "Invalid credentials" }}`
- `500` — server error: `{ "success": false, "data": { "message": "Server error" } }`

**Logout errors:**
- `500` — server error: `{ "success": "false", "data": { "message": "Server error" } }`

**Refresh errors:**
- `401` — invalid/expired refresh token: `{ "success": "false", "data": { "message": "Invalid or expired refresh token" }}`
- `500` — server error: `{ "success": "false", "data": { "message": "Server error" } }`

#### Calls (`/call`)


| Method | Path                  | Auth | Request                                                 | Success response                                                                     |
| ------ | --------------------- | ---- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `POST` | `/call/create`        | Yes  | —                         | `201` — `{ "success": true, "data": { "callID": "<uuid>", "callURL": "wss://..." } }` |
| `PUT`  | `/call/:callID/join`  | Yes  | Params: `callID` (UUID) | `200` — `{ "success": true, "data": { "callURL": "wss://..." }}`                     |
| `DELETE`  | `/call/:callID/leave` | Yes  | Params: `callID` (UUID)                                               | `200` — `{ "success": true, "data": { "message": "Succesfully left call" }}`                                                                     |
| `POST`  | `/call/:callID/messages` | Yes  | Params: `callID` (UUID)                                               | `201` — `{ "success": true, "data": { "message": "Message sent to all call participants succesfully" }}`   


**Call errors (examples):**

- `400` — invalid body/params: `{ "success": false, "error": "Invalid input", "details": [...] }`
- `404` — unknown call: `{ "success": false, "error": "Call ID not present" }`
- `500` — server error: `{ "success": false, "error": "<message>" }`

Creating a call also starts a **WebSocket server** (sharing the app's single port, routed by call ID) and stores session state in an in-memory `Map` (`callId` → `{ wsURL, participants, pendingParticipants }`).

### Authentication

Protected routes expect a JWT in the `Authorization` header:

```
Authorization: Bearer <token>
```

Tokens are issued on successful **login** (`POST /auth/login`). Secrets for creating access and refresh token JWTs is provided via `.env`, expirys for both are defined in `common/middlewares/tokens.js`.

### WebSocket signalling (per call)

After `create` or `join`, clients connect to `callURL` and send JSON messages, for example:


| Client → server `type` | Purpose                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `newParticipantOnCall` | Announce join; server replies with participants / notifications |
| `chatMessage`          | Broadcast chat                                                  |
| `offer`                | Relay WebRTC offer to a named recipient                         |



| Server → client `type`                   | Purpose                     |
| ---------------------------------------- | --------------------------- |
| `receivedNewParticipantNotif`            | Someone joined              |
| `responseCurrentCallParticipants`        | List of peers to connect to |
| `offer`                                  | Forwarded SDP offer         |
| `chatMessage` / `receivedNewChatMessage` | Chat payloads               |


### API examples

For development (when `NODE_ENV` is `dev`in `.env`) the following test users are seeded via sequelize for testing when the `signalling_server_prod` service container starts:

```json                                    
{
  username: john2739
  email: john.smith@gmail.com 
  password: ExamplePassword123
}
```
```json
{
  username: sam8282
  email: sam.clarence@gmail.com 
  password: ExamplePassword456
}
```

**Register a user**

```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@example.com","password":"secret12"}'
```

**Login**

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"secret12"}'
```

**Create a call**

```bash
curl -X POST http://localhost:3000/call/create \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
```

**Join an existing call**

```bash
curl -X POST http://localhost:3000/call/a1b2c3d4-e5f6-7890-abcd-ef1234567890/join \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
```

**Leave a call**

```bash
curl -X POST http://localhost:3000/call/a1b2c3d4-e5f6-7890-abcd-ef1234567890/leave \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
```

For a machine-readable spec, see `web-socket-api/src/openapi.yaml` (some paths/responses may not match runtime behavior yet).


### Environment Variables

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
```

This should be defined in the root directory in order for both the Astro frontend and Express.js/WebSockets backend to access these variables.
`NODE_ENV` can be set to either `dev` or `production`.

A `.env.example` file has been defined using these defaults for local testing. For production usage, ensure to set your own.

#### Using `LOCAL` instead of an Ngrok tunnel

`LOCAL` can be set to `true` or `false`, and is only consulted when `NODE_ENV` is `dev`. Setting `LOCAL=true` tells the frontend and signalling server that you're accessing everything directly via `localhost` rather than through an Ngrok tunnel, and switches over the CORS/WebSocket origin checks, Astro's allowed hosts, and the WebSocket upgrade path (`/ws/:callID` instead of `/wss/:callID`) accordingly.

If you set `LOCAL=true`, you must leave `NGROK_HOST` with no value in your `.env` — having both set at once leads to the wrong host/allowed-origins configuration being used and will prevent correct deployment.

Bear in mind that running this way restricts your ability to test with anything other than the machine you're developing on: the app will only be reachable at `http://localhost:4321`, so you won't be able to test from another device (e.g. a phone on the same network, or a remote peer) unless you expose your local server to your LAN or the wider internet by some other means. That isn't covered here, since this README only documents the Ngrok tunnel approach.

#### Runtime changes when `NODE_ENV=production`

- **Refresh Token CookieL:** Setting `production` ensures the refresh token cookie can only be sent over secure `HTTPS` connections (sets `Secure` property to `true`).
- **CORS:** the API checks `Origin` against a single `ALLOWED_ORIGIN` env var in both dev and production (dev also accepts `LOCAL`/`NGROK_HOST`-derived origins) — `ALLOWED_ORIGIN` must be set to the deployed frontend domain before a production deployment will accept any cross-origin request (`web-socket-api/src/app.js`).
- **WebSocket server port:** every call's WebSocket server shares the app's single listening port (`3000`) in both dev and production — there is no per-call port. This is a deliberate constraint so the API stays deployable on Cloud Run, which only exposes one port per service; see the TODO in [Gotchas & Experimentation](#gotchas--experimentation) below.
- **WebSocket URL construction:** `constructURI` returns `wss://<ALLOWED_ORIGIN>/wss/:callID` in production — same path shape as the dev-mode `/wss/:callID` (or `/ws/:callID` when `LOCAL=true`) path, just a different scheme/host (`web-socket-api/src/call/utils/misc.js`).
- **WebSocket origin verification:** `verifyClient` rejects any WebSocket upgrade whose `Origin` header doesn't match `ALLOWED_ORIGIN` (`web-socket-api/src/call/utils/misc.js`).

---

## Database Structure & Data Models

Persistent data (users, calls, and each user's participation record on a call) is stored in MySQL via Sequelize models defined in `web-socket-api/src/common/models/`. Note that **live signalling state** (the in-memory `Map` of connected WebSocket clients in `session-store.js`) is separate from this and is not persisted - see [Known incomplete areas](#gotchas--experimentation).

### Entity-relationship diagram

```mermaid
erDiagram
    USER ||--o{ CALL_PARTICIPANTS : "joins via"
    CALL ||--o{ CALL_PARTICIPANTS : "has"
    USER ||--o| REFRESH_TOKEN : "has"

    USER {
        string email PK
        string username
        string password
    }

    CALL {
        uuid callID PK
        string callURL
        int totalDurationSecs
        boolean activeCall
        datetime startedAt
        datetime finishedAt
    }

    CALL_PARTICIPANTS {
        string UserEmail FK
        uuid CallCallID FK
        string status "pending or active"
    }

    REFRESH_TOKEN {
        string tokenHash PK
        string jti
        datetime expiresAt
        datetime revokedAt
        string replacedBy
        datetime createdAt
        string ip
        string userAgent
        string userEmail FK
    }
```

### Model relationships

- `User` and `Call` share a **many-to-many** relationship through the `CallParticipants` join table, which auto-joins from each side's primary key: `UserEmail` (→ `User.email`) and `CallCallID` (→ `Call.callID`) - both are queried directly elsewhere in the codebase (e.g. `web-socket-api/src/call/controller.js`, `call/utils/misc.js`). The table also carries its own `status` column (`pending` or `active`) tracking each user's participation state on a given call.
- `User` and `RefreshToken` share a **one-to-one** relationship; the foreign key lives on `RefreshToken`.
- `User.email` is the primary key - there is no separate numeric user ID.
- All models use `{timestamps: false}`, so Sequelize's automatic `createdAt`/`updatedAt` columns are disabled; models track their own date fields explicitly where needed (e.g. `Call.startedAt`/`finishedAt`, `RefreshToken.createdAt`/`expiresAt`).

Source of truth for these models: `web-socket-api/src/common/models/user.js`, `call.js`, `call-participants.js`, `refresh-token.js`, and `index.js` (association definitions and dev-only seed data).

---

## Frontend (Astro + React)

**Framework:** Astro (SSR via `@astrojs/node`), accessed via Ngrok tunnel (e.g. `https://horizon-velvet-symphony.ngrok-free.dev/`) request forwarding to docker container spun up from image `web-server-dev:1.0.0`. Paths below are relative to `web-server/src/` (the Astro source tree itself lives one level further down, at `web-server/src/src/`).

**Entry:** `src/pages/index.astro` imports global CSS and renders `<App client:load />`.

### `useTokenWorker.ts`

Hook that wraps the `token-worker.js` Web Worker. The Worker instance is a **module-level singleton** so all components share the same instance and the token stored after login is available to subsequent calls. Exposes: `login`, `register`, `logout`, `createCall`, `joinCall`.

### `token-worker.js`

Plain JS Web Worker served from `public/`. Owns the `TokenService` class which holds the JWT access token in a private field. Handles all `fetch` calls to the Express API so the token never touches the main thread.

### CSP middleware (`src/middleware.ts`)

Sets a nonce-based `Content-Security-Policy` header on every response in production. Skipped in dev mode to avoid blocking Vite's HMR and dev toolbar scripts. Directives cover `script-src`, `worker-src`, `connect-src` (API + WebSocket), `media-src`, `style-src`, `img-src`, `object-src`, and `base-uri`.

### Dockerfiles

There are two dockerfiles for the frontend in `web-server/src/`:

- `Dockerfile.dev`:

Created for local development and syncs local file changes into the container automatically.

- `Dockerfile.prod`:

Produces a production-optimised image (`europe-west2-docker.pkg.dev/signalling-api/voneo/voneo-frontend:1.0.0`).

This image is used in GCP deployments - it is pushed to Artifact Registry and referenced by the Cloud Run service provisioned via the Pulumi stack in `infra/`.

---

## End-to-end tests (Playwright)

E2e tests (`e2e/*.spec.ts`) run against a **prod-mode simulation** of the app rather than the local dev containers or a real deployed environment: the existing `signalling-server-prod`/`web-server-prod`/`mysql-db` compose services, run with `NODE_ENV=production` and an isolated `test-db`, behind a local [Caddy](https://caddyserver.com/) reverse proxy that terminates TLS at `https://voneo.test`. This lets the suite exercise real production-only behavior (`Secure` cookies, the `ALLOWED_ORIGIN` CORS/WS-origin allowlist) without needing a deployed GCP environment or incurring any cloud cost — see `e2e/compose.e2e.yaml` and `e2e/Caddyfile`.

**One-time local setup:** add a hosts file entry pointing `voneo.test` at `127.0.0.1`:
- macOS/Linux: add `127.0.0.1 voneo.test` to `/etc/hosts`
- Windows: add `127.0.0.1 voneo.test` to `C:\Windows\System32\drivers\etc\hosts` (as Administrator)

**Running the suite:**

```bash
npm run test:e2e
```

This brings up the e2e compose stack (building fresh images), runs Playwright, and tears the stack down afterwards regardless of outcome. Stop `npm run dev` first — the e2e stack publishes the same fixed host ports (`3000`, `8080`, `3306`, plus `443` for the Caddy proxy) and the two will collide.

Camera/microphone are faked via Chromium's `--use-fake-device-for-media-stream` flag (see `playwright.config.ts`), so no real hardware or OS permission prompts are needed. Test data is isolated per run: `e2e/global-setup.ts` truncates the `test-db` tables before the suite starts, and specs create their own users with unique emails rather than relying on any pre-seeded data.

**Browser coverage:** only the `chromium` Playwright project is configured — no Firefox or WebKit. This is deliberate, for dev speed/simplicity, and because the fake-media-stream flags above are Chromium-specific.

---

## Gotchas & Experimentation

1. **Leaving a call requires an active WebSocket connection first** — `DELETE /call/:callID/leave` returns `400 "Call is not active"` until a participant has actually connected to the call's WebSocket server at least once (that's what flips `Call.activeCall` to `true` — see `call/utils/misc.js`). Joining via `PUT /call/:callID/join` alone isn't enough; the [Leave a call](#api-examples) curl example below will 400 unless you connect a WebSocket client to the call first.
2. **In-memory calls** — Restarting the API clears all active calls and WebSocket servers. No persistence of web socket calls to persistent storage at current.
3. **TODO: per-call WebSocket ports** — call WebSocket servers used to each get a randomly assigned port (`setRandomPort()`) in production. This was dropped in favour of a single shared port (`3000`, path-routed by call ID) so the API stays deployable on Cloud Run, which only exposes one port per service; multiple simultaneous calls are already supported under this shared-port design, each isolated by its own `callID`-routed `WebSocketServer` instance. If a future deployment target supports multiple exposed ports and there's a need to isolate or independently scale calls at the process/connection level, consider re-adding per-call ports.

