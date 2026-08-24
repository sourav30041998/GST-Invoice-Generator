# Company and Platform Service Separation

The Company application and Platform Admin application are deployed from separate repositories and hosts.

- Company repository: invoice creation, company-user authentication, invitation redemption, and tenant data.
- Platform Admin repository: platform MFA, authenticated operator commands, and platform audit records.

Company is the source of truth for organizations and invitations. It generates
and hashes invitation tokens, sends invitation email, enforces onboarding and
organization status, and revokes Company sessions. Admin never has Company
MongoDB or SMTP credentials.

The Company API deliberately has no `/api/platform/*` routes. It exposes only
signed, time-limited, replay-protected `/api/internal/*` operations for Admin.
See [SERVICE_DATABASE_ISOLATION.md](./SERVICE_DATABASE_ISOLATION.md) for the
endpoint allowlist, idempotency rules, database ownership, and cutover steps.
