# Voneo mobile app

The Expo (React Native) Android app. See [How it's put together](#how-its-put-together) below for how it's built, how it talks to the signalling API, and how its tests run in CI.

## Commands

Run from this folder (`mobile-app/`).

| Command                   | What it does                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run open`            | Opens the app on an emulator for manual use. Boots the first emulator in Android Studio's Device Manager (or the one named in `VONEO_AVD`) if no device is connected, and leaves it running. Then starts Metro and opens the app, or just opens the app if Metro is already running. Doesn't start the API: run `npm run dev` from the repo root, with `LOCAL=true`, first |
| `npm run open:remote`     | The same, but the app talks to a deployed stack: `MOBILE_E2E_APP_URL` in the root `.env` (e.g. prod's `appUrl`), so no local API is needed. Starts Metro with that URL and a cleared cache; if Metro is already running, stop it first, as it serves the URL it was started with                                                                                           |
| `npm start`               | Starts Metro only (`expo start`). Add `--dev-client` to serve the dev-client build                                                                                                                                                                                                                                                                                         |
| `npm run android`         | Starts Metro and opens the app on a device that's already running                                                                                                                                                                                                                                                                                                          |
| `npm test`                | Unit and component tests in `tests/` (Jest and React Native Testing Library)                                                                                                                                                                                                                                                                                               |
| `npm run test:e2e`        | Maestro flows in `.maestro/` on an emulator (see below)                                                                                                                                                                                                                                                                                                                    |
| `npm run test:e2e:remote` | The same flows the way CI runs them: a release APK against a deployed stack (see below)                                                                                                                                                                                                                                                                                    |
| `npm run lint`            | XO with Prettier. `lint:fix` applies the fixes it can                                                                                                                                                                                                                                                                                                                      |

`open`, `open:remote` and `test:e2e` need the dev-client build installed on the emulator. Build it with `eas build --profile development --platform android` and install the APK. If EAS's queue is long, the `mobile-dev-client.yml` GitHub workflow builds the same thing on a runner: run `gh workflow run mobile-dev-client.yml`, download the `voneo-dev-client` artifact from the run, then `adb uninstall com.voneo.app` (it's signed with a different key from an EAS build) and `adb install app-debug.apk`. The dev client loads the app's JavaScript from Metro, so you only need a new build after changing native packages or native config in `app.json`.

### Emulator

Test on a low-end Android 16 phone, the same one CI emulates (`.github/actions/maestro-e2e`). Android 16 is the OS the app targets (`targetSdk` 36, Google Play's minimum), and 4 GB of RAM is Android 16 Go edition hardware. Create it once in Android Studio's Device Manager, or with the SDK command-line tools:

```bash
sdkmanager "system-images;android-36;google_apis;x86_64"
avdmanager create avd -n Low_End_API_36 -k "system-images;android-36;google_apis;x86_64" -d small_phone
```

On Windows the tools are `.bat` files, and `cmd` splits arguments at `;`. So put the package name in a file and pass `--package_file=<file>` to `sdkmanager`, and run `avdmanager` from PowerShell with the `-k` value quoted. Then set `hw.ramSize=4096` and `hw.cpu.ncore=2` in `~/.android/avd/Low_End_API_36.avd/config.ini`. `open` and `test:e2e` boot the first AVD, so either keep this as your only one or set `VONEO_AVD=Low_End_API_36`.

### Maestro flows (`npm run test:e2e`)

This needs [Maestro](https://docs.maestro.dev/getting-started/installing-maestro) installed. It:

- boots an emulator if no device is connected, as `open` does
- starts the signalling API and MySQL containers (`LOCAL=true`, `NODE_ENV=dev`, for the seeded users) and Metro, unless they're already running
- runs the flows against the dev client
- closes the emulator afterwards (a physical phone is left alone), stops the containers and Metro if it started them, and deletes the ~220 MB copy of the APK that each Maestro run leaves in the temp folder

To run one flow, pass it after `--`: `npm run test:e2e -- .maestro/create-call.yaml`.

Maestro's logs go in `maestro-output/debug/` and its screenshots and other test artifacts in `maestro-output/test/`, one timestamped folder per run. The folder is gitignored.

### Against a deployed stack, as CI does (`npm run test:e2e:remote`)

`test:e2e` runs the flows on the dev client against the local dev API. CI's GCP jobs instead run them on a release APK, with the JavaScript bundled in and no Metro, against a deployed stack's `appUrl`, whose frontend proxies the API. `test:e2e:remote` does the same on your emulator:

1. Deploy a stack if none is up (`npm run deploy:dev` in `infra/`), and set `MOBILE_E2E_APP_URL` in the root `.env` to its URL (`pulumi stack output appUrl --stack dev` in `infra/`). To use another stack, change the value, or set `MOBILE_E2E_APP_URL` in your shell, which takes precedence.
2. Run `npm run test:e2e:remote` from this folder. As `test:e2e` does, it boots an emulator if none is connected and closes it afterwards. It:
   - waits for the stack to serve the API, then signs up the user the flows log in as (deployed stacks run with `NODE_ENV=production`, so no users are seeded)
   - builds the release APK for that URL (`scripts/e2e-apk.mjs`: `expo prebuild --clean`, then Gradle), for the emulator's ABI only. The APK is kept in `maestro-output/e2e-apk/` and reused until the URL or the app's source changes. The first build takes several minutes. It needs the Android SDK and a JDK. Unless `ANDROID_HOME`/`JAVA_HOME` are set, it uses Android Studio's defaults.
   - backs up the installed app (normally the dev client) to `maestro-output/installed-app-backup/` and uninstalls it, because the two share a package name and are signed with different keys. It installs the release APK, runs the flows, then reinstalls the backup. If that fails, the backup stays in that folder.

It doesn't start the API, MySQL or Metro, and it doesn't deploy or destroy the stack. Pass one flow after `--`, as with `test:e2e`. `expo prebuild --clean` regenerates the gitignored `android/` folder.

## How it's put together

The app is an Expo (React Native) Android app. It talks to the signalling API directly, with no code shared with `web-server`, and uses `react-native-webrtc` for calls. Its signalling matches the web client's, so web and mobile users can be on the same call.

- `app.tsx` — shows `AuthScreen` while logged out and `CallScreen` once logged in. It uses plain state rather than Expo Router: there are only two screens, and Expo Router would need a new native build.
- `src/screens/` — `auth-screen.tsx` (login/register), `call-screen.tsx` (create or join a call), `in-call-view.tsx` (full-screen remote video, your video in a corner, mic/camera/chat/hang-up controls), `chat-sheet.tsx` (chat as a bottom sheet).
- `src/theme/theme.ts` and `src/components/` — the look shared with the web app: the palette from the root `colors.json`, Geist type scale, spacing and 48dp touch targets, and the `Button`, `IconButton`, `TextField`, `Tabs` and `Card` primitives. `metro.config.js` lets Metro read `colors.json` from outside `mobile-app/`.
- `src/lib/config.ts` — API base URL, from `EXPO_PUBLIC_API_URL`. The default, `http://10.0.2.2:3000`, is the Android emulator's alias for the host machine, direct to the API port. It suits the `LOCAL=true` dev stack. Expo inlines the variable when Metro starts, so restart Metro after changing it.
- `src/lib/call-url.ts` — builds a call's WebSocket URL from its `callID` (`ws://<host>/ws/:callID` for an `http` API URL, `wss://<host>/wss/:callID` for `https`), and validates call IDs.
- `src/lib/api.ts` / `src/lib/signalling.ts` — REST client (including ICE servers) and the WebSocket join handshake.
- `src/lib/call-session.ts` — the call's WebRTC signalling: the joiner offers to everyone already on the call, they answer, and ICE candidates are exchanged. Peers are injected, so it's tested with fakes.
- `src/lib/webrtc.ts` — the only module using `react-native-webrtc` directly: camera/mic capture and the real peer connections.
- `src/lib/use-call.ts` — the hook tying these together for the call screen.

### Running it against the dev stack

The app needs a development build, because Expo Go doesn't include `react-native-webrtc`'s native code. Build it once with `eas build --profile development --platform android` and install the APK on the emulator, or build it on a GitHub runner with the `mobile-dev-client.yml` workflow (see [Commands](#commands)). Rebuild only after adding native packages or changing native config in `app.json`, including the fonts embedded by the `expo-font` config plugin.

1. Set `LOCAL=true` in the root `.env` and run `npm run dev` from the repo root.
2. Start an Android emulator (Android Studio → Device Manager).
3. From this folder, run `npx expo start --dev-client` and press `a`.

Steps 2 and 3 can be replaced with `npm run open`. It boots an emulator if none is connected (the first in Device Manager, or the one named in `VONEO_AVD`) and leaves it running. It then starts Metro and opens the app. It doesn't start the API, so do step 1 yourself first. To use a deployed stack instead of a local API, e.g. prod, set `MOBILE_E2E_APP_URL` in the root `.env` to its `appUrl` and run `npm run open:remote`, skipping step 1.

`react-native-webrtc` asks for camera and microphone permission itself when a call starts.

### Tests

- `npm test` runs Jest (`jest-expo` preset) with [React Native Testing Library](https://callstack.github.io/react-native-testing-library/). Tests live in `tests/`: unit tests for `api.ts`, `call-url.ts` and `call-session.ts`, and component tests for the auth and call screens with the API, signalling and WebRTC modules mocked. These include accessibility checks (labelled fields, tab and switch states, button names). `mobile-ci.yml` runs them on PRs that touch `mobile-app/` or `colors.json`.
- [Maestro](https://maestro.mobile.dev/) flows in `.maestro/` cover logging in, creating a call and hanging up, and a failed login. In CI they run on an emulator with a release APK built on the runner, against the GCP deployments (see [Against a GCP deployment](../README.md#against-a-gcp-deployment) in the root README): PRs into `dev` run only the happy path (`create-call.yaml`, tagged `happy-path`) against the dev stack, and PRs into `main` run every flow against `prod-preview`. `mobile-e2e.yml` runs every flow when started manually (Actions tab, or `gh workflow run mobile-e2e.yml`): against a local API on the runner by default, or against a deployed stack with its `api_url` input set to that stack's `appUrl` (`gh workflow run mobile-e2e.yml -f api_url=<appUrl>`), after signing up the user the flows log in as. The APK build and emulator steps live in `.github/actions/maestro-e2e`, shared by all three. The built APK is cached per API URL, keyed on the app's source (not the Maestro flows), so it's only rebuilt when the app changes. `mobile-apk-cache.yml` builds it after every push to `dev` (dev stack) and `main` (`prod-preview`), because a PR can only restore caches from its own runs and its base branch. It reads those stacks' URLs from the `DEV_APP_URL`/`PROD_PREVIEW_APP_URL` repo variables, which must match each stack's `appUrl`. npm and Gradle downloads are cached too, to speed up the builds that do happen. To run them locally, install the dev-client build on an Android emulator and run `npm run test:e2e` (see [Maestro flows](#maestro-flows-npm-run-teste2e)). It needs [Maestro](https://docs.maestro.dev/getting-started/installing-maestro) installed, and starts the API, MySQL, Metro and the emulator itself if they aren't already running. To run them the way CI does, on a release APK against a deployed stack, set `MOBILE_E2E_APP_URL` in the root `.env` to that stack's `appUrl` and run `npm run test:e2e:remote` instead.

Avoid regular expressions in the app's code: XO requires the `v` flag on them, and Hermes (React Native's JavaScript engine) rejects that flag when the app loads. Node-only config files such as `metro.config.js` don't run on Hermes, so they're exempt.

A physical phone can't reach `10.0.2.2`. Point `EXPO_PUBLIC_API_URL` at your machine's LAN IP, or at the ngrok tunnel with `LOCAL=false`.
