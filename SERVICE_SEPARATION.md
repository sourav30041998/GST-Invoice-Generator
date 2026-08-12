# Company and Platform Service Separation

The Company application and Platform Admin application are deployed from separate repositories and hosts.

- Company repository: invoice creation, company-user authentication, invitation redemption, and tenant data.
- Platform Admin repository: platform MFA, organization invitations, organization status, and platform audit records.

The Company API deliberately has no `/api/platform/*` routes. It exposes only signed, time-limited `/api/internal/*` operations for the Admin service. The Platform Admin repository contains its own `SECURITY_BOUNDARY.md` with required secret management, MongoDB roles, and cutover steps.
