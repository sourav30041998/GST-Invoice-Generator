# Customer and Booking Architecture

## Scope

This feature separates customer identity, pre-arrival bookings, advance payments,
receipts, notifications, room occupancy, and invoices. Every record belongs to one
organization. A company user cannot select another organization in an API request;
the server takes the organization ID only from the authenticated session.

## Simple Booking Workflow

1. Create or select a customer. Name and phone are required; email is optional.
2. Record arrival, departure, occupancy, requested room combinations, an optional
   estimated total, and the advance payment received. A request such as one 4-bed
   room and one 2-bed room describes customer preference without identifying an
   actual inventory room.
3. The server creates the confirmed booking and append-only payment receipt in one
   MongoDB transaction. A booking cannot be confirmed without an advance.
4. When the customer has an email address and email delivery is selected, the
   server sends the confirmation with an advance-receipt PDF attachment.
5. No room is selected during booking. Staff assign available rooms later while
   preparing the linked invoice or check-in record.

## Collections

### `customers`

- `organizationId`: immutable tenant owner.
- `phoneLookupHash`: keyed deterministic hash used by the unique tenant/phone index.
- `searchTokens`: keyed hashes for directory prefix search.
- `protectedData`: AES-256-GCM envelope containing name, canonical phone, email,
  address, state, internal notes, and WhatsApp transactional-consent evidence.
- `status`, `version`, creator/updater IDs, and timestamps.

The phone uniqueness boundary is `{ organizationId, phoneLookupHash }`. The same
person may therefore be a customer of two independent organizations without those
organizations learning about each other.

### `bookings`

- Tenant and customer references.
- Unique organization-scoped confirmation number.
- Stay dates, occupancy, encrypted requested room combinations, and room snapshots
  once actual rooms are assigned later.
- A confirmed booking may have no room assignment. The first linked invoice adopts
  the selected rooms inside the invoice transaction; an existing booking room
  assignment cannot silently be replaced by different invoice rooms.
- Enquiry, awaiting-advance, confirmed, cancelled, and completed states.
- Estimated amount stored as integer paise.
- Transactionally maintained advance balance stored as integer paise.
- Keyed creation-idempotency hash so an interrupted response cannot create a second
  booking when the user retries.
- Encrypted notes and the exact terms snapshot accepted for that booking.
- Optional issued-invoice reference.

### `bookingpayments`

Payments are append-only ledger entries. Amounts are positive integer paise and the
entry type determines whether they are an advance or refund. A client-generated UUID
is converted to a keyed idempotency hash, preventing duplicate receipts when a user
retries a timed-out request. Corrections must use a compensating entry; historical
payment records are not overwritten. Each ledger write also updates the booking's
running balance in the same transaction. Optimistic concurrency makes simultaneous,
different payment requests retry against the latest balance instead of both passing
validation against an old value.

### `roomnightlocks`

One document represents one room and one occupied night. The unique index on
`organizationId + roomId + stayDate` is the final concurrency guard. Availability
checks improve the error message, while this unique index prevents two simultaneous
requests from assigning the same room. The simple booking path creates no room lock.
When rooms are selected during invoicing, invoice allocation and booking linking run
inside the same MongoDB transaction.

### `bookingnotifications`

Stores delivery status and a keyed recipient hash, but not the email address, phone
number, message body, SMTP password, WhatsApp token, or provider response in
plaintext. Provider references are encrypted. A per-channel idempotency hash is
inserted before contacting the provider, so a replay cannot send the same request
twice. WhatsApp attempts retain an encrypted consent-timestamp snapshot, while
customer audits record opt-in and revocation changes. Failed deliveries do not roll
back a valid booking or payment. Booking responses contain the latest successful
email and WhatsApp timestamps so the UI can show delivery state. A second delivery
is rejected unless the request explicitly carries the resend approval produced by
the blocking confirmation dialog.

## API Surface

All endpoints require an authenticated company session. Unsafe methods also require
the session CSRF token and a trusted browser origin.

| Method   | Endpoint                                               | Purpose                                                          |
| -------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| `POST`   | `/api/customers/search`                                | Paginated, tenant-scoped directory search without PII in the URL |
| `POST`   | `/api/customers/lookup`                                | Exact canonical-phone lookup without PII in the URL              |
| `POST`   | `/api/customers`                                       | Create a unique customer                                         |
| `GET`    | `/api/customers/:customerId`                           | Read one tenant customer                                         |
| `PATCH`  | `/api/customers/:customerId`                           | Update with optimistic version check                             |
| `DELETE` | `/api/customers/:customerId`                           | Deactivate when no open booking exists                           |
| `GET`    | `/api/bookings`                                        | Paginated bookings, optionally by customer/status                |
| `POST`   | `/api/bookings`                                        | Atomically create confirmed booking and advance receipt          |
| `GET`    | `/api/bookings/:bookingId`                             | Read one booking                                                 |
| `PATCH`  | `/api/bookings/:bookingId`                             | Transition/update an un-invoiced booking                         |
| `GET`    | `/api/bookings/:bookingId/payments`                    | Read append-only payment history                                 |
| `POST`   | `/api/bookings/:bookingId/payments`                    | Record advance/refund idempotently                               |
| `GET`    | `/api/bookings/:bookingId/payments/:paymentId/receipt` | Receipt data                                                     |
| `POST`   | `/api/bookings/:bookingId/notifications`               | Send approved email/WhatsApp content                             |

Invoice create/update payloads may include `customerId`, `bookingId`, `partyPhone`,
and `partyEmail`. Issued invoice customer and booking references cannot be changed.
The server requires `customerId` for every newly created invoice or draft; this is
not merely a UI rule. It also verifies that the supplied phone resolves to the same
tenant customer, preventing a forged customer ID from being paired with another
person's invoice details. Legacy invoices and drafts without a customer reference
remain readable and can still be maintained for backward compatibility.

## Progressive Customer Profiles

- Name and phone are the only mandatory fields at customer creation. Email, address,
  state, and internal notes are optional and can be captured when the guest proceeds
  with a stay.
- An invoice always stores an encrypted point-in-time party snapshot. Updating a
  customer's current address never rewrites an earlier invoice.
- When invoice email, address, or state differs from the selected customer's current
  profile, the UI presents a separate profile-update choice. Existing profile data
  is never replaced silently. A missing profile may opt in by default, while a
  changed existing address requires an explicit choice.
- Profile synchronization includes the customer's expected version and runs in the
  same MongoDB transaction as the invoice save. A concurrent profile edit returns
  `409` and rolls back the invoice operation instead of overwriting newer data.
- Customer names are not synchronized from invoice payee names because a payee may
  be a company or another billing party. Identity changes use the dedicated customer
  edit operation.
- The customer audit records changed field names, source invoice ID, actor, and
  version only. It does not copy the address or other PII into audit documents.

## Security Controls

1. **Tenant authorization:** every database query includes the session-derived
   `organizationId`; request-body tenant IDs are not accepted.
2. **Encryption at rest:** customer contact fields, booking notes/terms, payment
   references, requested room combinations, and provider references use
   authenticated AES-256-GCM envelopes with tenant and record-scope associated data.
3. **Private lookup:** exact phone uniqueness and customer prefix search use keyed
   HMAC tokens. A database-only compromise does not reveal their plaintext inputs.
4. **Transport:** production requires HTTPS, secure host-only session cookies, and
   TLS-capable Atlas and SMTP connections.
5. **Request protection:** strict Zod allowlists, bounded strings/arrays/amounts,
   trusted-origin enforcement, CSRF, global API rate limits, and a tighter delivery
   rate limit. A per-booking ledger-entry ceiling prevents an authenticated client
   from creating an unbounded payment response or document set. Requested-room rows,
   room quantities, beds per room, and aggregate room counts are independently
   bounded; requested bed capacity must cover occupancy.
6. **Financial integrity:** paise integers, MongoDB transactions, optimistic
   concurrency, booking/payment/notification idempotency keys, non-destructive
   payment history, and unique receipt numbers. The transactionally maintained
   balance prevents concurrent advances from exceeding the estimated booking total.
7. **Room integrity:** checkout-exclusive stay dates, maximum 365-night bookings,
   deferred room assignment, legacy allocation checks, and atomic unique night
   locks when the invoice assigns rooms.
8. **Logging:** request bodies are never logged. Audit snapshots redact customer,
   financial, recipient, search-token, and protected-envelope fields.
9. **Data minimization:** customer directory responses contain name, masked phone,
   status, version, and booking count only. Full contact data is decrypted and sent
   only after one customer is deliberately selected or exactly matched by phone.
   List APIs also omit lookup hashes, search tokens, encryption envelopes, creator
   IDs, provider details, and tenant IDs. Booking lists omit decrypted internal notes
   and terms; those fields are returned only by explicit detail and receipt requests.
10. **External delivery:** SMTP and WhatsApp secrets remain server-only environment
    variables. WhatsApp is disabled unless every required variable is present.
    Server-side state checks prevent an enquiry from being represented as confirmed
    and prevent cancellation notices for active bookings. WhatsApp delivery is also
    blocked unless encrypted customer consent is currently recorded.
11. **Internal room privacy:** assigned room numbers, assigned room types, and room identifiers are
    excluded from booking emails, WhatsApp messages, cancellation notices, advance
    receipts, and receipt PDFs. Customer-requested room combinations may be shown,
    but allocation remains in the authenticated invoice/check-in workflow.
12. **Receipt generation:** the modern advance receipt and the reference-style
    booking slip are generated in server memory, attached as bounded application/pdf
    payloads, and never written to temporary storage. Both contain only
    customer-facing booking and payment fields, including requested room combinations
    but never actual room IDs or assigned room numbers. Browser downloads provide the
    same two formats without storing either document in browser storage.
13. **Delivery replay control:** successful delivery timestamps come from the
    tenant-scoped notification ledger. The client blocks concurrent clicks, the API
    preserves idempotent retries, and a new delivery after success requires an
    explicit `allowResend` decision from the confirmation dialog.

## WhatsApp Template Contract

The three configured WhatsApp utility templates must accept these body parameters in
order: customer name, confirmation number, receipt number (or `-`), arrival date,
departure date, a fixed room-assignment notice, advance amount, and the saved terms
snapshot. The sixth parameter must never contain room numbers, room types, or room
IDs. Template
names are configured with
`WHATSAPP_TEMPLATE_CONFIRMATION`, `WHATSAPP_TEMPLATE_RECEIPT`, and
`WHATSAPP_TEMPLATE_CANCELLATION`. Update `WHATSAPP_API_VERSION` during provider
version upgrades. Never prefix a WhatsApp secret with `VITE_`.

## Operations

### Company Profile Changes and PDFs

- Save changes in Company Profile before generating a new PDF. Invoice History
  fetches the authorized invoice and the latest company settings for every download,
  including changes saved in another browser tab. The current name, tagline, logo,
  GSTIN, address, contacts, bank details and invoice terms are used. Cleared optional
  fields stay cleared; they do not fall back to the invoice's older profile.
- If the settings request fails, the invoice PDF is not generated using stale data.
  The download control is disabled during generation to prevent duplicate clicks.
- The Editorial Letterhead (design 03) uses a serif company name, a burgundy vertical
  accent and a small optional logo on the right, preserving its aspect ratio.
  Contacts are unframed beneath the company name; the invoice reference is on the
  right, with GSTIN and issue date below a fine divider. Long names and contact
  values wrap without truncation. Missing fields are omitted, and an unreadable
  logo is omitted without blocking the invoice. Receipt layouts are unchanged.
- Invoice PDFs are single-page A4 documents. Totals sit beside the amount in words
  and bank details; the guest and hotel Authorised Signatory sections share the
  closing row. The hotel block includes the current company name, 18 mm of writing
  space and a signature line. The renderer makes one compact retry for normal
  content; it then stops the download with a clear message if the invoice still
  cannot fit without reducing legibility. It never creates a second page or clips
  data. The signatory field is blank: no signature image, signing key, staff identity
  or automatic approval is stored or applied, and the PDF is not digitally signed.
- Rule 46(q) generally requires supplier/representative authentication, with an
  exception for qualifying IT Act electronic invoices. Confirm applicability with
  the hotel's GST adviser; a blank signature field is not authentication or proof
  of compliance. See the [official CGST Rules, Rule 46](https://gstcouncil.gov.in/sites/default/files/2024-04/01062021-cgst-rules-2017-part-a-rules.pdf).
- Stored invoice snapshots are retained for audit, not rewritten. Invoice numbers,
  dates, customer details, charges and totals remain those of the saved invoice.
  Changing the company invoice prefix does not renumber existing invoices. A newly
  generated PDF is therefore not necessarily an exact copy of an earlier download.
- Both advance-receipt download formats already obtain the current tenant's profile
  from the receipt endpoint. Email messages and their two PDF attachments obtain it
  on each new send. Their existing layouts are unchanged. Booking terms remain the
  agreement saved with that booking, not the company's current invoice terms.
- Existing downloaded PDFs and previously delivered email attachments cannot change;
  download again, or explicitly resend, to obtain the current company details.
- No new public endpoint or database migration is needed. Tenant-scoped queries,
  encrypted profile storage and authenticated API access remain in place. Regression
  tests use synthetic records and mocked SMTP, never live customer data or email.

Verification:

```sh
npm run typecheck
npm test --workspace server
npm run build
node scripts/check-document-profile-ui.mjs
```

The browser check requires a local frontend (default `http://localhost:5173`),
Playwright, Edge and PDF.js. `UI_TEST_ORIGIN`, `PLAYWRIGHT_CHANNEL`,
`PLAYWRIGHT_MODULE` and `PDFJS_MODULE` can override these defaults. Module overrides
accept file URLs to existing local installations. Test PDFs are written only to the
ignored `output/document-profile/` directory. The checks cover profile save/download,
fresh profile and logo reads, field clearing, failed refresh, long text wrapping,
square/wide/tall and invalid logos, minimal headers, single-page invoice output,
oversized-content blocking, both receipt formats and email PDF generation. The
server regression additionally
checks tenant isolation and preservation of booking and payment data.

### Deployment Checklist

1. Run `npm run build` before deployment.
2. Run `npm run db:create-indexes` against the production company database before
   enabling customer traffic. Index creation is mandatory for phone uniqueness,
   receipt idempotency, booking references, and room-night exclusivity.
3. Back up `DATA_ENCRYPTION_KEY` in a secrets manager. Losing it makes protected
   customer and receipt data unrecoverable. Do not rotate it without a versioned
   re-encryption migration.
4. Use an Atlas role limited to the company database. Do not reuse the platform-admin
   database credential.
5. Verify SMTP sender ownership and approved WhatsApp utility templates in a staging
   organization before production.
6. Monitor notification failure counts without logging recipients or message bodies.

## Deliberate Boundaries

- An authorized browser must receive data that it displays. That selected customer's
  response can therefore be inspected by that signed-in user in browser developer
  tools; JavaScript cannot securely conceal it. The controls are tenant authorization,
  least-data responses, exact lookup, `Cache-Control: no-store`, TLS, short sessions,
  audit logs, and limiting staff access, not client-side obfuscation.

- The owner role can currently access all customers in its own organization. Finer
  front-desk/accounting roles should be added before multiple staff accounts are
  introduced.
- Marketing consent and campaign reporting are not inferred from booking data. Add
  explicit consent fields and retention rules before any campaign feature.
- The WhatsApp flag authorizes transactional booking messages only. It is not consent
  for marketing, profiling, or campaigns.
- Both downloaded receipt formats are generated in the authenticated browser and are
  not placed in browser storage. Both emailed receipt formats are generated in server
  memory and are not written to disk.
- Terms are organization-controlled snapshots, not legal advice. Each organization
  must review its cancellation and refund language.
