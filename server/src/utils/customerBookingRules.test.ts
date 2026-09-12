import assert from "node:assert/strict";
import test from "node:test";
import {
  bookingNotificationSchema,
  createBookingSchema,
  updateBookingSchema,
} from "../validation/bookingSchemas.js";
import { createCustomerSchema } from "../validation/customerSchemas.js";
import {
  buildBookingEmailContent,
  buildBookingWhatsAppParameters,
} from "../services/bookingNotificationService.js";
import {
  bookingReceiptFilename,
  bookingSlipFilename,
  buildBookingReceiptPdf,
  buildBookingSlipPdf,
} from "../services/bookingReceiptPdfService.js";
import {
  bookingStayDates,
  minorUnitsToRupees,
  rupeesToMinorUnits,
} from "./bookingRules.js";
import {
  buildCustomerSearchTokens,
  customerPhoneLookupHash,
  maskPhone,
  normalizeCustomerPhone,
} from "./customerRules.js";

test("normalizes Indian and international customer phone numbers", () => {
  assert.equal(normalizeCustomerPhone("98765 43210"), "+919876543210");
  assert.equal(normalizeCustomerPhone("+91-98765-43210"), "+919876543210");
  assert.equal(normalizeCustomerPhone("09876543210"), "+919876543210");
  assert.equal(normalizeCustomerPhone("+44 20 7946 0958"), "+442079460958");
  assert.throws(() => normalizeCustomerPhone("12345"));
});

test("creates deterministic tenant-separated phone lookup hashes", () => {
  const phone = "+919876543210";
  const first = customerPhoneLookupHash("64b7f19d71c6411b74000001", phone);
  assert.equal(
    first,
    customerPhoneLookupHash("64b7f19d71c6411b74000001", phone),
  );
  assert.notEqual(
    first,
    customerPhoneLookupHash("64b7f19d71c6411b74000002", phone),
  );
  assert.equal(first.includes("9876543210"), false);
});

test("masks customer phone numbers in directory summaries", () => {
  const masked = maskPhone("+919876543210");
  assert.equal(masked, "+91 ******3210");
  assert.equal(masked.includes("9876543210"), false);
});

test("customer search tokens contain no plaintext contact data", () => {
  const tokens = buildCustomerSearchTokens("64b7f19d71c6411b74000001", {
    name: "Rahul Sharma",
    email: "rahul@example.com",
    normalizedPhone: "+919876543210",
  });
  assert.ok(tokens.length > 5);
  assert.equal(
    tokens.some((token) => /rahul|9876|example/i.test(token)),
    false,
  );
});

test("accepts a minimal customer contact and supplies private-field defaults", () => {
  const customer = createCustomerSchema.parse({
    name: "Rahul Sharma",
    phone: "98765 43210",
    email: "rahul@example.com",
  });

  assert.deepEqual(customer, {
    name: "Rahul Sharma",
    phone: "+919876543210",
    email: "rahul@example.com",
    address: "",
    state: "",
    notes: "",
    whatsappOptIn: false,
  });
});

test("booking stay dates are checkout-exclusive and capped", () => {
  assert.deepEqual(bookingStayDates("2026-09-01", "2026-09-04"), [
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
  ]);
  assert.throws(() => bookingStayDates("2026-09-04", "2026-09-04"));
  assert.throws(() => bookingStayDates("2026-01-01", "2027-01-02"));
});

test("booking money conversion is exact to paise", () => {
  assert.equal(rupeesToMinorUnits(1234.56), 123456);
  assert.equal(minorUnitsToRupees(123456), 1234.56);
});

const bookingBase = {
  idempotencyKey: "b897ea86-c746-42de-a1f6-894e1a0d05d0",
  customerId: "64b7f19d71c6411b74000001",
  checkinDate: "2026-09-01",
  checkoutDate: "2026-09-03",
  roomIds: ["64b7f19d71c6411b74000002"],
  requestedRooms: [
    { roomType: "Family", bedsPerRoom: 4, quantity: 1 },
    { roomType: "Standard", bedsPerRoom: 2, quantity: 1 },
  ],
  guestCount: 2,
  estimatedTotal: 5000,
  status: "confirmed" as const,
  notes: "",
  terms: "Cancellation terms apply.",
};

test("new confirmed bookings require an advance", () => {
  assert.equal(createBookingSchema.safeParse(bookingBase).success, false);
  assert.equal(
    createBookingSchema.safeParse({
      ...bookingBase,
      initialPayment: {
        amount: 1000,
        method: "upi",
        reference: "TXN-1",
        notes: "",
        idempotencyKey: "b897ea86-c746-42de-a1f6-894e1a0d05d0",
      },
    }).success,
    true,
  );
});

test("confirmed bookings defer room allocation until invoicing", () => {
  assert.equal(
    createBookingSchema.safeParse({
      ...bookingBase,
      roomIds: [],
      initialPayment: {
        amount: 1000,
        method: "upi",
        reference: "TXN-ROOM-LATER",
        notes: "",
        idempotencyKey: "b897ea86-c746-42de-a1f6-894e1a0d05d0",
      },
    }).success,
    true,
  );
});

test("enquiries and awaiting-advance bookings do not require room assignment", () => {
  assert.equal(
    createBookingSchema.safeParse({
      ...bookingBase,
      status: "enquiry",
      roomIds: [],
    }).success,
    true,
  );
  assert.equal(
    createBookingSchema.safeParse({
      ...bookingBase,
      status: "pendingAdvance",
      roomIds: [],
    }).success,
    true,
  );
});

test("customer communications never expose internal room assignments", () => {
  const context = {
    booking: {
      confirmationNumber: "BKG-TEST",
      checkinDate: "2026-09-01",
      checkoutDate: "2026-09-03",
      rooms: [{ roomNumber: "PRIVATE-ROOM-909", roomType: "Internal suite" }],
      requestedRooms: [{ roomType: "Family", bedsPerRoom: 4, quantity: 1 }],
      guestCount: 2,
      termsSnapshot: "Cancellation terms apply.",
    },
    customer: { name: "Example Guest" },
    payment: null,
    business: { business_name: "Example Hotel", phone: "+91 90000 00000" },
  } as any;
  const email = buildBookingEmailContent("confirmation", context);
  const whatsapp = buildBookingWhatsAppParameters(context);
  const outbound = JSON.stringify({ email, whatsapp });

  assert.equal(outbound.includes("PRIVATE-ROOM-909"), false);
  assert.equal(outbound.includes("Internal suite"), false);
  assert.equal(outbound.includes("Room(s)"), false);
  assert.equal(whatsapp.includes("Managed internally by the property"), true);
});

test("advance receipts are generated in memory with a safe filename", () => {
  const input = {
    businessName: "Example Hotel",
    businessAddressLines: ["123 Example Road", "Kolkata, West Bengal"],
    businessPhone: "+91 90000 00000",
    businessEmail: "booking@example.test",
    businessWebsite: "www.example.test",
    customerName: "Example Guest",
    confirmationNumber: "BKG-TEST",
    receiptNumber: "RCT/2026/001",
    checkinDate: "2026-09-01",
    checkoutDate: "2026-09-03",
    guestCount: 2,
    requestedRooms: [{ roomType: "Family", bedsPerRoom: 4, quantity: 1 }],
    amountMinor: 100000,
    estimatedTotalMinor: 650000,
    advanceBalanceMinor: 100000,
    paymentMethod: "upi",
    receivedAt: "2026-08-31T10:00:00.000Z",
    terms: "Cancellation terms apply.",
  };
  const pdf = buildBookingReceiptPdf(input);
  const bookingSlip = buildBookingSlipPdf(input);

  assert.equal(pdf.subarray(0, 4).toString("ascii"), "%PDF");
  assert.ok(pdf.length > 1_000);
  assert.equal(bookingSlip.subarray(0, 4).toString("ascii"), "%PDF");
  assert.ok(bookingSlip.length > 1_000);
  assert.equal(
    bookingReceiptFilename("RCT/2026/001"),
    "advance-receipt-RCT-2026-001.pdf",
  );
  assert.equal(
    bookingSlipFilename("RCT/2026/001"),
    "booking-slip-RCT-2026-001.pdf",
  );
});

test("requested room capacity must cover booking occupancy", () => {
  const result = createBookingSchema.safeParse({
    ...bookingBase,
    roomIds: [],
    guestCount: 7,
    requestedRooms: [{ roomType: "Standard", bedsPerRoom: 2, quantity: 3 }],
    initialPayment: {
      amount: 1000,
      method: "upi",
      reference: "TXN-CAPACITY",
      notes: "",
      idempotencyKey: "b897ea86-c746-42de-a1f6-894e1a0d05d0",
    },
  });

  assert.equal(result.success, false);
  assert.equal(
    result.success
      ? ""
      : result.error.issues.some((issue) => issue.path[0] === "requestedRooms"),
    true,
  );
});

test("confirmed booking updates rely on the payment ledger, not a repeated payment", () => {
  const {
    customerId: _customerId,
    idempotencyKey: _idempotencyKey,
    ...updateFields
  } = bookingBase;
  assert.equal(
    updateBookingSchema.safeParse({
      ...updateFields,
      version: 2,
    }).success,
    true,
  );
});

test("notification requests require replay protection and valid receipt context", () => {
  const idempotencyKey = "b897ea86-c746-42de-a1f6-894e1a0d05d0";
  assert.equal(
    bookingNotificationSchema.safeParse({
      idempotencyKey,
      kind: "confirmation",
      channels: ["email", "whatsapp"],
      allowResend: true,
    }).success,
    true,
  );
  assert.equal(
    bookingNotificationSchema.safeParse({
      kind: "confirmation",
      channels: ["email"],
    }).success,
    false,
  );
  assert.equal(
    bookingNotificationSchema.safeParse({
      idempotencyKey,
      kind: "advanceReceipt",
      channels: ["email"],
    }).success,
    false,
  );
});
