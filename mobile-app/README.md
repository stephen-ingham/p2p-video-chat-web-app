# Voneo mobile app

The Expo (React Native) Android app. See the [root README](../README.md#mobile-app-expo-android) for how it's built, how it talks to the signalling API, and how its tests run in CI.

## Commands

Run from this folder (`mobile-app/`).

| Command            | What it does                                                                                                                                                                                                                                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run open`     | Opens the app on an emulator for manual use. Boots the first emulator in Android Studio's Device Manager (or the one named in `VONEO_AVD`) if no device is connected, and leaves it running. Then starts Metro and opens the app, or just opens the app if Metro is already running. Doesn't start the API: run `npm run dev` from the repo root, with `LOCAL=true`, first |
| `npm start`        | Starts Metro only (`expo start`). Add `--dev-client` to serve the dev-client build                                                                                                                                                                                                                                                                                         |
| `npm run android`  | Starts Metro and opens the app on a device that's already running                                                                                                                                                                                                                                                                                                          |
| `npm test`         | Unit and component tests in `tests/` (Jest and React Native Testing Library)                                                                                                                                                                                                                                                                                               |
| `npm run test:e2e` | Maestro flows in `.maestro/` on an emulator (see below)                                                                                                                                                                                                                                                                                                                    |
| `npm run lint`     | XO with Prettier. `lint:fix` applies the fixes it can                                                                                                                                                                                                                                                                                                                      |

`open` and `test:e2e` both need the dev-client build installed on the emulator. Build it with `eas build --profile development --platform android` and install the APK. If EAS's queue is long, the `mobile-dev-client.yml` GitHub workflow builds the same thing on a runner: run `gh workflow run mobile-dev-client.yml`, download the `voneo-dev-client` artifact from the run, then `adb uninstall com.voneo.app` (it's signed with a different key from an EAS build) and `adb install app-debug.apk`. The dev client loads the app's JavaScript from Metro, so you only need a new build after changing native packages or native config in `app.json`.

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
