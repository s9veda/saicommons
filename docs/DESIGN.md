# saicommons design

## API

All requests are JSON and need an `X-API-Key` header (a per-app client key). Errors return `{"error": "..."}`.

### Registration and login

| Endpoint | Body | Result |
|---|---|---|
| `POST /v1/register` | `email`, `name` (req); `gender` (opt: `Male`/`Female`/`Boy`/`Girl`/`Other`, case-insensitive); `associated_centers` (opt: array of existing center ids) | Sends an OTP; the user is created only after verification |
| `POST /v1/login` | `email` | Sends an OTP if the user exists |
| `POST /v1/verify-otp` | `email`, `otp_code` (6 digits) | `{"user": {...}, "token": "..."}` |
| `GET /v1/session` | `Authorization: Bearer <token>` | `{"user": {...}}` |

`register` and `login` return the same generic `{"ok":true,"message":...}` whether or not the account exists, so they do not reveal registered emails. Registering an existing email sends a code but never overwrites the stored profile or centers. Failure to send a register email returns 503. There is no logout endpoint: tokens are stateless, so clients discard them (deleting the user revokes immediately).

User objects: `id`, `email`, `name`, `gender`, `associated_centers` (centers the user can view), `editor_for` (centers the user may edit; always a subset of `associated_centers`), `is_admin`, and a derived `role`: `admin` if `is_admin`, else `editor` if `editor_for` is non-empty, else `viewer` (the saisongs rules). Self-registration always creates a plain viewer; only the admin API grants `is_admin`/`editor_for`.

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
| `GET /v1/admin/users` | - | All users |
| `POST /v1/admin/users` / `PUT /v1/admin/users/:id` / `DELETE /v1/admin/users/:id` | user fields (`email` on create only; PUT replaces the whole profile) | Create, update, delete; the last admin cannot be removed or demoted, and admins cannot demote or delete themselves |
| `POST /v1/admin/users/delete` | `{email}` | Removes the user and their center links |

**Admin authorization** is either `X-Admin-Key` (`ADMIN_API_KEY`, server-to-server; actor recorded as `admin-key`) or a client key plus the bearer token of a user with `is_admin` (actor recorded as the admin's email). The admin check reads the database on every request, so removing admin rights takes effect immediately.

### Centers admin page

The shared Expo admin UI is in `src/web/`, with native projects in `src/ios/` and `src/android/`. It signs in with an email OTP as an admin, using a platform-specific `EXPO_PUBLIC_API_KEY`. Browser tokens use `sessionStorage`; native tokens use Expo SecureStore. The web origin must be in `ALLOWED_ORIGINS`. The API source lives in `src/api/`. Native builds require a device-reachable API URL and platform signing for distribution.

## Data (Turso)

See [migrations/0001_init.sql](../migrations/0001_init.sql): `centers`, `users` (center memberships and editor permissions in JSON arrays `associated_centers` and `editor_for`), `otp_codes` (one active code per email, pending registration profile, attempts), and `otp_request_log` (throttling). The code checks center and user references itself. Center IDs are numeric in API responses and arrays, and stored as decimal text in `centers.id`. The initialization script creates new tables; it does not upgrade existing tables.

Existing databases must have a unique `users.email` constraint or index for user import and unambiguous authentication. The initialization script creates a partial unique index on non-null emails. Before applying it to an existing database, back up the database, normalize emails to lowercase with surrounding whitespace removed, and resolve duplicates explicitly. To identify duplicates, run `SELECT lower(trim(email)), count(*) FROM users WHERE email IS NOT NULL GROUP BY lower(trim(email)) HAVING count(*) > 1;`. Do not automatically delete or merge users: their roles and center associations may differ.

The token is a 30-day HS256 JWT-shaped bearer (`sub` = user id, `client`) signed with `SESSION_SECRET`.

## Securing the API

A key shipped in a web page or mobile binary is not a secret, so it is one layer among several:

- `API_KEYS`: comma-separated `client=key` pairs, one per web or mobile app (e.g. `bhajanstudio-ios=sc_...`); rotate or revoke a client by editing its entry. Keys are compared via SHA-256 digests without early exit. The matched client id is recorded in `users.registered_via` and `otp_request_log.client` and is the token's `client` claim; a token presented with a different client's key is rejected. Keys embedded in clients are extractable, so they identify and can disable a client but do not authenticate it.
- `ALLOWED_ORIGINS` exact allowlist: browser requests from other origins get 403 and no CORS headers. Non-browser callers can forge or omit `Origin`, so this does not replace the next items.
- Throttles (atomic insert): 1 OTP/min and 5/hour per email, 20/hour per client IP (`CF-Connecting-IP`). Add Cloudflare WAF/rate-limiting rules or Turnstile for public deployments.
- OTPs: 6 digits from Web Crypto, valid 10 minutes, stored only as HMAC-SHA256 keyed by `SESSION_SECRET`, single-use, 5 attempts (counted atomically before comparison).
- Request bodies capped at 8 KB; error responses never include database or Brevo details.
- Multi-statement writes use a conditional Hrana batch (`BEGIN`, steps, `COMMIT`, `ROLLBACK` if the commit did not succeed).
- Secrets live in Wrangler secrets; the Turso token should be scoped to this database.
