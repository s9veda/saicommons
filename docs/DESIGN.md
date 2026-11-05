# saicommons design

## Goals and app policy

`saicommons` provides one D1-backed identity service and per-app memberships. A successful response contains a short-lived OTP exchange result and a 30-day HMAC bearer token. It avoids email enumeration for valid but ineligible sign-in requests.

| App (`app`) | Self-signup | Name at signup | Membership required for sign-in | Email brand |
|---|---:|---:|---:|---|
| `mantrajapam` | Yes | Yes | Yes | Sainam Japam |
| `bhajanstudio` | No | n/a | Yes; imported by an administrator | Sai Bhajan Studio |

Unknown app identifiers receive HTTP 400. A closed-app `signup` request is rejected. An ineligible `signin` request receives the same generic HTTP 200 body as an eligible request, and no OTP is generated or sent.

## Data model

- `accounts`: global identity (`id` UUID, normalized unique lower-case email, display name, timestamps).
- `memberships`: one account/app association, app role, and JSON `data`. Bhajan Studio-specific fields such as `is_admin`, `center_ids`, and `editor_for` live in `data`.
- `otp_codes`: active OTP digest only; the raw code is never persisted. OTPs expire after ten minutes, are single-use, and have at most five failed comparisons.
- `otp_request_log`: request timestamps retained separately from active OTP rows so that replacing an OTP does not defeat throttling (one request per 60 seconds and five per hour per email/app).

Emails are trimmed and lower-cased before lookup/storage. Account creation and membership creation/import are performed in D1 batches. Imported app membership upserts preserve a global account ID by email.

## API reference

All paths are under `/v1`; requests and responses are JSON. Error responses never include database or upstream error details.

### Request an OTP

`POST /v1/otp/request`

```json
{"app":"mantrajapam","email":"person@example.org","name":"Person","purpose":"signup"}
```

`purpose` is `signin` or `signup`. `name` is required for open-app signup. Both eligible and ineligible requests return the same generic success shape:

```json
{"ok":true,"message":"If this address is eligible, a sign-in code will be sent."}
```

For `bhajanstudio`, the email must already have a membership. For `mantrajapam` sign-in, a membership must already exist; signup creates the account and membership only after OTP verification.

### Verify OTP

`POST /v1/otp/verify`

```json
{"app":"mantrajapam","email":"person@example.org","code":"123456","name":"Person"}
```

Successful response (`name` is only needed when creating the open-app membership):

```json
{"user":{"id":"<uuid>","email":"person@example.org","name":"Person","app":"mantrajapam","role":"viewer","data":{}},"token":"<header>.<payload>.<signature>"}
```

A bad code is HTTP 400; the fifth failed attempt deletes the OTP and returns HTTP 429. Expired, absent, and consumed codes fail generically.

### Session and logout

- `GET /v1/session` with `Authorization: Bearer <token>` returns `{"user": ...}`. It verifies signature, expiry, app, and current membership.
- `POST /v1/logout` returns `{"ok":true}`. Tokens are stateless; clients must discard the bearer token. To force immediate revocation, remove that account's app membership (which also makes token validation fail).

### Review login

- `GET /v1/review_login/config?app=mantrajapam` returns `{"enabled":true}` when both per-app review variables are configured.
- `POST /v1/review_login` with `{"app":"mantrajapam","email":"review@example.org","password":"..."}` authenticates and issues a token. Review accounts/memberships are provisioned on successful use. When either variable is unset, the app's review login is disabled.

Variable names are `REVIEW_LOGIN_MANTRAJAPAM_EMAIL`, `REVIEW_LOGIN_MANTRAJAPAM_PASSWORD`, `REVIEW_LOGIN_BHAJANSTUDIO_EMAIL`, and `REVIEW_LOGIN_BHAJANSTUDIO_PASSWORD`.

### Member administration

All admin endpoints require `Authorization: Bearer <ADMIN_API_KEY>` and compare the key in constant time.

- `POST /v1/admin/members/import`

```json
{"app":"bhajanstudio","members":[{"email":"member@example.org","name":"Member","role":"editor","data":{"is_admin":false,"center_ids":[12],"editor_for":[12]}}]}
```

Returns `{"ok":true,"imported":1}`. Memberships are upserted; an omitted role defaults to `viewer` and omitted data to `{}`.
- `GET /v1/admin/members?app=bhajanstudio` returns `{"members":[...]}`.
- `DELETE /v1/admin/members` with `{"app":"bhajanstudio","email":"member@example.org"}` removes only that app membership, not the global account.

## Token format

The token is JWT-shaped but uses only its fixed `HS256` header and a server-verified HMAC-SHA256 signature. Claims are `{sub: accountId, app, iat, exp}` with a 30-day expiry. The secret is `SESSION_SECRET`; rotate it to invalidate all tokens. The Worker verifies the MAC via Web Crypto's constant-time verify operation and requires the app membership on every session check.

## Security and operations

- Use long, independent `SESSION_SECRET` and `ADMIN_API_KEY` values, stored as Wrangler secrets. Do not commit credentials, `.dev.vars`, or real D1 IDs.
- OTPs are generated with Web Crypto, stored as SHA-256 digests scoped to normalized email and app, compared without early exit, and deleted on success/lockout/replacement.
- Request throttles are per email/app. Consider adding edge/IP-level abuse controls for a public deployment.
- Brevo transport is HTTPS. Without `BREVO_API_KEY`, codes are printed only for local development; never run production without mail configuration.
- `ALLOWED_ORIGINS` is a comma-separated exact-origin allowlist. It defaults to no cross-origin browser access. Native clients generally send no `Origin` header.
- Deploy at `auth.s9veda.org` or configure an external route for `/auth/*`; Wrangler `routes` is intentionally omitted from this template.

## App integration and cutover

### sssmantrajapam

Update the app's auth client base URL to the deployed service and include `app: "mantrajapam"` in OTP request, verification, review-config, and review-login calls. Send the returned bearer token for `/v1/session`; replace the current Supabase-backed OTP/session flow after validating app-specific behavior. Preserve existing chants ownership during data migration (below).

### sssbhajanstudio

The current `saisongs` Express auth uses Oracle-backed users and cookie sessions. Suggested incremental migration:

1. Export current eligible users and use `/v1/admin/members/import` to create `bhajanstudio` accounts/memberships. Map `is_admin`, `center_ids`, and `editor_for` into membership `data`.
2. Initially keep Express session cookies; make Express request/verify OTP through `saicommons`, then translate the returned verified account ID into its existing server-side session. Do not expose Oracle/session secrets to the Worker.
3. Cut over clients and server authorization to bearer tokens when session and role behavior is tested; keep authorization based on membership roles/data.

### Existing Supabase users and chants mapping (outline only)

No existing rows are migrated by this project. A planned migration should export `users` and `chants`, normalize each user email exactly as the Worker does, import identities through the admin endpoint (or a reviewed one-off D1 import), and record a deterministic mapping from each legacy Supabase user ID to the resulting `accounts.id`. Update `chants.user_id` using that mapping in a separately reviewed migration. Resolve duplicate/invalid emails and orphaned chant owners before applying; validate row counts and ownership samples, and retain an auditable backup. Do not map by name alone, and do not execute this outline as part of Worker setup.
