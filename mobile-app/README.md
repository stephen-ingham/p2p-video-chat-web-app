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

`open` and `test:e2e` both need the dev-client build installed on the emulator. Build it with `eas build --profile development --platform android` and install the APK. The dev client loads the app's JavaScript from Metro, so you only need a new build after changing native packages or native config in `app.json`.

### Maestro flows (`npm run test:e2e`)

This needs [Maestro](https://docs.maestro.dev/getting-started/installing-maestro) installed. It:

- boots an emulator if no device is connected, as `open` does
- starts the signalling API and MySQL containers (`LOCAL=true`, `NODE_ENV=dev`, for the seeded users) and Metro, unless they're already running
- runs the flows against the dev client
- closes the emulator afterwards (a physical phone is left alone), stops the containers and Metro if it started them, and deletes the ~220 MB copy of the APK that each Maestro run leaves in the temp folder

To run one flow, pass it after `--`: `npm run test:e2e -- .maestro/create-call.yaml`.
