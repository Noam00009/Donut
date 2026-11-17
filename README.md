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

render.yaml adopts the existing donutan-site service and donutan-orders Postgres in
Noam's workspace, Frankfurt. DATABASE_URL is wired internally via fromDatabase.
ADMIN_SETUP_TOKEN is managed separately in Render's environment; it is deliberately
omitted from the Blueprint so future syncs preserve it.

The free database created 2026-11-17 expires 2026-12-17. Upgrade or migrate before
expiry for continued storage. Do not rely on the free tier for a permanent business.

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
