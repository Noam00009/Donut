# Donutan shop and admin

Hebrew RTL donut storefront with a matching pink, chocolate and cream admin UI.
Public source snapshot captured 2026-11-17, with original browser bundles and local
assets; the new server, admin dashboard, order APIs and confirmation page are editable source.

## Run

Node 22+, `npm ci`, then `npm start`. In development without DATABASE_URL the public
storefront is available, but orders and administration fail closed. For full operation
set DATABASE_URL to PostgreSQL and ADMIN_SETUP_TOKEN to a cryptographically random
one-time setup code. Set NODE_ENV=production for secure session cookies on HTTPS.

Visit `/admin`, enter the setup code and choose a password (at least 12 characters).
Setup closes permanently after the first administrator is created. Passwords use
salted scrypt hashes; session tokens are stored hashed and expire after 12 hours.
Never commit credentials or share the setup code publicly.

## Features

- `/admin`: password-protected dashboard, all orders with pagination, search,
  status filters, global summary counts, status updates and shared unit/bundle prices.
- New orders refresh every 5 seconds while the admin screen is open; an in-app
  notification appears and sound can be enabled by clicking the bell. No background
  push notifications are sent while the browser is closed.
- PostgreSQL stores orders, immutable price snapshots, administrator credentials,
  sessions and versioned prices independently of web-service restarts.
- Public checkout validates Israeli mobile numbers, quantities, business hours and
  preparation lead time. Amounts are calculated on the server in integer agorot.
- Idempotency keys prevent duplicate orders after request retries. Stale prices are
  rejected for explicit customer review. Open shop pages reload new prices within
  10 seconds; checkout shows a refresh prompt to preserve entered information.
- Customer receipt at `/o/<random-token>` shows the saved order and status.
- Cash on pickup works by default. Bit is disabled until BIT_PHONE is configured.
  Customer claims of Bit payment are shown as unverified, never as confirmed payment.
- Customer information is not sent to the original site's backend.

## Deploy

The shop and admin run on one free Render web service, with `/admin` as the
management URL. DATABASE_URL is a pooled Neon PostgreSQL connection, set privately
in Render. Neon project donutan (broad-sky-94691606), Frankfurt, belongs to the
Noam Free organization. No credentials are committed.

Neon Free has usage/storage limits rather than a 30-day database expiry. Render
free web services sleep when idle and share 750 instance hours per workspace.
The health endpoint checks process readiness without querying PostgreSQL, so
platform health probes do not consume continuous database compute. Startup
verifies the database before listening. Actual API failures return errors.

The legacy admin portal supports REDIRECT_ADMIN=true to redirect old bookmarks
to the shop's /admin. Suspend this legacy service once users use the new URL.
The old Render database is retained temporarily for rollback, not used for new
orders after migration. Blueprint auto-sync is paused during the migration;
DATABASE_URL is manual so a sync cannot restore the old database binding.

Migration procedure: deploy MAINTENANCE_MODE=true, verify health and rejected
writes, allow old requests to drain, then set MIGRATION_TARGET_URL to a direct
Neon URL. Startup copies all tables in transactions and checks counts, retaining
an idempotent receipt. After validation set DATABASE_URL to the pooled Neon URL,
clear MIGRATION_TARGET_URL and set MAINTENANCE_MODE=false. Existing passwords,
orders, images and settings are preserved. The source database is not erased.

## Tests

`npm test` runs integration tests against embedded PostgreSQL (PGlite) in isolated
memory. Tests cover auth, CSRF origin checks, setup locking, session revocation,
server-side totals, price version conflicts, idempotency, order-status changes,
application restart persistence and local asset routes. No production orders are
created by the tests. A final live smoke test is required after Blueprint approval.

## Content editor and separate admin site

The admin site's `portal.mjs` entry point serves the protected dashboard at its own
root URL, with SHOP_URL pointing to the main shop. It forwards only admin APIs,
public settings and media to the shop; database credentials remain on the shop.
Host-only HttpOnly session cookies authenticate portal requests. Cross-origin
mutations are rejected before forwarding.

The editor changes headline, subtitle, intro, address, hero photo, each of the two
flavors' name/description/photo/availability, and all seven days' opening hours.
Images (JPEG, PNG, WebP, up to 2MB) are stored in PostgreSQL, not the ephemeral
Render filesystem. Shop data and checkout validation share the same versioned
content. Changes are published by the explicit save action. Existing order
snapshots retain the original names, address and prices.

Run `node portal.mjs` for the separate admin website. Fourteen integration tests
cover the complete admin, CMS, uploads, order validation and proxy behavior.
