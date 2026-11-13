# saicommons design

## API

Request bodies are JSON. Client endpoints require `X-API-Key` (a per-app
client key); admin endpoints also support server-to-server `X-Admin-Key`
without a client key. Errors return `{"error": "..."}`, sometimes with
additional details.

### Registration and login

| Endpoint | Body | Result |
|---|---|---|
| `POST /v1/register` | `email`, `name`, `associated_centers` (exactly one existing center) | Sends an OTP; the user is created only after verification |
| `POST /v1/register-name` | `name`, `associated_centers` (exactly one existing center) | Immediately creates a user with no email and returns `{"user": {...}, "token": "..."}` (201), without email verification |
| `POST /v1/login` | `email` | Sends an OTP if the user exists |
| `POST /v1/verify-otp` | `email`, `otp_code` (6 digits) | `{"user": {...}, "token": "..."}` |
| `GET /v1/session` | `Authorization: Bearer <token>` | `{"user": {...}}` |

`register` and `login` return the same generic `{"ok":true,"message":...}` whether or not the account exists, so they do not reveal registered emails. Registering an existing email sends a code but never overwrites the stored profile or centers. Failure to send a register email returns 503. There is no logout endpoint: clients discard their tokens; deleting a user or incrementing their session version revokes them.

User objects: `id`, `email` (nullable), `name`, `gender`, `associated_centers`, `editor_for`, `is_admin`, and a derived `role`. Self-registration creates a viewer and rejects role fields and pair names.

**Trust boundary:** client keys are embedded in apps and are not authentication.
Name-only registration does not use the OTP request throttle. Do not treat
name-only users as verified identities. Name-only accounts have no email OTP
login path; their tokens cannot authorize management. Management requires an
OTP-authenticated session. Unrevoked legacy tokens remain valid for viewer
sessions, but privileged users must sign in again with OTP.

### Centers

Modeled on saisongs' `centers` (name unique case-insensitively, `badge_text_color` hex, audit columns).

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /v1/centers`, `GET /v1/centers/:id` | client key | Center: `id`, `name`, `badge_text_color`, `editor_ids` (user ids), `member_count`, audit fields. Public so apps can show a center picker at registration |
| `POST /v1/centers` | admin | `name` (req), `badge_text_color` (default `#000000`), `editor_ids` (opt). 409 on duplicate name |
| `PUT /v1/centers/:id` | admin | Same body; `editor_ids`, when present, replaces the editor set (removed editors remain viewers) |
| `DELETE /v1/centers/:id` | admin | 409 with the list of associated users while any exist |

### Admin users

| Endpoint | Body | Result |
|---|---|---|
| `POST /v1/admin/users/import` | `{"users":[{email, name, gender?, associated_centers?, is_admin?, editor_for?}]}` (1-100) | Upserts by email in one transaction; keeps existing ids; replaces the user's center links; unknown centers are rejected |
| `GET /v1/admin/users` | - | All users for admins; overlapping users for editors |
| `POST /v1/admin/users` / `PUT /v1/admin/users/:id` / `DELETE /v1/admin/users/:id` | User fields; email may be edited and `revoke_sessions` requests revocation on update | Editors may create users only in their centers and edit/delete non-admin users whose memberships are entirely within those centers |
| `POST /v1/admin/users/delete` | `{email}` | Removes the user and their center links |

**Management authorization** is either `X-Admin-Key` (`ADMIN_API_KEY`, server-to-server) or a client key plus an OTP-authenticated bearer token of an administrator or editor. Center management and import remain admin-only. Import cannot remove an existing admin's role; use user editing for that.

Non-admin users need at least one center; admins and editors need an email.
A name containing `&` is a pair and must contain exactly two nonempty names;
pairs cannot have email or privileged roles. Email edits do not require OTP.
The drawer selects session revocation by default when changing an email; promotion
of an email-less user forces revocation.

Names of email-less users must be unique within each associated center against
all users; a later email-bearing user cannot introduce such a conflict either.
Comparison trims whitespace and uses Unicode 17.0 full default case folding
(for example, `Straße` and `STRASSE` match). It does not apply Unicode
normalization, so canonically equivalent composed and decomposed strings are
not automatically combined. Two email-bearing users may have the same name.
Database triggers enforce name and membership constraints atomically; conflicts
return 409. Self-registration accepts exactly one center, while managers may
associate users and pairs with several.

## Admin app and shared drawer

The Expo Admin app uses `src/index.ts` and the shared UI in `src/web/`, with native projects in `src/ios/` and `src/android/`. It accepts administrator and editor email OTP sign-in and displays management in the profile drawer; the signed-in home screen is a welcome message. A platform-specific `EXPO_PUBLIC_API_KEY` identifies the client. Browser tokens use `sessionStorage`; native tokens use Expo SecureStore. The web origin must be in `ALLOWED_ORIGINS`. Native builds require a device-reachable API URL and platform signing for distribution.

The drawer lives in `packages/drawer/` and can be consumed by other Expo hosts on web, iOS, and Android. Hosts configure its API, session, theme, and optional management and content; its default authentication and management use the Sai Commons API. See the [drawer README](../packages/drawer/README.md) for packaging, peer dependencies, and adapting other user models. It is not automatically published or integrated into sibling apps.

## Data (Turso)

See [database/schema.sql](../database/schema.sql): `centers`, `users` (center memberships and editor permissions in JSON arrays `associated_centers` and `editor_for`), `otp_codes` (one active code per email, pending registration profile, attempts), and `otp_request_log` (throttling). The code checks center and user references itself. Center IDs are numeric in API responses and arrays, and stored as decimal text in `centers.id`. The schema initializes new databases; it does not upgrade existing tables.

### Upgrade and preflight

Back up the database and stop writes before upgrading. Set `TURSO_DATABASE_URL`
and `TURSO_AUTH_TOKEN` in the shell and run:

```sh
node scripts/database-preflight.mjs --live
node scripts/database-preflight.mjs --live --apply
```

The first command only reads data and reports user IDs and conflicts. Correct
each reported record explicitly; it never merges, normalizes, deletes or
demotes data. The second command rechecks and applies the integrity schema in a
conditional transaction. It aborts if user or center data changed since its
snapshot. The upgrade adds a missing session version without resetting existing
versions, and refuses to modify a database that already has `name_key`.
For an offline snapshot, run the `SNAPSHOT_QUERY` exported by
`scripts/database-preflight.mjs` against the database, save the resulting JSON
value privately, and pass its filename instead of `--live`. The `--apply`
option still needs database credentials. Delete any local snapshot after use.

The migration adds a case-folded `name_key`, checks role, pair, center and
collision invariants in triggers, and adds a normalized-email index alongside
the existing partial unique email index. All trusted writers must use the
shared `nameKey` function when inserting or renaming users and normalize emails
as the Worker does; database clients bypassing the Worker must honor this
contract. The migration and Unicode case-folding data are versioned together.
Deploy the Worker after migration and before resuming writes. Test this
sequence against a database copy first. A rollback requires restoring the
backup and the matching previous Worker; do not drop the integrity schema
while the new Worker is running.

The token is a 30-day HS256 JWT-shaped bearer signed with `SESSION_SECRET`,
including the user, client, session version, and authentication method.

## Securing the API

A key shipped in a web page or mobile binary is not a secret, so it is one layer among several:

- `API_KEYS`: comma-separated `client=key` pairs, one per web or mobile app (e.g. `bhajanstudio-ios=sc_...`); rotate or revoke a client by editing its entry. Keys are compared via SHA-256 digests without early exit. The matched client id is recorded in `users.registered_via` and `otp_request_log.client` and is the token's `client` claim; a token presented with a different client's key is rejected. Keys embedded in clients are extractable, so they identify and can disable a client but do not authenticate it.
- `ALLOWED_ORIGINS` exact allowlist: browser requests from other origins get 403 and no CORS headers. Non-browser callers can forge or omit `Origin`, so this does not replace the next items.
- Throttles (atomic insert): 1 OTP/min and 5/hour per email, 20/hour per client IP (`CF-Connecting-IP`). Add Cloudflare WAF/rate-limiting rules or Turnstile for public deployments.
- OTPs: 6 digits from Web Crypto, valid 10 minutes, stored only as HMAC-SHA256 keyed by `SESSION_SECRET`, single-use, 5 attempts (counted atomically before comparison).
- Requests are rejected when declared content length or decoded text length exceeds 8192; error responses do not include database or Brevo details.
- Multi-statement writes use a conditional Hrana batch (`BEGIN`, steps, `COMMIT`, `ROLLBACK` if the commit did not succeed).
- Secrets live in Wrangler secrets; the Turso token should be scoped to this database.
