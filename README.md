# saicommons

Shared registration/login API (email OTP), centers and admin user management for Sai apps. A TypeScript Cloudflare Worker backed by Turso (libSQL, via its HTTP API) with OTP emails sent through Brevo. See [docs/DESIGN.md](docs/DESIGN.md) for the endpoint reference and security notes.

## Local setup

```sh
npm install
cp .dev.vars.example .dev.vars        # replace values; keep untracked
turso db shell <db-name> < migrations/0001_init.sql
npx wrangler dev   # API on http://localhost:8787

# Shared Expo admin app (web, iOS and Android)
npm install --prefix src
cp src/.env.example src/.env  # set API URL and the client key for the target app
npm run web                    # allow the web origin, e.g. http://localhost:8081, in .dev.vars
```

The Worker is in `src/api/`, shared admin screens are in `src/web/`, and the native projects are in `src/ios/` and `src/android/`. Restart existing development servers after moving the project.

For native development, configure separate `admin-ios` and `admin-android` entries in the Worker's `API_KEYS` and use the matching client key when building each app. Expo inlines `EXPO_PUBLIC_*` values into the app; client keys are identifiers, not secrets. Never put `ADMIN_API_KEY` in an app. Set `EXPO_PUBLIC_API_URL` to an HTTPS endpoint reachable from the device; `localhost` on a phone refers to the phone.

Run `npm run ios` on macOS with Xcode and CocoaPods, or `npm run android` with the Android SDK and an emulator or device. Expo Go can also run the shared app with `npm start`. The generated identifiers `org.s9veda.saicommons.admin` are placeholders: choose identifiers and configure platform signing before distribution. The Android release build is intentionally not configured with a release signing key.

If Java is not on your path on macOS, Android Studio's bundled JDK can be used with `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"` before running the Android command.

The profile button opens the sign-in form or, when signed in, the account details and sign-out action. The web app stores its token in browser session storage; native apps use Expo SecureStore (Keychain/Keystore). Sign out deletes the local token, but the API has no server-side logout or refresh tokens.

For deployments set `SESSION_SECRET`, `API_KEYS`, `ADMIN_API_KEY`, `ALLOWED_ORIGINS`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and `BREVO_SENDER_NAME` with `wrangler secret put`. `API_KEYS` is a comma-separated list of `client=key` pairs, one per web/mobile app (see `.dev.vars.example`). Never commit secrets. With `BREVO_API_KEY` unset, OTP codes are logged to the Worker console (development only).

The Worker has no Wrangler `routes`; expose it at a hostname (e.g. `auth.s9veda.org`) or behind a proxy path that strips its prefix. Paths are rooted at `/v1`.

## Validation

```sh
npx tsc --noEmit
npm run typecheck:app
node scripts/smoke.mjs   # needs Node >= 22.5 (node:sqlite); no network
```
