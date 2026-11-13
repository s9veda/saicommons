# saicommons

Shared registration/login API, centers, and user management for Sai apps. The
API is a TypeScript Cloudflare Worker backed by Turso (libSQL); email OTPs are
sent through Brevo. The Expo Admin app runs on web, iOS, and Android.

- [Design and API reference](docs/DESIGN.md)
- [Reusable profile drawer](packages/drawer/README.md)

## Repository layout

- `src/api/`: Worker and Wrangler configuration.
- `database/`: database initialization SQL.
- `src/web/`: shared Admin app UI; `src/index.ts` is its Expo entry point.
- `src/ios/`, `src/android/`: native Admin app projects.
- `packages/drawer/`: shared profile, sign-in, and management components.
- `scripts/`: launch, build, and deployment scripts.
- `tests/`: API smoke test.

## Local setup

Prerequisites: Node.js and npm, a Turso database and CLI, and an API client key.
Native builds additionally need Xcode/CocoaPods on macOS or Android Studio and
the Android SDK. The smoke test needs Node.js 22.5 or later.

From the repository root:

```sh
npm install
npm install --prefix src
cp .dev.vars.example src/api/.dev.vars
cp src/.env.example src/.env
```

Edit `src/api/.dev.vars` with the Turso URL/token, a session secret, an admin
key, client keys, and allowed browser origins. For local OTP testing, leaving
`BREVO_API_KEY` empty logs codes to the Worker console instead of sending
email; never rely on that behavior in production. Set `EXPO_PUBLIC_API_URL`
and `EXPO_PUBLIC_API_KEY` in `src/.env` to the API URL and the matching
`admin-web` client key. Allow the exact web origin (including port), for
example `http://localhost:8081`, in `ALLOWED_ORIGINS`.

Initialize a **new** database, then start the Worker and web app in separate
terminals:

```sh
turso db shell YOUR_DATABASE < database/0001_init.sql
npx wrangler dev --config src/api/wrangler.jsonc  # normally http://localhost:8787
```

```sh
./scripts/launch-web.sh
```

For an existing database, see the migration precautions in the
[design](docs/DESIGN.md#data-turso). The Admin app only accepts administrator
accounts. Provision the first administrator through the server-to-server
admin API using `ADMIN_API_KEY`; do not put that key in the app.

For native development, add separate `admin-ios` and `admin-android` entries
to `API_KEYS` and configure each build with its matching client key. Set
`EXPO_PUBLIC_API_URL` to an address reachable from the emulator or device;
`localhost` on a phone refers to the phone. Use HTTPS for deployed services.
Expo inlines `EXPO_PUBLIC_*` values into the app, so client keys are
identifiers, not secrets. Never put `ADMIN_API_KEY` or other server secrets in
an app.

## Scripts

Paths below are relative to the repository root; the scripts also work when
invoked by absolute path from another working directory.

| Script | Purpose |
| --- | --- |
| `scripts/launch-web.sh` | Start the web development server |
| `scripts/launch-ios.sh` | Build and run the iOS app locally |
| `scripts/launch-android.sh` | Build and run the Android app locally |
| `scripts/build-web.sh` | Export web to `src/dist` |
| `scripts/build-ios.sh`, `scripts/build-android.sh` | Build with the EAS production profile |
| `scripts/deploy-web.sh` | Build and deploy to Cloudflare Pages project `saicommons-web` |
| `scripts/deploy-ios.sh`, `scripts/deploy-android.sh` | Submit a build with EAS |
| `scripts/deploy-api.sh` | Deploy the API Worker |

Arguments are forwarded to the underlying command; for example,
`./scripts/launch-web.sh --port 8082`. For web deployment, arguments go to
Wrangler after the build succeeds. `npm run web`, `npm run ios`, and
`npm run android` also run the app from `src/`; `npm start` starts Expo.
The native launch scripts build and run the native app, rather than launching
Expo Go.

EAS builds and submissions require an Expo account, project setup, platform
credentials, and `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_API_KEY` configured
for the build. The generated `org.s9veda.saicommons.admin` identifiers are
placeholders: choose identifiers and signing credentials before distribution.
The checked-in Android project has no release signing key configured. EAS
build/submit commands may download the latest EAS CLI through `npx`.

Web exports use the Expo environment in `src/.env` or the process environment.
Web deployment builds `src/dist` and publishes it to the `saicommons-web`
Cloudflare Pages project; it requires Wrangler authentication. API deployment
uses `src/api/wrangler.jsonc` and does not upload local `.dev.vars`. Neither
deployment script copies API secrets to Pages.

## App configuration

The admin icon source is `src/web/assets/admin-icon-source.png`. The Expo assets and checked-in iOS and Android launcher resources contain platform-sized variants; rebuild and reinstall the native apps after changing them.

If Java is not on your path on macOS, Android Studio's bundled JDK can be used with `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"` before running the Android command.

The profile button opens the sign-in form or, when signed in, account and center access details. Administrators can manage centers and users from the drawer. The web app stores its token in browser session storage; native apps use Expo SecureStore (Keychain/Keystore). Sign out deletes the local token, but the API has no server-side logout or refresh tokens.

For deployments set `SESSION_SECRET`, `API_KEYS`, `ADMIN_API_KEY`, `ALLOWED_ORIGINS`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and `BREVO_SENDER_NAME` with `wrangler secret put`. `API_KEYS` is a comma-separated list of `client=key` pairs, one per web/mobile app (see `.dev.vars.example`). Never commit secrets. With `BREVO_API_KEY` unset, OTP codes are logged to the Worker console (development only).

For example, run `npx wrangler secret put SESSION_SECRET --config src/api/wrangler.jsonc`
from the repository root and provide the value at the prompt. Repeat for the
other Worker secrets; the deployment script does not provision them.

The Worker has no Wrangler `routes`; expose it at a hostname (e.g. `auth.s9veda.org`) or behind a proxy path that strips its prefix. Paths are rooted at `/v1`.

## Validation

```sh
npm run typecheck
npm run typecheck:drawer
node --stack-size=8192 src/node_modules/typescript/bin/tsc --noEmit -p src/web/tsconfig.json
node --test scripts/scripts.test.mjs packages/drawer/src/*.test.mjs src/web/App.test.mjs src/web/src/*.test.mjs
npm run smoke
./scripts/build-web.sh
```

The app typecheck uses a larger Node stack because `npm run typecheck:app`
can overflow with the current TypeScript configuration. The smoke test
bundles the Worker and exercises it with in-memory SQLite and
mocked Turso/Brevo requests; it does not deploy or test live services.
