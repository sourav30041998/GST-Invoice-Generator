# Accommodation Tariffs

## Pricing rule

Each accommodation combination has an agreed tariff **per room for the entire stay**.
Quantity x tariff = room-combination total. The sum of those totals is Estimated Total.
Beds and stay length do not multiply the tariff. There is no automatic tax addition:
record the agreed stay amount, including any agreed taxes, in the tariff.
Invoices continue to use their existing tax calculation workflow.

Example: two four-bed rooms at Rs. 4,000 and one two-bed room at Rs. 2,500
produce an estimated booking total of Rs. 10,500, regardless of the number of nights.

## User workflow

1. Open a customer's New booking dialog.
2. Enter dates and accommodation combinations.
3. Enter Tariff / room (entire stay) for every combination.
4. Review calculated row totals, Expected occupancy, and read-only Estimated Total.
5. Record the advance and save. Existing confirmation and resend consent behavior remains.

Changing quantities, adding or deleting combinations, or changing a tariff recalculates
the estimate. Invalid values use the existing persistent validation dialog.
Expected occupancy remains independently editable.

## API and persistence

Existing authenticated POST /api/bookings and PUT /api/bookings/:id accept:

```json
{
  "requestedRooms": [
    {
      "roomType": "Family",
      "bedsPerRoom": 4,
      "quantity": 2,
      "tariffPerRoom": 4000
    },
    {
      "roomType": "Standard",
      "bedsPerRoom": 2,
      "quantity": 1,
      "tariffPerRoom": 2500
    }
  ],
  "estimatedTotal": 10500
}
```

This is an excerpt, not the complete request. All existing required fields still apply.
No new endpoint or collection is introduced. Tariffs are stored inside the existing
tenant-bound encrypted booking protectedData. The calculated total is stored as
estimatedTotalMinor (integer paise). Existing authorized booking/receipt responses
include tariffs so staff and customers can inspect their agreed prices.

## Security and consistency

- The server recalculates using integer paise and rejects mismatched client totals.
- Tariffs must be numeric, finite, nonnegative, and have at most two decimal places.
- Individual tariff and combined estimate cannot exceed Rs. 9,999,999,999.
- Existing limits of 12 combinations, 20 rooms, and 100 expected guests remain.
- An existing priced booking cannot be downgraded by removing every tariff.
- An estimate cannot fall below recorded net advances. Zero-priced plans cannot
  accept positive advances. Existing transactional ledger checks remain.
- Tenant-scoped queries, session authorization, CSRF, strict schemas, idempotency,
  optimistic version checks, and encrypted storage remain in place.
- No room identifiers are added to customer messages, and no new logging of PII occurs.
- Authorized browser/PDF recipients can necessarily see their prices. Encryption at
  rest does not hide information legitimately delivered to a browser.

## Existing data and documents

### Booking preferences

The Preference field offers searchable room-category and AC/non-AC suggestions,
plus a free-text custom request (up to 80 characters). Clear removes the preference.
Suggestions are booking-only conveniences, not confirmation of inventory or availability.
Room Directory data is neither read nor changed by this selector.
The existing requestedRooms[].roomType field stores the chosen or typed text,
so no migration, new API, or inventory allocation is needed.
Booking summaries, messages and PDFs use that saved text. A missing preference in
the PDF tariff table displays "Standard". Blank, whitespace-only, or omitted
preferences also default to "Standard" when the booking is saved through the API.
Older bookings and custom preferences remain editable.

No migration is required. Older bookings without tariffs remain readable/editable
with their previous manual estimate. Entering tariffs upgrades that booking; all
combinations must then have a tariff. Do not infer historical tariffs from totals.
New accommodation plans require explicit tariffs.

Both downloaded and emailed modern advance receipts contain a tariff table.
The styled booking slip retains its cover design and adds a tariff-detail page.
Long descriptions and larger plans wrap and paginate instead of overlapping.
Legacy receipts without tariffs keep the existing room-summary presentation.

## Verification

Run npm test, npm run typecheck, npm run build.
The focused accommodationTariffs tests cover arithmetic, tampered totals, numeric
bounds, legacy behavior, and tenant-bound encryption.
The check-accommodation-tariffs script uses mocked APIs and synthetic customers,
never production records or real email delivery.
