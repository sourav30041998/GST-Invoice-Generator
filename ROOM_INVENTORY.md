# Room Inventory and Allocation

## Purpose

This feature replaces the invoice `Room No.` free-text field with a room directory owned by each organization. A company can create room identifiers that match its property, select one or more rooms on an invoice, and prevent an active room from being allocated to overlapping stays.

There is no shared hotel inventory and no fixed business room count. The application has a protective technical ceiling of 10,000 rooms per organization to prevent accidental or malicious storage abuse; raise that limit deliberately if a deployment genuinely requires it.

## User Experience

1. An organization owner opens **Room Directory** and adds rooms such as `101`, `A-201`, `Villa / 7`, or `Conference-1`.
2. The owner can set optional type, floor, wing, and capacity, then edit or deactivate a room later.
3. The booking board in Room Directory displays every configured room against a selected date range. A booking bar shows its arrival-to-departure interval and opens its invoice/status detail when selected.
4. In a new invoice, after Arrival and Departure are valid, the Room picker fetches only active rooms available to the signed-in organization for that date range.
5. One invoice can select multiple rooms. The invoice stores each chosen room number/type as a historical snapshot.
6. The invoice lifecycle is `Draft -> Reserved -> Checked In -> Checked Out`, with `Cancelled` as the terminal exception state.
7. Drafts do not lock inventory. `Reserved` and `Checked In` create an active lock. `Checked Out` retains historical allocation; `Cancelled` releases the lock.

## Tenant Boundaries

The server reads `organizationId` only from the opaque, authenticated session. It never accepts an organization ID from the request body, route, or query string. Every room and allocation query includes that trusted organization value.

Consequences:

- An owner sees only rooms created by their organization.
- Guessing another tenant's room or invoice ObjectId does not grant access.
- Availability results are tenant-scoped even if a browser alters request parameters.
- A room selection is resolved again on the server before an invoice is stored. The submitted display name is never trusted.

## Collections

### `rooms`

| Field                                                       | Notes                                                       |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| `organizationId`                                            | Immutable Organization reference; tenant boundary.          |
| `roomNumber`                                                | Display code created by the organization.                   |
| `normalizedRoomNumber`                                      | Uppercase, whitespace-normalized value used for uniqueness. |
| `roomType`, `floor`, `wing`, `capacity`                     | Optional business metadata.                                 |
| `isActive`                                                  | Soft-deactivation flag; historical data remains intact.     |
| `createdByUserId`, `updatedByUserId`, timestamps, `version` | Audit and optimistic-concurrency metadata.                  |

Indexes:

```text
{ organizationId, normalizedRoomNumber } unique
{ organizationId, isActive, roomNumber }
```

### `roomallocations`

| Field                                   | Notes                                                  |
| --------------------------------------- | ------------------------------------------------------ |
| `organizationId`, `roomId`, `invoiceId` | Tenant, room, and invoice references.                  |
| `invoiceNumber`, `roomNumberSnapshot`   | Readable immutable-at-write history.                   |
| `checkinDate`, `checkoutDate`           | ISO local dates; checkout is the first free day.       |
| `status`                                | `reserved`, `checkedIn`, `checkedOut`, or `cancelled`. |
| actor IDs and timestamps                | Traceability for allocation writes.                    |

Indexes:

```text
{ organizationId, invoiceId, roomId } unique
{ organizationId, roomId, status, checkinDate, checkoutDate }
{ organizationId, status, checkinDate, checkoutDate }
{ organizationId, invoiceNumber }
{ organizationId, roomId, createdAt }
```

### `invoices` and `invoicedrafts`

Both documents retain `rooms` as a snapshot array:

```json
[
  {
    "roomId": "MongoDB ObjectId",
    "roomNumber": "A-201",
    "roomType": "Deluxe"
  }
]
```

`roomNo` remains a derived, comma-separated legacy/display field. The server builds it from trusted room records; it is not accepted from the invoice request payload.

## API Contract

All endpoints are under `/api/rooms`, require an authenticated organization session, and use the existing CSRF and trusted-origin controls for writes.

| Method   | Endpoint                                                                                   | Purpose                                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/rooms?status=all&search=`                                                            | List only the current organization’s rooms.                                                                                     |
| `POST`   | `/api/rooms`                                                                               | Add a room.                                                                                                                     |
| `PATCH`  | `/api/rooms/:roomId`                                                                       | Edit a room with required optimistic-concurrency `version`.                                                                     |
| `DELETE` | `/api/rooms/:roomId`                                                                       | Soft-deactivate a room when it has no active lock.                                                                              |
| `GET`    | `/api/rooms/availability?checkinDate=YYYY-MM-DD&checkoutDate=YYYY-MM-DD&excludeInvoiceId=` | Return active rooms not locked by an overlapping reservation/check-in.                                                          |
| `GET`    | `/api/rooms/booking-board?from=YYYY-MM-DD&to=YYYY-MM-DD`                                   | Return the current organization’s configured rooms and active reserved/check-in intervals for a maximum 31-day visual schedule. |
| `GET`    | `/api/rooms/:roomId/allocations?page=1`                                                    | Return one page of the current room's invoices: fixed at 10 records per page and limited to allocations created in the last 12 months. |

Invoice payloads now submit room IDs only:

```json
"rooms": [{ "roomId": "66d1234567890abcdef1234" }]
```

The API returns `422` for invalid room IDs, inactive rooms, duplicate selections, invalid dates, or foreign-tenant rooms. It returns `409` if another allocation has made a selected room unavailable or if a room/invoice was changed concurrently.

## Availability and Consistency

Two date ranges overlap when:

```text
newArrival < existingDeparture AND newDeparture > existingArrival
```

This means a guest checking out on 12 August and another checking in on 12 August do not conflict. Availability is checked in the database transaction that creates, converts, updates, checks out, or cancels an invoice. That prevents the normal race in which two users both see a room as available and then reserve it at the same time.

MongoDB Atlas clusters are replica sets and support these transactions. Do not deploy this feature against a standalone MongoDB server. The production readiness check must run `npm run db:create-indexes` after deployment credentials and the Atlas database name are correct.

## Security Controls

### UI

- There is no editable room-number text input on invoices.
- The picker is disabled until a valid stay range exists and supports multi-room selection without exposing other tenant data.
- The room directory uses the current session and does not store room lists or allocations in browser local storage.
- React escapes all displayed room values. The UI is convenience only; it is never the authorization layer.

### API and Service Layer

- Authentication, HTTP-only sessions, CSRF, CORS allowlists, trusted-origin checks, rate limiting, request-size limits, and no-store API responses are inherited from the company service.
- Zod schemas are strict: unknown fields are rejected, IDs must be 24-character MongoDB ObjectIds, dates must be ISO dates, and room names are length/character constrained.
- Availability and ownership checks use the server session’s organization ID.
- Regex search terms are escaped before being used in MongoDB regular expressions.
- Checked-out and cancelled invoices cannot be modified. Active rooms cannot be deactivated while reserved or checked in.
- Room history pagination is fixed server-side. The browser cannot request a larger page size or records outside the last twelve months, and each result remains scoped to the authenticated organization and requested room.

### Database

- Tenant compound indexes prevent duplicate normalized room codes per organization without preventing another organization from using the same code.
- Allocation indexes support the exact room/date/status lookup used for conflict checks.
- `rooms` are soft-deactivated rather than deleted, preserving invoice references.
- Audit records are written for directory changes and invoice writes retain their room snapshots.
- Production requires an Atlas TLS URI and a least-privilege database user. Application secrets remain in the host secret manager, never in `VITE_*` variables or source control.

## Migration and Rollout

1. Back up the Atlas database and verify a restore procedure.
2. Deploy this branch to a staging environment with production-like session and Atlas configuration.
3. Run `npm run db:create-indexes` once to create room and allocation indexes.
4. Create the organization’s room directory before creating new invoices.
5. Existing historical invoices retain their legacy `roomNo` values. New room snapshots are added only to newly saved invoices.
6. Historical checked-out invoices remain read-only. Active legacy drafts/check-ins must be assigned to a room directory record before they can be saved again.
7. Test two concurrent reservation attempts for the same room and overlapping dates. Exactly one must succeed.
8. Confirm no cross-organization room is returned through list, availability, history, or invoice save APIs.
9. Create more than ten recent allocations for one room; confirm history returns ten records per page, blocks pages outside the last twelve months, and opens an invoice only within the current organization.

## Verification Checklist

```text
npm run test --workspace server
npm run build
npm run db:create-indexes
```

Manual checks:

1. Create room `A-101`; attempt `a-101` again and confirm a `409` response.
2. Create an invoice with two rooms and confirm both appear in the PDF room field.
3. Reserve a room, then attempt an overlapping reservation from a second browser session; confirm `409`.
4. Cancel the reservation and confirm the room reappears for the same date range.
5. Attempt to deactivate a currently reserved room and confirm `409`.
6. Sign into a second organization and confirm none of the first organization’s room IDs can be listed, allocated, or inspected.
