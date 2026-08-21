# Single-Company Tenancy

## Scope

This release creates one private workspace per company. One user account is linked to exactly one organization. The first user is the `owner`; company switching and shared user memberships are deliberately out of scope. Invitation issuance and platform administration are handled by the separately deployed Platform Admin service.

## Security Boundary

The browser never submits an organization ID for authorization. After sign-in, the API reads the opaque HTTP-only session cookie, loads the session, user, and active organization from MongoDB, and applies that organization ID to every data query. A guessed invoice number or MongoDB ID therefore returns `404` outside its owning organization.

Protected write requests also require the per-session `X-CSRF-Token`. Production cookies are secure and HTTP-only, API responses use `Cache-Control: no-store`, and the backend allows only configured HTTPS origins.

## MongoDB Collections

| Collection         | Purpose                                                                  | Organization relation                                            |
| ------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `organizations`    | Company name, immutable slug, active/suspended state, onboarding flag    | Tenant root                                                      |
| `users`            | Owner identity, global unique email, scrypt password hash, account state | Required `organizationId`                                        |
| `sessions`         | Hash of opaque session token, CSRF token, expiry                         | Required `organizationId`, `userId`                              |
| `businessprofiles` | Company business, GST, contact, bank, logo, and invoice prefix           | One per `organizationId`                                         |
| `invoices`         | Issued invoice and immutable profile snapshots                           | Required `organizationId`, creator ID                            |
| `invoicedrafts`    | Unnumbered draft invoices                                                | Required `organizationId`, creator ID                            |
| `counters`         | Invoice sequences                                                        | Required `organizationId`; unique by company, prefix, and period |
| `auditlogs`        | Company-local activity history                                           | Required `organizationId`, actor ID                              |
| `referencedata`    | Shared non-sensitive lookup data, such as Indian states                  | No tenant data                                                   |
| `schemamigrations` | One-time database migration markers                                      | Global operational metadata                                      |

Important indexes include unique `(organizationId, invNo)` for invoices, unique `(organizationId, prefix, period)` for counters, a unique global user email, and a TTL expiry index for sessions.

Indexes are intentionally created only by `npm run db:create-indexes` or the migration script; the running application never modifies database indexes automatically.

## API Endpoints

All endpoints except health and authentication status require an authenticated session. Every `POST`, `PUT`, `PATCH`, and `DELETE` after sign-in also requires `X-CSRF-Token` from `GET /api/auth/me`.

| Method   | Endpoint                            | Purpose                                                                                                       |
| -------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/health`                       | Public service health check                                                                                   |
| `GET`    | `/api/auth/me`                      | Current session, owner, organization, and CSRF token                                                          |
| `POST`   | `/api/auth/login`                   | Sign in with owner email and password                                                                         |
| `POST`   | `/api/auth/logout`                  | End current session                                                                                           |
| `POST`   | `/api/invitations/accept`           | Activate an approved organization through a one-time invitation                                               |
| `GET`    | `/api/settings`                     | Current company's profile settings                                                                            |
| `PUT`    | `/api/settings/preset`              | Update current company profile                                                                                |
| `PUT`    | `/api/settings/logo`                | Update current company logo                                                                                   |
| `DELETE` | `/api/settings/logo`                | Remove current company logo                                                                                   |
| `DELETE` | `/api/settings/database`            | Clear invoices, drafts, counters, and audit data for current company only; disabled unless explicitly enabled |
| `GET`    | `/api/reference-data/indian-states` | Indian state lookup                                                                                           |
| `GET`    | `/api/invoices`                     | List only current company invoices                                                                            |
| `GET`    | `/api/invoices/next-number`         | Preview only current company next number                                                                      |
| `GET`    | `/api/invoices/export.csv`          | Export only current company invoices                                                                          |
| `GET`    | `/api/invoices/workbench`           | Current company workflow list and counts                                                                      |
| `GET`    | `/api/invoices/drafts`              | Current company drafts                                                                                        |
| `POST`   | `/api/invoices/drafts`              | Create an unnumbered draft                                                                                    |
| `GET`    | `/api/invoices/drafts/:draftId`     | Read current company draft                                                                                    |
| `PUT`    | `/api/invoices/drafts/:draftId`     | Update draft or convert it to a numbered invoice                                                              |
| `DELETE` | `/api/invoices/drafts/:draftId`     | Delete current company draft                                                                                  |
| `POST`   | `/api/invoices`                     | Create a numbered invoice                                                                                     |
| `GET`    | `/api/invoices/:invNo`              | Read current company invoice                                                                                  |
| `PUT`    | `/api/invoices/:invNo`              | Update current company invoice                                                                                |
| `PATCH`  | `/api/invoices/:invNo/cancel`       | Cancel current company invoice                                                                                |

### Invoice Integrity Rules

- Invoice dates must be valid calendar dates, and departure cannot be before arrival.
- Every charge or service must have a positive quantity and rate, plus a valid optional HSN/SAC code. Descriptions are optional.
- A line may use either IGST or a matching CGST/SGST pair. The combined GST rate cannot exceed 100%.
- Adjustments require a description and a positive amount. Deductions cannot reduce the payable amount to zero or below.
- A draft can remain a draft or be issued as `checkedIn` or `checkedOut`. A checked-in invoice can remain checked in or move to checked out. Checked-out and cancelled invoices are locked; cancellation is the correction path.
- All invoice, draft, draft-delete, and cancellation writes are executed in MongoDB transactions with their audit entry. Issuing or converting a draft also allocates the invoice number inside that transaction.

### Revision-Safe Writes

Invoice and draft responses contain a numeric `version`. Send that exact version in the JSON body for these requests:

| Method   | Path                            | Required JSON body addition |
| -------- | ------------------------------- | --------------------------- |
| `PUT`    | `/api/invoices/:invNo`          | `{ "version": 0 }`          |
| `PUT`    | `/api/invoices/drafts/:draftId` | `{ "version": 0 }`          |
| `DELETE` | `/api/invoices/drafts/:draftId` | `{ "version": 0 }`          |
| `PATCH`  | `/api/invoices/:invNo/cancel`   | `{ "version": 0 }`          |

Replace `0` with the version from the most recent `GET`, create, or update response. A stale version receives `409 Conflict`; reload the record before retrying. This prevents a second browser or API client from overwriting a newer change.

## One-Time Legacy Migration

Run this **once** before deploying this branch over a database created by the older single-company release. Take a MongoDB Atlas backup first. Do not run it concurrently with invoice writes.

1. Deploy no code yet; temporarily stop invoice writes in the current app.
2. Ensure the local `.env` has the same `MONGODB_URI`, `MONGODB_DB_NAME`, and `SESSION_SECRET` as the target environment. Do not commit this file.
3. Set three temporary migration variables in the terminal: `LEGACY_MIGRATION_OWNER_EMAIL`, `LEGACY_MIGRATION_OWNER_NAME`, and `LEGACY_MIGRATION_OWNER_PASSWORD`. The password must be at least 12 characters with upper-case, lower-case, and numeric characters.
4. Build the branch and run `npm run db:migrate-single-company-tenancy`.
5. Verify the command reports success. It creates the legacy company and owner, assigns all existing records to that company, removes the obsolete global settings records, replaces legacy global indexes, and records its own migration marker.
6. Deploy this branch. Subsequent deployments may use `npm run db:create-indexes` in the Render build command.
7. Sign in using the migration owner email and password, then open **Company Profile** to review business details.

The migration is idempotent. A later run only verifies and rebuilds tenant indexes; it does not create another organization.

## New Environments

For a brand-new database, do not run the legacy migration. Configure `AUTH_REQUIRED=true`, a 32+ character `SESSION_SECRET`, `INVITATION_TOKEN_SECRET`, and `ADMIN_INTERNAL_SHARED_SECRET`. Create the first company through an invitation issued by the separate Platform Admin service, as documented in [ACCESS_CONTROL.md](./ACCESS_CONTROL.md).

## Deployment Guardrails

- Use MongoDB Atlas TLS with an app-specific database user and the least privileges needed for the named database.
- Use HTTPS, `COOKIE_SECURE=true`, `TRUST_PROXY=true`, and the exact deployed URL in `CLIENT_ORIGIN`.
- Keep `ALLOW_DATABASE_RESET=false` in production.
- Public self-registration is intentionally unavailable. Use the MFA-protected platform console and one-time invitations for every company.
- Store environment variables in the host's secret manager; never use `VITE_` prefixes for backend secrets.
- Add offsite encrypted backups and test restoration before relying on the service for production accounting.
