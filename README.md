# saicommons

Shared authentication API for Sainam Japam (`mantrajapam`) and Sai Bhajan Studio (`bhajanstudio`). This is a TypeScript Cloudflare Worker backed by Cloudflare D1. It is not deployed or connected to an existing database.

## Local setup

```sh
npm install
cp .dev.vars.example .dev.vars
# Replace local secrets; keep .dev.vars untracked.
npx wrangler d1 create sssapi
# Copy the returned database_id into wrangler.jsonc, then:
npx wrangler d1 migrations apply sssapi --local
npx wrangler dev
```

The checked-in `database_id` is intentionally `REPLACE_WITH_D1_DATABASE_ID`. For a deployed D1 database, run `wrangler d1 migrations apply sssapi --remote` after configuring its ID. Do not run these commands against production without the appropriate approval and backups.

Configure `SESSION_SECRET` and `ADMIN_API_KEY` as Wrangler secrets for deployed environments (`wrangler secret put ...`); configure Brevo credentials the same way. Never put secrets in `wrangler.jsonc` or source control. With `BREVO_API_KEY` unset, local development logs OTP codes to the Worker console.

## URL routing

The Worker is configured without Wrangler `routes`. It can be exposed at a hostname such as `auth.s9veda.org`, or routed behind an application path such as `/auth/*` by the deployment/proxy configuration. The API paths below are rooted at `/v1`; a path-prefix proxy must strip `/auth` before forwarding.

## API

See [docs/DESIGN.md](docs/DESIGN.md) for the policy, complete endpoint reference, integration and migration notes, and security considerations.

## Validation

```sh
npx tsc --noEmit
node scripts/smoke.mjs
npx wrangler deploy --dry-run --outdir .wrangler/dry
```

The smoke script builds the Worker with Wrangler and tests the bundled handler against an in-memory D1 substitute; it does not connect to Cloudflare or send real email.
