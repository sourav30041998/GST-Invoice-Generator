# Company Service Security

This repository contains the Company invoicing service only. Platform administration is an independent service with its own repository, host, session cookie, SMTP credential, TOTP encryption key, and operational documentation.

## Enforced Controls

- Authentication is mandatory. A company owner has exactly one `organizationId` and every protected query uses that server-side value.
- Company sessions are opaque, HTTP-only cookies; MongoDB stores only an HMAC hash of each session token. Production uses `Secure`, host-only cookies.
- Every authenticated write validates a per-session `X-CSRF-Token`; production unsafe requests also require the configured HTTPS origin.
- Passwords use `scrypt`; strict validation and rate limits protect login and invitation acceptance.
- JSON request bodies are size-limited. API responses are `no-store`; Helmet, CORS allowlists, compression, and production trust-proxy settings are applied centrally.
- Invitation tokens are high entropy, one-time, expiring values. MongoDB stores only an HMAC hash using `INVITATION_TOKEN_SECRET`.
- Password recovery returns non-enumerating responses, uses cryptographic six-digit codes and single-use reset grants, and stores only purpose-separated HMAC hashes under `PASSWORD_RESET_SECRET`. Attempts persist across resends and are limited per IP and email hash.
- A completed password reset rejects current-password reuse, updates the `scrypt` hash in a MongoDB transaction, revokes every existing Company session, invalidates outstanding recovery values, writes an organization audit event, and sends a security notification email.
- Recovery values remain in React memory only; they never enter URLs, browser storage, logs, analytics, or email after the OTP message. Production refuses to start without complete TLS-capable SMTP configuration.
- The company service has no platform-admin routes. Its three internal Admin operations require a short-lived HMAC signature and reject browser-originated calls.
- Organization suspension is enforced during authentication as well as session revocation, so a suspended company cannot keep using an existing session.
- Room inventory and allocation requests derive the organization from the authenticated session. The browser cannot supply an organization ID, invent a room identifier, or bypass an availability check.
- Room names use a restrictive business-code format, are normalized before a tenant-scoped unique index is applied, and are rendered by React as text rather than HTML.
- Room creation, edits, deactivation, and allocation state changes create organization-scoped audit records. A room with an active reservation or check-in cannot be deactivated.
- Invoice creation, draft conversion, room reassignment, checkout, and cancellation synchronize invoice and room-allocation data in a MongoDB transaction. MongoDB Atlas replica-set transactions are therefore required for this feature.

## Required Production Configuration

```env
NODE_ENV=production
MONGODB_URI=<TLS Atlas connection string for the Company service user>
MONGODB_DB_NAME=<database name>
CLIENT_ORIGIN=https://app.example.com
AUTH_REQUIRED=true
SESSION_SECRET=<unique 32+ character secret>
INVITATION_TOKEN_SECRET=<shared 32+ character invitation secret>
PASSWORD_RESET_SECRET=<dedicated 32+ character password-recovery secret>
ADMIN_INTERNAL_SHARED_SECRET=<shared 32+ character internal-service secret>
SMTP_HOST=<authenticated SMTP host>
SMTP_PORT=587
SMTP_USER=<SMTP user>
SMTP_PASSWORD=<SMTP password or app password>
SMTP_FROM=GST Invoice Generator <no-reply@example.com>
SMTP_SECURE=false
COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=lax
TRUST_PROXY=true
ALLOW_DATABASE_RESET=false
```

Use an Atlas user with access only to the Company collections listed in `MULTI_TENANCY.md`. Keep all actual values in the deployment provider's encrypted secret manager, never in source control.

## Deployment Verification

1. Confirm the Company health endpoint returns `200` over HTTPS.
2. Confirm `/api/platform/overview` returns `404`.
3. Confirm an unauthenticated Company data request returns `401` and an unsigned `/api/internal/*` request returns `403`.
4. Confirm cross-origin unsafe requests are rejected and production cookies are `Secure`, `HttpOnly`, and host-only.
5. Confirm an organization cannot read another organization's invoice by guessing its invoice number or MongoDB ID.
6. Back up Atlas, test a restore, and set log/availability alerts before processing production invoices.
7. Verify that a room ID belonging to Company A returns `422` when submitted to Company B, and that two simultaneous reservations for the same room/date range produce one success and one `409` conflict.
8. Verify a cancelled invoice releases its room allocation and a checked-out invoice can no longer be edited.
9. Complete every item in the production verification section of [PASSWORD_RECOVERY.md](./PASSWORD_RECOVERY.md), including anti-enumeration, attempt carryover, replay rejection, session revocation, and SMTP failure monitoring.

For the full cross-service boundary and Platform Admin controls, use the `SECURITY_BOUNDARY.md` in the separate Platform Admin repository.

Future controls are deliberately tracked separately in [FUTURE_SECURITY_ROADMAP.md](./FUTURE_SECURITY_ROADMAP.md); they should not be considered implemented until they move into this document's enforced-controls list after verification.
