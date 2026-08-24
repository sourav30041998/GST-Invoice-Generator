# Secure Organization Password Recovery

## Purpose

This feature lets an active organization owner recover access through the registered email address. It is intentionally separate from Platform Admin authentication and cannot create users, change organizations, or bypass the closed invitation process.

A forgotten-password flow does **not** request the old password. A person who knows the old password can use normal sign-in; a person who has forgotten it cannot provide it. After email ownership is verified, the recovery grant authorizes only one password change.

## User Flow

1. Select **Forgot password?** on the Company sign-in screen.
2. Enter the registered owner email address.
3. The UI always advances to code entry and always displays a generic response. It never confirms whether the address exists.
4. Enter the six-digit code delivered by email. The code expires after 10 minutes and can be used once.
5. Enter and confirm a new password. Only the new-password field has a visibility control; confirmation remains masked.
6. The server rejects a mismatch, a weak password, or reuse of the current password.
7. After success, all Company sessions for the owner are revoked and a security notification is emailed. The user signs in normally with the new password.

Recovery tokens remain only in React memory. They are not written to local storage, session storage, URLs, cookies, analytics, or logs. Refreshing the page safely restarts the flow.

Advancing to the code-entry screen does not mean an email was sent. Delivery is
created only when the normalized requested address exactly matches an active
organization owner's database address and that owner's organization is active.
The controller performs a second equality check immediately before SMTP delivery.
Unknown or inactive accounts receive a suppressed challenge and no email.

The public API intentionally does not return `Invalid email` for an unknown
account. Such a response would expose registered owner addresses through account
enumeration. Invalid email _syntax_ is rejected, while valid but unknown addresses
receive the same status, message, response shape, and screen as known addresses.

## API Contract

All three endpoints accept JSON, require a trusted Company origin in production, return `Cache-Control: no-store`, and are covered by global and route-specific rate limits.

### Request a code

`POST /api/auth/password-recovery/request`

```json
{
  "email": "owner@example.com"
}
```

Response: `202 Accepted`

```json
{
  "message": "If that email is registered, a 6-digit code has been sent",
  "challengeToken": "opaque-browser-memory-token",
  "expiresInSeconds": 600,
  "resendAfterSeconds": 60
}
```

The status, message, and response shape are the same for registered and unknown addresses.

### Verify the code

`POST /api/auth/password-recovery/verify`

```json
{
  "challengeToken": "opaque-browser-memory-token",
  "otp": "012345"
}
```

Successful response:

```json
{
  "resetToken": "single-use-opaque-reset-grant",
  "expiresInSeconds": 600
}
```

Invalid, expired, superseded, replayed, or over-limit codes receive the same error message.

### Set the new password

`POST /api/auth/password-recovery/reset`

```json
{
  "challengeToken": "opaque-browser-memory-token",
  "resetToken": "single-use-opaque-reset-grant",
  "newPassword": "A-New-Password-123",
  "confirmPassword": "A-New-Password-123"
}
```

The password must contain 12 to 128 characters, upper-case and lower-case letters, and a number. The server independently verifies the confirmation and rejects the current password.

## MongoDB Design

### `passwordrecoverychallenges`

- HMAC hashes of the challenge token, email, OTP, reset grant, and request fingerprint
- Optional `userId` and `organizationId` only when the account is active
- OTP expiry, attempt count, verification, supersession, consumption, and delivery status
- A 30-minute `purgeAt` TTL index
- Unique indexes for challenge-token and reset-grant hashes

### `passwordrecoverythrottles`

- HMAC email hash, never the raw email address
- Request and OTP-attempt counters shared by resends
- A rolling 15-minute expiry with a TTL index
- Unique email-hash index to make concurrent request limits atomic

### Existing collections

- `users.passwordHash` is replaced with a fresh `scrypt` hash and `passwordChangedAt` is updated.
- Every existing `sessions` record for the user is deleted in the same MongoDB transaction.
- `auditlogs` receives `organization_owner_password_reset` without an OTP, token, password, raw IP, or raw email.

Run `npm run build && npm run db:create-indexes` after deploying the schema. MongoDB Atlas replica-set transactions are required.

## Abuse and Leakage Controls

| Threat                       | Enforced control                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Account enumeration          | Identical request status, message, shape, database path, and post-response email dispatch behavior                  |
| Arbitrary recipient delivery | Active owner lookup plus an independent exact-address invariant immediately before SMTP                             |
| OTP guessing                 | Cryptographic six-digit generation, five total attempts across resends, per-IP verification limit, 10-minute expiry |
| Email flooding               | Five requests per IP and three requests per email hash in 15 minutes; 60-second UI resend delay                     |
| Database disclosure          | OTPs and all bearer values use purpose-separated HMAC-SHA-256 with a server-only secret                             |
| Replay                       | OTP is removed after verification; reset grant is single-use and removed after the password transaction             |
| Concurrent reset             | Conditional MongoDB updates allow only one consumer of a grant                                                      |
| Stolen existing session      | All sessions are revoked automatically after reset                                                                  |
| Cross-origin abuse           | Production unsafe requests require the exact trusted HTTPS origin                                                   |
| Browser leakage              | Recovery values exist only in component memory and never enter URLs or browser storage                              |
| SMTP downgrade               | Authenticated SMTP with TLS 1.2 minimum; production refuses to boot without complete SMTP settings                  |

The flow follows the OWASP Forgot Password guidance for generic responses, secure random single-use values, confirmation, notification, and session invalidation. Email recovery remains dependent on the security of the owner's mailbox; stronger MFA and offline recovery codes remain future hardening options.

## Environment Configuration

Use a dedicated SMTP credential for the Company service and store every value in the deployment provider's encrypted environment settings.

```env
PASSWORD_RESET_SECRET=<dedicated random secret with 32 or more characters>
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=<smtp-user>
SMTP_PASSWORD=<smtp-password-or-app-password>
SMTP_FROM=GST Invoice Generator <no-reply@example.com>
SMTP_SECURE=false
```

Use `SMTP_SECURE=true` with port `465`; use `false` with port `587` so STARTTLS can upgrade the connection. Production requires both the dedicated reset secret and a complete SMTP configuration. Development can fall back to the invitation secret for local boot only, but production never permits that key reuse.

On Render Free, ports 25, 465, and 587 are blocked. Use a provider that offers
authenticated SMTP on port 2525 with `SMTP_SECURE=false`; production sets
`requireTLS` and requires TLS 1.2 or newer before credentials or message content
are transmitted.

## Production Verification

1. Create MongoDB indexes before accepting traffic.
2. Confirm a known and unknown email receive indistinguishable HTTP responses.
3. Confirm only the known address receives mail and no OTP appears in application logs.
4. Confirm a sixth code attempt fails, including after resending.
5. Confirm an expired, superseded, already verified, or consumed value cannot be replayed.
6. Confirm mismatched, weak, and current passwords are rejected by both UI and API.
7. Confirm a successful reset invalidates every pre-existing Company session.
8. Confirm the notification email contains no password or recovery token.
9. Confirm a request from an untrusted production origin returns `403`.
10. Monitor reset volume, SMTP failures, and completed-reset audit events without collecting recovery secrets.
