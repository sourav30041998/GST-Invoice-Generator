# Company-Owned Email Connections

## What This Release Does

Company Profile > Company Email supports two outgoing-email connections:

| Option        | Sender                                              | Authorization                                                 | Inbox access |
| ------------- | --------------------------------------------------- | ------------------------------------------------------------- | ------------ |
| Gmail         | The Google account actually authorized by the owner | Google web-server authorization, send-only Gmail scope        | None         |
| Custom domain | A verified address on a company-owned domain        | That company's dedicated Brevo API key and DNS authentication | None         |

The domain can be registered or hosted anywhere. It does not need to be bought
from Brevo. This version uses Brevo as the domain **delivery provider**; it does
not implement arbitrary SMTP servers or every email-provider API. A Google
Workspace mailbox can also connect through the Google option when its policies
permit Gmail API access.

Existing booking confirmations, cancellation notices and both advance-receipt
PDF attachments now use `sendOrganizationEmail(organizationId, mail)`. WhatsApp
delivery and both receipt layouts are unchanged. Invoice PDF downloads remain
unchanged; there was no invoice-email endpoint in this branch. A future invoice
email action must generate its attachment and resolve its customer recipient on
the server, then call the same organization email service. Do not add a generic
browser-controlled mail relay or accept arbitrary uploaded invoice HTML.

**Rollout change:** customer emails require a connected, verified organization
sender. There is deliberately no fallback to platform SMTP. Bookings and payments
can still be saved and their receipts downloaded while email setup is pending.
Notification failures are returned separately from the saved booking/payment.

The separate Platform Admin service is not changed. Company invitation and
password-recovery messages still use the Company's existing platform SMTP
configuration. A revoked customer-email connection must never disable password
recovery.

## Gmail Setup: Platform Operator

1. Create a **dedicated Google Cloud project** for this feature. Do not share an
   OAuth project that requests Gmail read/modify, Drive, or other permissions.
2. Enable the Gmail API. Configure the OAuth consent screen with the application
   name, support contact, privacy policy, authorized domains and audience.
3. Create an OAuth client of type **Web application**. Add the exact authorized
   redirect URI below, using the Company application URL, not the Admin URL:

   ```text
   Local:      http://localhost:5173/email-connect
   Production: https://YOUR-COMPANY-SERVICE.onrender.com/email-connect
   ```

4. Configure these two server-side variables together in the Company's local
   root `.env` or Render Environment panel:

   ```dotenv
   GOOGLE_EMAIL_CLIENT_ID=<Google web-client ID>
   GOOGLE_EMAIL_CLIENT_SECRET=<Google client secret>
   ```

5. Keep `COMPANY_APP_ORIGIN` as the exact application origin, without a trailing
   slash or path. `CLIENT_ORIGIN` must trust that origin. The application derives
   the callback URI as `${COMPANY_APP_ORIGIN}/email-connect`; no arbitrary
   browser-supplied redirect is accepted.
6. Restart the Company server after environment changes. A frontend-only reload
   does not reload server environment variables. Use the configured local port;
   if Vite moves to another port, use the configured port or update both Google
   and Company origin configuration to match.
7. During testing, add intended accounts as test users in Google's consent
   configuration. Before general production use, complete Google's required
   sensitive-scope verification and publish appropriately. `gmail.send` is a
   sensitive scope. External applications left in Testing generally receive
   seven-day refresh tokens for this feature, so Testing is not a sustainable
   production setup. See [Gmail scope classifications](https://developers.google.com/workspace/gmail/api/auth/scopes)
   and [Google's OAuth lifecycle documentation](https://developers.google.com/identity/protocols/oauth2).

Do not commit Google credentials, put them in `VITE_` variables, paste them into
logs, or reuse them as database/session/encryption secrets. No Gmail app password
is used by this feature. Google authenticates the mailbox owner itself.

## Gmail Setup: Company Owner

1. Sign into the Company portal and open Company Profile > Company Email.
2. Choose **Connect Gmail**, enter the business sender name and re-enter your
   **Company account password**, not your Gmail password.
3. Continue to Google, select the business Gmail account, and review consent.
4. Approve sending permission and email-identity verification. The application
   rejects tokens with broader mailbox scopes. No inbox listing, message read,
   search, attachment read, deletion or contacts API is implemented.
5. Google returns you to Company Profile. The screen shows the connected email
   address. The identity comes from a verified Google ID token, not a typed From
   address.
6. Choose **Send test email**, confirm, and re-enter the Company password. One
   message goes to the connected sender itself, never an arbitrary customer.
7. Existing booking and receipt send actions now use this sender automatically.

The precise scope set is `openid`, `email`, and
`https://www.googleapis.com/auth/gmail.send`. Google may report the equivalent
`https://www.googleapis.com/auth/userinfo.email` identity scope. Identity access
is necessary to establish which address is authorized; it is not inbox access.
The app does not silently request broader scopes if sending fails.

## Custom Domain Setup: Company Owner

1. Own the domain and have access to its DNS records. Keep the registrar and
   existing mailbox provider; no domain transfer is necessary.
2. Create/use the organization's Brevo delivery account and enable transactional
   sending. Create a dedicated API key for this integration. Use a separate
   account/key per organization, not a shared platform-wide key.
3. In Company Profile > Company Email, choose **Use your domain**. Enter a sender
   name, the sender address (for example `bookings@yourhotel.com`), the Brevo API
   key, and the Company account password. The API key is write-only in the UI.
4. Save the connection. The server checks that delivery account and creates the
   domain in it when needed. If not yet authenticated, the UI displays the
   provider's DNS records and their individual verification states.
5. Add the exact records at the domain's DNS provider. Do not delete existing
   mailbox/MX records, create duplicate SPF/DMARC records, or replace an existing
   DMARC policy blindly. Consult the provider's instructions for merging records
   and authenticating subdomains. Protect DNS-provider access with MFA.
6. Select **Verify domain & sender** after DNS propagation. Re-enter the Company
   password. The server refreshes domain authentication and, once authenticated,
   registers the sender if necessary. Brevo may send a verification email to that
   sender; complete it in Brevo if required, then verify again in the application.
7. Both domain verification/authentication and the exact sender's active state
   must pass. A different address, an inactive sender, or an unrelated domain is
   not accepted. Domain and sender status are checked again before each send.
8. Send a test to the connected address, then test a booking with an authorized
   test customer. The provider may impose account-approval and sending limits.

Official references: [domain authentication](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC),
[domain configuration API](https://developers.brevo.com/reference/get-domain-configuration),
[sender registration](https://developers.brevo.com/reference/create-sender).

## Replies and No-Reply Addresses

From and Reply-To are both the verified connected address. Replies go directly to
the organization's mailbox provider, never to an inbox in this application. If
the organization prefers an unmonitored address, it can configure and verify a
domain sender such as `no-reply@yourhotel.com`. The name "no-reply" is only a
convention: it cannot prevent a recipient from replying. Mailbox acceptance,
auto-replies and monitoring are configured at the mailbox provider.

For Gmail, the app must send as the authorized account. It does not invent Gmail
aliases or send as a different Gmail address. The printed PDF's contact email
still comes from the business profile; update that contact field separately if
it should match the outgoing sender.

## Database and Tenant Boundaries

New Company-database collections:

| Collection                     | Fields and purpose                                                                                                                                                                        | Indexes                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `organizationemailconnections` | `_id` equals organization ID; immutable `organizationId`; provider; status; encrypted `protectedData`; random revision; verified/last-accepted timestamps; updatedBy; createdAt/updatedAt | Unique organizationId; intrinsic unique _id     |
| `emailoauthchallenges`         | HMAC state as _id/stateHash; organizationId; userId; HMAC session binding; encrypted verifier/nonce/sender name/prior revision; expiresAt                                                 | Unique stateHash; organizationId; TTL expiresAt |
| `emailthrottles`               | HMAC tenant/purpose/time-bucket key as _id/key; count; expiresAt                                                                                                                          | Unique key; TTL expiresAt                       |

Encrypted connection data includes sender identity and either the Gmail refresh
token/Google subject or the Brevo API key/DNS metadata. AES-256-GCM authenticates
the tenant ID and purpose as additional data using the existing
`DATA_ENCRYPTION_KEY`. Credentials have Mongoose `select:false` and are explicitly
selected only by the email service. Responses use an allowlisted DTO and never
include credentials, ciphertext, token claims or raw provider responses.

There is at most one active/pending connection per company. Disconnect before
changing sender/provider. Credentials are not inherited between companies, and
browser-supplied tenant IDs are rejected. Existing customer and booking
collections retain their established tenant relationships and encrypted PII.

## API Contracts

Base URL: `<company-origin>/api/organization-email`.
All routes require the normal authenticated Company owner session. Mutations
also require the existing trusted-Origin and `X-CSRF-Token` checks.

| Method | Path              | JSON body                                                                                                                             | Result                                                        |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| GET    | `/`               | None                                                                                                                                  | Sender/status/DNS DTO; Gmail availability; no credentials     |
| POST   | `/gmail/start`    | `{ "senderName": "Example Hotel", "password": "<company-password>" }`                                                                 | Fixed Google authorization URL                                |
| POST   | `/gmail/complete` | `{ "code": "<one-use-code>", "state": "<opaque-state>" }`                                                                             | Connected sender DTO; intended for the app's return flow      |
| POST   | `/domain`         | `{ "senderName": "Example Hotel", "senderEmail": "bookings@example.com", "apiKey": "<brevo-key>", "password": "<company-password>" }` | Pending/connected sender DTO                                  |
| POST   | `/domain/verify`  | `{ "password": "<company-password>" }`                                                                                                | Refreshed verification DTO                                    |
| POST   | `/test`           | `{ "password": "<company-password>" }`                                                                                                | Test submission message; only connected sender is a recipient |
| DELETE | `/`               | `{ "password": "<company-password>" }`                                                                                                | Disconnect/revocation result                                  |

The callback page is `<company-origin>/email-connect`, served by the frontend.
It immediately removes the authorization query from the address/history and
keeps it only in memory. After the normal Company session is checked, it submits
the one-use result to `/gmail/complete` with CSRF protection. This works with a
Strict session cookie without weakening its policy for a cross-site callback.
No OAuth tokens are returned to browser storage. React StrictMode does not cause
a duplicate exchange.

## Security Controls and Limitations

- Owner password reauthentication is required for connecting, domain verification,
  test sends and disconnection. Five such requests are allowed per owner/company
  per 15-minute fixed window, including successful requests.
- Google authorization uses the official Google auth library, authorization code
  flow, S256 PKCE, a nonce, exact configured redirect, audience/issuer/signature
  and verified-email checks. State is random, HMAC-stored, session/user/tenant
  bound, expires after ten minutes, and is consumed atomically. Queries enforce
  expiry even before the MongoDB TTL cleanup runs.
- Connection revisions prevent an older callback or verification operation from
  overwriting a newer connection. Only one pending flow per owner is retained.
- Provider HTTPS URLs are hardcoded; redirects are refused for delivery requests.
  There is no arbitrary SMTP-host/URL input, local file attachment, URL attachment,
  browser-selected recipient, CC/BCC or arbitrary mail-body endpoint.
- Mongo-backed limits survive restarts: 100 send attempts/hour and 300/day per
  company, three test attempts/hour, ten DNS checks/hour. Additional existing
  HTTP/notification rate limits apply. Provider limits may be lower and may also
  count emails sent outside this app.
- The active organization and connection revision are checked before submission.
  Revoked/invalid authorization requires attention; unverified or disconnected
  senders cannot send. An already in-flight provider request cannot be recalled.
- Audit events record tenant, actor, action and provider, not email bodies,
  credentials or customer identities. Existing notification records retain
  hashed recipients and encrypted provider references.
- Password/key inputs are cleared after submission, and API errors remain in
  the open modal until dismissed. Browser-native modal dialogs make the rest of
  the page inert. HTTPS is still mandatory: an authorized browser can inspect
  its own submitted values; hiding DevTools is not a security boundary.
- A compromised server with both database and encryption key can decrypt stored
  authorization. Restrict infrastructure/operator access, protect Google/Brevo
  accounts, encrypt backups, monitor abuse, and rotate/revoke credentials after
  an incident. Encryption is not protection against a fully compromised server.
- A Gmail token grants sending capability and must be protected against misuse
  even though it cannot read mail. Brevo API keys may carry broader account
  privileges than this adapter uses; use a dedicated transactional delivery
  account/key and provider-side restrictions where available. This app does not
  call Brevo contacts/campaign/inbox APIs or import customer lists into Brevo.
- Gmail disconnection deletes the locally usable token and attempts Google
  revocation. If revocation is unconfirmed, the UI directs the owner to remove
  the application's access in their Google Account. Brevo disconnection removes
  the stored key; revoke that dedicated key in Brevo separately. Connecting the
  same Google account to multiple companies is discouraged because Google
  revocation can affect the shared account/client grant.

## Delivery Status, Failures and Costs

"Sent" in the existing booking activity means the provider accepted the email,
not that the recipient opened it or even that it reached the inbox. This release
does not consume bounce/delivery webhooks or read mailboxes. Network timeouts can
leave delivery uncertain: check the provider before retrying. Submission is not
automatically retried. Existing booking notification idempotency and explicit
resend confirmation remain in place; exactly-once external email delivery cannot
be guaranteed if a provider accepts a message and the process fails before the
local status is saved.

Brevo currently offers [300 emails/day on its free plan](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan).
Gmail has [account sending limits](https://support.google.com/mail/answer/22839?hl=en)
and [API quotas](https://developers.google.com/workspace/gmail/api/reference/quota).
These are low-volume options, not an unlimited or guaranteed-free service.
Domain registration/mailbox services may cost money. Both new delivery adapters
use HTTPS port 443, independent of Render's SMTP-port restrictions. Existing
platform security email still needs its own working SMTP relay.

## Deployment and Verification

1. Back up the Company database and existing encryption key securely. Never
   replace `DATA_ENCRYPTION_KEY` blindly: existing protected records require it.
2. Install locked dependencies with `npm ci --ignore-scripts --include=dev`.
3. Run `npm run typecheck`, `npm test`, `npm run build` and `npm audit --omit=dev`.
4. Run `npm run db:create-indexes` using the deployment/index-management database
   credential. Grant the runtime account CRUD on the three new Company
   collections, not access to the separate Admin database. This feature requires
   no migration of existing customers, bookings or administrators.
5. Configure the optional Google variables in the **Company service only** and
   deploy. The custom-domain option uses encrypted per-company credentials, not
   a shared environment API key. Do not alter Admin SMTP for this feature.
6. Connect an owner-controlled test account/domain. Authorize and send a test,
   then a booking confirmation and advance receipt to an approved test recipient.
   Check both PDF attachments, From/Reply-To and the company's Sent/provider log.
7. Test cancellation, failed consent, expired consent, invalid key, inactive
   sender, unverified DNS, wrong password, disconnected sender and suspension.
   Test two companies to confirm one cannot see/use the other's connection.
8. Verify reconnect/disconnect and manually check provider revocation. Publish
   Google's consent app appropriately before onboarding external companies.

Automated coverage is in `server/src/utils/organizationEmail.test.ts`. It mocks
provider requests and database method boundaries; it does not replace live Atlas
integration tests or a provider consent/delivery test. The existing test suite
also covers tenant-bound encryption and booking notification replay validation.

`scripts/check-organization-email-ui.mjs` tests the running local frontend with
all application API calls intercepted. It checks desktop/mobile sizing, native
modal locking, persistent errors, cleared secret inputs, DNS wrapping, explicit
test-send confirmation and one-use OAuth completion. It requires Playwright
with an Edge browser (`PLAYWRIGHT_CHANNEL` can choose another installed channel).
Screenshots are written under `output/organization-email`. It never contacts a
real customer or modifies application records.

Live Google consent, DNS changes and real customer delivery require operator/
owner configuration and authorization. They are not claimed as verified by the
mocked test suite.
