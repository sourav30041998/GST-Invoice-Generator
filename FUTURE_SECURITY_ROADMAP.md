# Future Security Roadmap

## Status

This document records security controls deliberately deferred from the current release. It is a design and delivery checklist, not evidence that a listed control has already been implemented.

The present architecture already separates the Company application from the Platform Admin application, uses server-side organization scoping, MFA for platform administrators, HMAC-signed internal calls, CSRF protection, expiring hashed invitation tokens, and HTTP-only sessions. See [SECURITY.md](./SECURITY.md) and [SERVICE_SEPARATION.md](./SERVICE_SEPARATION.md) for the currently enforced controls.

## Security Goals

1. Limit the impact of a compromised service, administrator account, deployment credential, or database credential.
2. Prevent cross-company data access even when one component fails.
3. Make privileged actions difficult to phish, replay, automate, or perform without an audit trail.
4. Detect and contain suspicious activity quickly.
5. Verify the controls continuously instead of relying on a one-time review.

## Delivery Order

| Phase | Priority | Outcome | Main owners |
| --- | --- | --- | --- |
| 1 | Required before production | Deployment and database least privilege | Platform / database administrator |
| 2 | High | Durable abuse protection and observability | Backend / Platform |
| 3 | High | Stronger service-to-service trust | Backend / Platform |
| 4 | High | Phishing-resistant privileged access | Backend / Admin operations |
| 5 | Medium | Stronger data-at-rest protection and recovery | Backend / Database administrator |
| 6 | Ongoing | Automated assurance and incident readiness | Engineering / Operations |

## Phase 1: Production Isolation and Least Privilege

### 1. Separate production origins and release pipelines

- Use distinct domains such as `app.example.com` for the Company application and `admin.example.com` for Platform Admin.
- Keep separate source repositories, hosting services, environment-variable sets, logs, deployment credentials, and alert routes.
- Keep Admin on a separate origin; do not proxy it below the Company application's path.
- Use HTTPS only, host-only secure cookies, exact CORS allowlists, and production `TRUST_PROXY=true`.

**Acceptance checks**

- Company routes do not expose `/api/platform/*`.
- Admin routes do not expose invoice, customer, profile, draft, or Company session APIs.
- A compromise of one deployment token cannot publish the other service.

### 2. Create least-privilege MongoDB Atlas users

Create distinct Atlas custom roles and database users. Built-in broad roles are not adequate for this production design.

| Database user | Collections | Required actions |
| --- | --- | --- |
| Company runtime | `auditlogs`, `businessprofiles`, `counters`, `invoices`, `invoicedrafts`, `organizations`, `organizationinvitations`, `referencedatas`, `schemamigrations`, `sessions`, `settings`, `users` | Runtime reads and writes only |
| Admin runtime | `organizations`, `organizationinvitations`, `platformadmins`, `platformauditlogs`, `platformsessions` | Runtime reads and writes only |
| Migration/index operator | Explicit temporary collection list | Create indexes and perform maintenance only during planned windows |

- Do not grant `atlasAdmin`, `readWriteAnyDatabase`, `dbOwner`, or wildcard collection access to runtime users.
- Store each connection URI only in the service that needs it.
- Change the existing broad development-style database password after the two runtime users are live.
- Restrict Atlas network access to deployment egress IPs or private networking. Enforce TLS.

The two services intentionally share `organizations` and `organizationinvitations` because invitation redemption must activate an organization atomically. This is the only allowed shared data boundary. Atlas supports custom roles scoped to named database collections; configure these using the Atlas UI or Administration API. [Atlas custom database roles](https://www.mongodb.com/docs/atlas/security-add-mongodb-roles/)

### 3. Use a managed secret store and rotation process

- Store all production secrets in the hosting provider's encrypted secret manager or a dedicated vault, never in source files, browser variables, or logs.
- Use different secrets for Company sessions, Admin sessions, Admin TOTP encryption, email delivery, database users, and deployment access.
- Keep only these two temporary cross-service shared secrets: `INVITATION_TOKEN_SECRET` and `ADMIN_INTERNAL_SHARED_SECRET`.
- Maintain a written rotation runbook: add new secret, deploy both readers, switch issuer, invalidate old sessions or tokens when required, remove old secret, and record completion.

**Acceptance checks**

- Secret scanning reports no committed credential.
- A production secret rotation is tested in staging.
- No `VITE_*` variable contains a server secret.

### 4. Add an outer access gate for Admin

- Put `admin.example.com` behind a WAF or identity-aware access gateway.
- Allow only named platform operators; use an IP allowlist where operationally practical.
- Retain the application's own password plus MFA. The gateway is a second independent control, not a replacement.

## Phase 2: Durable Abuse Protection and Observability

### 1. Move rate limiting to Redis

Replace process-memory `express-rate-limit` stores with a shared Redis-backed store before running multiple instances or relying on production rate limits.

- Apply limits by IP, normalized email, account ID, and route as appropriate.
- Use stricter independent buckets for Company login, invitation acceptance, Admin login, and destructive Admin actions.
- Record only a keyed hash of the email in rate-limit keys where possible, not the raw email.
- Honor `Retry-After` and show a useful, non-sensitive message to users.
- Do not let application restarts reset a limit.

### 2. Add targeted bot defense

- Add a challenge such as Turnstile only after a risk threshold: repeated failed invitation redemption, suspicious login velocity, or WAF signal.
- Do not make a CAPTCHA the only control; preserve rate limiting, password protection, and MFA.

### 3. Centralize audit and alerts

- Send structured, redacted logs from both services to a separate retained log destination.
- Alert on repeated Admin MFA failures, invitation spikes, invitation email failures, organization suspension, session revocation, invalid internal signatures, and repeated cross-origin rejections.
- Ensure logs never contain passwords, session tokens, invitation tokens, SMTP credentials, MongoDB URIs, or full authorization headers.
- Set health, error-rate, latency, and database connectivity alerts.

**Acceptance checks**

- A test failed Admin login creates an alert without exposing credentials.
- A test invalid internal signature creates an audit event/alert.
- Logs are accessible to operators but cannot be edited by the running applications.

## Phase 3: Stronger Admin-to-Company Trust

The existing HMAC plus 60-second timestamp check is a sound interim control. The target state removes dependence on a broadly shared secret and reduces replay exposure.

### 1. Private network and mutual TLS

- Deploy Admin and Company APIs on private networking where the host supports it.
- Require mutual TLS for Admin-to-Company traffic. Company validates the Admin client certificate; Admin validates the Company server certificate.
- Block `/api/internal/*` from the public internet at the network layer. Application HMAC checks remain as defense in depth during migration.

### 2. Signed request improvements

- Add a key ID, request-body hash, and unique nonce to every internal request.
- Store nonces in Redis with a 60-second TTL using an atomic insert. Reject a second use, even inside the time window.
- Define a versioned canonical signing format and automated contract tests for both services.
- Rotate internal signing keys without downtime by accepting `current` and `next` key IDs during transition.

### 3. Remove the symmetric invitation secret

Replace `INVITATION_TOKEN_SECRET` with an asymmetric invitation signature:

1. Admin signs an invitation claim with an Ed25519 private key.
2. Company validates it using only the Admin public key and a pinned issuer/audience.
3. Claims include a unique ID, invitation ID, organization ID, email, issuance time, expiry, issuer, and audience.
4. The Company database still enforces single use by consuming the invitation transactionally.
5. Publish current and next public keys through a tightly controlled key set for rotation.

This means a Company-service compromise cannot mint valid new invitations.

**Acceptance checks**

- Direct public requests to `/api/internal/*` are network-blocked.
- Reusing a signed request nonce fails.
- A Company service with only public invitation keys cannot create a valid invitation.

## Phase 4: Stronger Platform Administrator Authentication

### 1. Add WebAuthn passkeys

- Add WebAuthn passkeys for platform administrators as the preferred MFA method.
- Keep TOTP as an enrolled backup factor during the transition, with recovery codes stored and displayed only once.
- Require at least two recovery options for each administrator and a controlled recovery process requiring a second platform administrator.
- Do not permit email-only MFA reset.

Passkeys use platform authenticators such as a device biometric and are phishing-resistant compared with ordinary OTP entry. [OWASP Zero Trust Architecture guidance](https://cheatsheetseries.owasp.org/cheatsheets/Zero_Trust_Architecture_Cheat_Sheet.html)

### 2. Add Admin roles and step-up verification

- Split `platform_admin` into least-privilege roles such as `support`, `operations`, and `security_admin`.
- Require step-up MFA for issuing/renewing invitations, suspending/reactivating an organization, revoking sessions, changing administrator roles, and modifying email or authentication settings.
- Require dual approval for the most sensitive actions if multiple administrators are available.
- Include the actor, before/after state, reason, and request correlation ID in an immutable Admin audit event.

### 3. Password hashing migration

- Retain current `scrypt` verification for existing accounts.
- Introduce Argon2id for new password hashes, and upgrade a hash after a successful login.
- Tune memory and iteration values against production capacity before rollout.

OWASP recommends Argon2id as the preferred password hashing choice and recognizes scrypt as an acceptable alternative when Argon2id is unavailable. [OWASP Password Storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

## Phase 5: Data Protection, Backup, and Recovery

### 1. Application-layer encryption for sensitive fields

- Classify data first. Candidate fields include bank account details, GSTIN, address/contact PII, and uploaded logos/documents where applicable.
- Use envelope encryption: a KMS-managed key encrypts a rotating data-encryption key; the application uses the data key to encrypt classified field values.
- Store encryption metadata and key version alongside ciphertext. Never use the session or invitation secret as an encryption key.
- Design searchable fields separately; encrypted values should not be used for free-text queries without an approved blind-index design.

### 2. Backups and recovery

- Enable managed backups where available; otherwise make encrypted backups on a documented schedule.
- Encrypt backup media with keys separate from runtime database credentials.
- Test a restore into an isolated environment at least quarterly.
- Document recovery-time and recovery-point objectives before taking production invoices.

## Phase 6: Continuous Assurance and Incident Response

### 1. CI security gates

- Run dependency scanning, secret scanning, static analysis, and license review on every pull request.
- Block merges on critical findings until they are resolved or formally risk-accepted with an expiry date.
- Pin CI actions and protect deployment branches.
- Generate a software bill of materials for release artifacts.

### 2. Security regression tests

Add automated tests for:

- Cross-organization invoice, draft, profile, audit, and export access.
- Expired, revoked, replayed, malformed, and already-consumed invitations.
- CSRF, CORS, cookie flags, authorization bypass, and HTTP-method tampering.
- Admin route isolation and signed internal request replay.
- Organization suspension and full session invalidation.
- Secret rotation and key-version compatibility.

OWASP recommends endpoint-level access control and rate limiting rather than relying on a single API protection mechanism. [OWASP REST Security guidance](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)

### 3. Incident playbooks

Create and rehearse procedures for:

- Lost or compromised Platform Admin device, password, passkey, or TOTP seed.
- Suspicious organization behavior and rapid suspension.
- Database credential or application-secret exposure.
- Invitation delivery compromise or token leakage.
- MongoDB restore and data-integrity verification.
- Required notification, investigation, containment, and post-incident review.

## Implementation Guardrails

- Review each phase in a separate branch and pull request; do not combine migrations, authentication changes, and UI changes in one deployment.
- Test every security change in staging with production-like origins, cookies, TLS, and database role permissions.
- Keep a rollback plan before each change. For auth and key changes, define whether rollback can safely preserve sessions and invitations.
- Update [SECURITY.md](./SECURITY.md) only after a phase is deployed and verified; remove that item from this roadmap at the same time.
- The Admin repository must carry a matching copy of applicable phases before work begins, because it is separately deployed.

## Definition of High-Security Production Readiness

Production readiness requires at least:

- Phase 1 completed and independently verified.
- Redis-backed rate limits, centralized redacted audit logs, and actionable alerts from Phase 2.
- A documented, tested incident response and backup-restore procedure.
- A security review of the final hosting, Atlas role, DNS, TLS, secret, and access-gateway configuration.

Phases 3 through 6 progressively improve resilience and should be planned immediately after launch unless the application processes especially sensitive or regulated data, in which case they should move ahead of production release.
