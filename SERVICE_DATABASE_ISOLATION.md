# Company Provisioning and Database Isolation

## Authority

Company is authoritative for `organizations`, `organizationinvitations`,
`users`, `sessions`, invoices, rooms, settings, and tenant audit events. Admin
stores only platform identities, MFA sessions, login throttles, and platform
audit events in a different database.

The free-tier topology may use one Atlas cluster with two databases and two
database-scoped users. This is logical isolation. Moving the databases to
separate Atlas projects/clusters later provides physical isolation without an
API redesign.

Company's runtime user receives `readWrite` only on
`gst_invoice_company_prod`. It must have no role on `gst_invoice_admin_prod`.
Admin has the inverse restriction. Index creation and migration use temporary,
separately revoked credentials.

## Internal API

All routes are below `/api/internal/provisioning` and return only bounded
directory/invitation metadata.

| Method  | Path                                 | Company transaction                     |
| ------- | ------------------------------------ | --------------------------------------- |
| `GET`   | `/overview`                          | Counts only                             |
| `GET`   | `/organizations`                     | Cursor page, maximum 25                 |
| `GET`   | `/invitations`                       | Cursor page, maximum 25                 |
| `POST`  | `/invitations`                       | Organization + invitation + audit       |
| `POST`  | `/invitations/:id/renew`             | Revoke old + create replacement + audit |
| `POST`  | `/invitations/:id/revoke`            | Revoke + audit                          |
| `PATCH` | `/organizations/:id/status`          | Status + session revocation + audit     |
| `POST`  | `/organizations/:id/revoke-sessions` | Session revocation + audit              |

Internal-auth version 2 HMAC binds method, exact path/query, timestamp, random
192-bit nonce, and body digest. Requests have a 60-second freshness window;
nonce hashes are reserved atomically and expire automatically. Browser Origin
headers are rejected. Admin and Company validate request/response schemas
independently.

Writes also contain a signed UUID request ID. Company HMAC-hashes it for the
`internalcommands` primary key and stores the request digest plus response for
seven days. Network retries reuse the same body/request ID, so a lost response
does not create a duplicate organization or apply a status command twice.

## Invitation Flow

1. Admin validates the operator's authenticated, CSRF-protected, recent-MFA
   request.
2. Admin sends a signed command with organization and owner fields.
3. Company checks owner and open-invitation uniqueness inside its database.
4. Company derives a high-entropy token from the random request ID using its
   private `INVITATION_TOKEN_SECRET` and stores only a purpose-separated HMAC.
5. Company commits organization, invitation, idempotency receipt, and tenant
   audit in MongoDB transactions.
6. Company claims a short email-delivery lease and sends the fragment URL using
   its own SMTP credential.
7. Admin receives status metadata only and writes a separate platform audit
   with the opaque Company request ID.
8. Public acceptance consumes the token, creates the owner/profile, activates
   onboarding, and writes its audit in one Company transaction.

The URL fragment prevents normal HTTP access logs and referrer handling from
receiving the token before React explicitly submits it. The raw token never
crosses to Admin, enters either audit log, or persists in MongoDB.

## Database Constraints

- Unique organization slug.
- Unique user email.
- Partial unique open invitation per owner email.
- Unique token HMAC.
- Unique internal command receipt and nonce hash.
- TTL cleanup for nonces, command receipts, sessions, and recovery records.
- Tenant indexes keep `organizationId` as the leading scope for protected data.

Before creating the partial invitation index, `db:create-indexes` checks for
duplicate open invitations and stops with a safe error instead of silently
choosing a record.

## Production Cutover

1. Back up the existing shared database and test restore access.
2. Deploy Company first, still pointing at the existing Company/shared DB. The
   old signed endpoints remain temporarily for rolling compatibility.
3. Verify new internal endpoints reject unsigned and replayed requests.
4. Copy only platform collections into the new Admin DB using the Admin
   repository's non-destructive migration script.
5. Deploy Admin with its new DB user and without SMTP or invitation secrets.
6. Verify create, renew, revoke, status, and session commands plus both audit
   records.
7. After the rollback window, remove platform-only collections from the Company
   DB with Atlas tooling and rotate the old all-purpose credential.

Keep Company `MONGODB_DB_NAME` on the existing database during the first split;
renaming it at the same time creates an unnecessary second data migration.

## Render Free Notes

Render Free cannot receive private-network requests and blocks outbound SMTP
ports 25, 465, and 587. Use public HTTPS plus the signed/replay-protected
internal contract, and configure an authenticated TLS-capable provider on port 2525. A sleeping service can delay the first request; never enlarge signature
freshness windows or weaken timeouts to hide cold starts.

## Verification

- Admin's Atlas user cannot list/read Company collections and vice versa.
- Raw invitation tokens are absent from logs, MongoDB, Admin responses, and
  platform audits.
- Replaying an identical HMAC nonce returns `403`.
- Retrying the same signed command request ID returns the original result.
- Reusing a request ID with a different payload returns `409`.
- Concurrent open invitations for one email produce one success and one `409`.
- Suspension and session deletion commit together.
- Accepted invitations set both organization status and onboarding completion.
- SMTP failure records only status/timestamps and can be renewed safely.
