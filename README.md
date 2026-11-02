# VEYRA

VEYRA is a React/Vite frontend packaged for Android with Capacitor, with
mobile and TV layouts.

## Provider cleanup

The streaming-provider backend, its development-server middleware, live probes,
provider documentation, and provider-dependent playback checks have been removed.
No replacement provider, mock API, or sample catalog has been added.

The frontend (`src/`, public assets, styles, and native Android source) is
unchanged. Its existing API-facing services remain, but this repository no
longer serves `/api/veyra/*`. Catalog, search, playback, and network downloads
need a separately implemented backend to work; building the frontend does not
verify those features. Existing provider identifiers in frontend models and
unit-test fixtures have not been rewritten as part of this cleanup.

## Run locally

```bash
npm ci
npm run dev
```

Vite binds to `0.0.0.0` and serves only the frontend. No provider credentials or
API deployment are required to build it.

## Project layout

- `src/` — screens, player, styles, client services, and frontend unit tests.
- `public/` — application assets, manifest, and service worker.
- `android/` — Capacitor Android project.
- `.github/workflows/android-apk.yml` — frontend validation and debug APK build.
- `10` and `UI/UX BUILD` — historical product/UI specifications, not runtime code.

## Checks

```bash
npm test
npm run build
npm run preview
```

The remaining unit tests cover client services, model guards, download state,
local library persistence, copy, and TV navigation. Their existing fixtures are
unit-test inputs only, not a runtime mock backend. There are no live-provider
checks.

## Android debug APK

Requirements: Node.js 22, JDK 21, Android SDK platform/build tools 35.

```bash
npm ci
npm run cap:sync
cd android && ./gradlew assembleDebug
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.
The Android APK workflow also builds and uploads this artifact. It no longer
requires a provider API URL. A successful APK build does not imply working
catalog or playback connectivity.
