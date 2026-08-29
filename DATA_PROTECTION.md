# Company Data Protection Design

## Security Boundary

The Company service authenticates one owner into exactly one organization. Every invoice, room, profile, and audit query derives `organizationId` from the server-side session; the browser cannot select a tenant.

The browser is an endpoint, not a secret vault. A signed-in owner can inspect every value the UI receives through Developer Tools. Obfuscation, client-side hashing, or encrypting an API response with JavaScript would not change that because the browser must also receive the decryption key. Never treat a CSRF token, database ID, or ciphertext as an authorization decision.

## Protected At Rest

AES-256-GCM envelopes protect:

- guest/payee name, GSTIN, address, state, confirmation number, and group;
- company GSTIN, address, contact details, UPI, and bank details;
- the printable preset and business snapshots copied into invoices and drafts.

Each encryption uses a fresh 96-bit IV and an authentication tag. Additional authenticated data binds the envelope version, record type, and organization. MongoDB stores an `enc1.<iv>.<tag>.<ciphertext>` envelope plus non-sensitive operational fields needed for status, date, amount, room, and invoice-number workflows.

Audit entries redact protected values and keep actor IDs, action, entity, status, timing, and non-sensitive workflow evidence. Session and invitation/recovery tokens continue to be one-way HMAC hashes rather than encrypted reversible values. Passwords remain one-way password hashes and are never encrypted.

## Intentionally Visible

The authenticated detail endpoints decrypt fields needed to edit an invoice, create a PDF, or edit the company profile. Invoice list endpoints return a narrow summary. Authentication responses omit user email and internal IDs, but return the display name, organization name, CSRF token, and session expiry required by the UI.

Login email and organization name remain lookup metadata in MongoDB. They are protected by the Atlas account boundary, least-privilege database user, backups, TLS, and application authorization. Encrypting login identifiers requires a separate blind-index migration and key lifecycle; it must not be improvised because it affects login, invitation uniqueness, recovery, and internal provisioning.

## Compromise Scenarios

- Database export only: protected customer and financial fields remain ciphertext if the encryption key is kept separately.
- Network interception: production HTTPS protects request and response bodies in transit.
- Stolen authenticated browser session: the attacker can access what that owner can access until the session expires or is revoked. Idle/absolute limits reduce this window.
- Server plus environment compromise: the attacker can use the encryption key. Rotate application/database credentials, revoke sessions, restore trusted code, and perform a planned data-key rotation.
- Unlocked device, malicious extension, or endpoint malware: it may read login/API data in the browser. Application cryptography cannot secure a compromised endpoint.

Organization MFA is deliberately not implemented in this branch, per the current product decision. It remains a recommended later control for account takeover resistance.
