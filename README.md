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

If the web app says it cannot reach the server, check the browser console
and Network tab. A CORS preflight rejected with 403 means the exact browser
origin is not in the API Worker's `ALLOWED_ORIGINS`. Expo may choose another
port when 8081 is occupied, so add the origin shown in the address bar (for
example `http://localhost:8082`); `localhost` and `127.0.0.1` are different
origins. For a deployed Worker, update its `ALLOWED_ORIGINS` secret, retaining
all existing origins. Updating the local `.dev.vars` does not change a remote
Worker. A network failure can also mean the API URL is incorrect or the
server is unavailable.

Initialize a **new** database, then start the Worker and web app in separate
terminals:

```sh
turso db shell YOUR_DATABASE < database/schema.sql
npx wrangler dev --config src/api/wrangler.jsonc  # normally http://localhost:8787
```

For an existing database, do not apply the fresh schema directly; use the
preflight and upgrade procedure in the [design](docs/DESIGN.md#upgrade-and-preflight).
The preflight script reads `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` from the
process environment; it does not read `.dev.vars`.

```sh
./scripts/launch-web.sh
```

The Admin app accepts administrators and center editors. Provision the first
administrator through the server-to-server
admin API using `ADMIN_API_KEY`; do not put that key in the app.

For native development, add separate `admin-ios` and `admin-android` entries
to `API_KEYS` and configure each build with its matching client key. Set
`EXPO_PUBLIC_API_URL` to an address reachable from the emulator or device;
`localhost` on a phone refers to the phone. Use HTTPS for deployed services.
Expo inlines `EXPO_PUBLIC_*` values into the app, so client keys are
identifiers, not secrets. Never put `ADMIN_API_KEY` or other server secrets in
an app.

## Environment variables

The Worker reads local values from `src/api/.dev.vars` (copied from
`.dev.vars.example`). Deployed Workers use separately configured Wrangler
secrets. Never commit actual secrets.

| Worker variable | Purpose |
| --- | --- |
| `SESSION_SECRET` | Required long random secret for signing sessions and hashing OTPs. Changing it invalidates existing sessions and outstanding OTPs. |
| `API_KEYS` | Comma-separated `client=key` pairs for app clients. Use a distinct key for each client; clients send the key value in `X-API-Key`. Without a valid entry, client requests are rejected. |
| `ADMIN_API_KEY` | Server-to-server secret for administrative operations. Keep it separate from `SESSION_SECRET` and out of apps. |
| `ALLOWED_ORIGINS` | Comma-separated exact browser origins, including scheme and port. Empty means requests with an `Origin` are rejected; requests without one are not restricted by this setting. |
| `TURSO_DATABASE_URL` | Required Turso database URL, for example `libsql://...`. |
| `TURSO_AUTH_TOKEN` | Required Turso authentication token; scope it to the database. |
| `BREVO_API_KEY` | Brevo email API key. If empty, OTPs are logged instead of emailed, including in production; always configure it for production. |
| `BREVO_SENDER_EMAIL` | Sender email; use a sender verified with Brevo. Defaults to `noreply@example.org` when unset. |
| `BREVO_SENDER_NAME` | Email sender name and brand; defaults to `Sai Commons` when unset. |

The standard launch/build scripts use the Expo project in `src/` and its
`src/.env` file. `src/web/.env.example` is for running Expo directly with
`src/web/` as the project directory, not for the standard scripts.

| Expo variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | API base URL without `/v1`. It must be reachable from the device; native requires a URL. Empty on web uses the current origin. Use HTTPS for deployed services. |
| `EXPO_PUBLIC_API_KEY` | Key **value** from the matching Worker's `API_KEYS` entry, such as `admin-web`; required for requests. Use the appropriate key for each platform. |

Expo embeds `EXPO_PUBLIC_*` values in the app, so they are not secrets. Never
put Worker secrets, including `ADMIN_API_KEY`, in these files.

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
| `scripts/database-preflight.mjs` | Read-only integrity checks; with `--apply`, atomically install the user-integrity migration |

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

The profile button opens the sign-in form or, when signed in, account and center access details. Administrators can manage centers and users from the drawer; editors can manage users within their editor centers. The web app stores its token in browser session storage; native apps use Expo SecureStore (Keychain/Keystore). Sign out deletes the local token; managers can also revoke a user's sessions when editing the user.

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
node --test tests/database-preflight.test.mjs
npm run smoke
./scripts/build-web.sh
```

The app typecheck uses a larger Node stack because `npm run typecheck:app`
can overflow with the current TypeScript configuration. The smoke test
bundles the Worker and exercises it with in-memory SQLite and
mocked Turso/Brevo requests; it does not deploy or test live services.
