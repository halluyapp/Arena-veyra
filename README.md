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

## Native Android phone and Android TV

The native application lives in `apps/native/`. The web application above is
preserved; its HTML/CSS has not been replaced with React Native Web. Both clients
consume the same normalized `/api/veyra/*` contract. Native and legacy Capacitor
APKs use the same application ID and are alternatives, not two separate apps to
install side-by-side.

```bash
cd apps/native
npm ci
npm test
npm run typecheck
npm run export
npm run prebuild
# With JDK 17 and Android SDK available:
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64
```

Set `EXPO_PUBLIC_VEYRA_API_BASE_URL` to the deployed **HTTPS VEYRA API**, not the
provider. In Actions this comes from the `VEYRA_API_BASE_URL` repository variable.
No backend was restored in this phase, as requested. Missing configuration
produces an honest unavailable state; no sample titles or activation bypass are
included. Native standalone builds bundle JavaScript and do not require Metro
on the user's device. The release build currently uses the generated development
signing key: the artifact is a testing APK, not a Play Store release.

The TV-compatible React Native fork supports Android phone and TV in one APK.
`Platform.isTV` selects the activation gate and remote-focus interface. This does
not target Samsung Tizen, LG webOS, or Apple TV. Native screens cover catalog,
search, details, seasons/episodes, list/history, playback, downloads and settings;
visual parity with every existing web screen has not been device-verified.

### Native media and downloads

- `src/domain.ts` centralizes native CDN Referer, Origin and User-Agent headers.
- Playback uses native ExoPlayer through `react-native-video`, not a WebView.
- Caption files are fetched independently with media headers into temporary
  private cache; SRT and WebVTT are passed to the native player. A caption failure
  does not block video. Captions are not yet saved alongside offline downloads.
- Quality changes and playback retry request fresh URLs. Mobile Auto prefers
  480p, then 360p; TV Auto selects the highest returned quality.
- Downloads use native background transfers and app-private persistent files.
  Broad public storage permissions and backups are disabled. Completed-file
  notifications that open an external viewer are disabled.
- Progress is measured by the native transfer. Completion checks disk size,
  MP4 signature, and complete top-level `ftyp`/`moov`/`mdat` atom layout without
  loading the movie into JavaScript memory.
- A version-pinned downloader patch rejects inconsistent `Content-Range` before
  appending. `npm ci` applies it through `patch-package`.
- Resume uses the retained native task while its signed URL is known to be fresh.
  If URL expiry is unknown/expired, the API is called again and the transfer
  safely restarts; it does not append a different signed resource speculatively.
- Android can interrupt background work. Force-stop, device reboot, notification
  actions and OEM battery restrictions still need real-device validation. No
  uninterrupted-background guarantee is made.
- Web playback remains subject to browser header/CORS restrictions; native header
  support does not fix those restrictions. A controlled backend relay may be
  needed when that phase is implemented.

### Deferred activation backend contract

These are client requirements, **not implemented server endpoints**. All paths
are under `/api/veyra`. Success bodies may use the existing `{ data: ... }`
envelope.

- `POST /devices/activation` with `{ platform: 'android-tv' }` returns
  `{ deviceCode, userCode, verificationUriComplete, expiresIn, interval }`.
  `expiresIn` and `interval` are seconds. Verification URI must be HTTPS.
- `POST /devices/activation/status` with `{ deviceCode }` returns
  `{ status: 'pending' | 'slow_down' | 'denied' | 'expired' | 'approved',
  accessToken? }`.
- `GET /devices/session` with bearer authorization returns
  `{ authorized: true }` only for a valid, approved device session.
- `DELETE /devices/session` revokes the current session.

TV tokens use Android secure storage. Codes expire locally, polling backs off,
and activation requires a subsequent authenticated session check. The future
server must enforce authorization on protected routes, rate-limit pairing,
require signed-in phone approval, and never put a reusable bearer token in a QR.
The HTTPS phone approval page/account sign-in are deferred with the backend.

### Firebase

The supplied Firebase configurations register `Hallyu.app` and/or
`com.hallyu.app`, not `com.veyra.stream`. They are intentionally not installed or
committed. Register VEYRA's matching package before enabling FCM. Download
notifications are native local notifications and do not depend on Firebase.
Remote push and account authentication are not enabled in this phase.

### Verification boundary

The `Native Android phone and TV` workflow checks types, native domain tests,
Metro export, Android generation and a standalone APK build. The existing
`Android APK` workflow continues to validate/build the unchanged web/Capacitor
app. Neither workflow verifies Zarhosting, pairing approval, CDN playback,
background survival, offline playback on hardware, or screen-by-screen UI parity.
Those remain acceptance checks for a deployed backend and real phone/TV devices.
