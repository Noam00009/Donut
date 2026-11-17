# Donutan frontend replica

Standalone snapshot of the public home and checkout screens at
https://donutan-yejq.vercel.app/, captured 2026-11-17. Includes the original
public browser bundles, CSS, images and fonts; original React/Next source and
private backend are not available from the public website.

## Run

Node.js 22 or later, no dependencies:

```
npm start
```

Open http://localhost:3000. Run `npm test` for route, asset and order-isolation checks.

## Render

Push this directory to a GitHub repository, then create a Render Node web service:
build command `npm install --ignore-scripts`, start command `npm start`, health
check `/health`. PORT is provided by Render. No database or paid service is created
by this package.

## Current scope

Home design, animation, local cart, quantity controls, bundle pricing, checkout
fields and pickup time selection use the captured frontend. All assets are local.
Cross-page links use full-page navigation to avoid the original Next server.

Actual order submission is deliberately disabled (HTTP 503 with an explanatory
Hebrew message). No customer data is sent to the original merchant. No order is
falsely confirmed. A separate authenticated order backend and durable storage,
merchant notifications and confirmation screen must be implemented before launch.
The original Bit phone is removed from the rendered pages; BIT_PHONE may be set
only to the intended merchant's number after verification. This does not process
or confirm payment.

Deployment pending: intended Render workspace and a writable GitHub repository.
