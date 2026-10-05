import assert from "node:assert/strict";
import test from "node:test";
import { accommodationTotalMinor } from "./accommodationTariffs.js";
import {
  createBookingSchema,
  updateBookingSchema,
} from "../validation/bookingSchemas.js";
import {
  protectBookingData,
  revealBookingRecord,
} from "../services/customerProtectionService.js";

const base = {
  idempotencyKey: "b897ea86-c746-42de-a1f6-894e1a0d05d0",
  customerId: "64b7f19d71c6411b74000001",
  checkinDate: "2026-10-10",
  checkoutDate: "2026-10-13",
  roomIds: [],
  guestCount: 2,
  status: "enquiry",
  notes: "",
  terms: "Agreed terms.",
  requestedRooms: [
    { roomType: "Family", quantity: 2, bedsPerRoom: 4, tariffPerRoom: 1234.56 },
  ],
  estimatedTotal: 2469.12,
};

test("tariffs are per room for the entire stay, not per night or bed", () => {
  assert.equal(createBookingSchema.safeParse(base).success, true);
  assert.equal(accommodationTotalMinor(base.requestedRooms), 246912);
  assert.equal(
    createBookingSchema.safeParse({ ...base, checkoutDate: "2026-10-20" })
      .success,
    true,
  );
  assert.equal(
    accommodationTotalMinor([{ quantity: 3, tariffPerRoom: 0.1 }]),
    30,
  );
});

test("request totals cannot override the calculated amount", () => {
  for (const estimatedTotal of [0, 1234.56, 2469.11, 2469.13, 9999]) {
    assert.equal(
      createBookingSchema.safeParse({ ...base, estimatedTotal }).success,
      false,
    );
  }
});

test("rejects missing, mixed, coerced, non-finite, negative and sub-paise tariffs", () => {
  for (const tariffPerRoom of [
    undefined,
    null,
    "",
    "1234.56",
    true,
    -1,
    NaN,
    Infinity,
    1.001,
    0.000000001,
    10_000_000_000,
    { $gt: 0 },
  ]) {
    assert.equal(
      createBookingSchema.safeParse({
        ...base,
        requestedRooms: [{ ...base.requestedRooms[0], tariffPerRoom }],
      }).success,
      false,
      String(tariffPerRoom),
    );
  }
  assert.throws(() =>
    accommodationTotalMinor([
      { quantity: 1, tariffPerRoom: 1 },
      { quantity: 1 },
    ]),
  );
});

test("caps the aggregate, not just each tariff; accepts maximum and large decimal amounts", () => {
  for (const rate of [9_999_999_999, 9_999_999_998.99, 123456789.12, 1.15]) {
    assert.equal(
      createBookingSchema.safeParse({
        ...base,
        estimatedTotal: rate,
        requestedRooms: [
          { ...base.requestedRooms[0], quantity: 1, tariffPerRoom: rate },
        ],
      }).success,
      true,
      String(rate),
    );
  }
  assert.throws(() =>
    accommodationTotalMinor([{ quantity: 2, tariffPerRoom: 9_999_999_999 }]),
  );
  assert.equal(
    createBookingSchema.safeParse({
      ...base,
      requestedRooms: [
        { ...base.requestedRooms[0], tariffPerRoom: 9_999_999_999 },
      ],
    }).success,
    false,
  );
});

test("zero-priced plans do not allow positive advances", () => {
  const zero = {
    ...base,
    estimatedTotal: 0,
    requestedRooms: [{ ...base.requestedRooms[0], tariffPerRoom: 0 }],
  };
  assert.equal(createBookingSchema.safeParse(zero).success, true);
  assert.equal(
    createBookingSchema.safeParse({
      ...zero,
      initialPayment: {
        amount: 0.01,
        method: "cash",
        idempotencyKey: base.idempotencyKey,
      },
    }).success,
    false,
  );
});

test("legacy updates keep missing rates; new bookings require explicit tariffs", () => {
  const { idempotencyKey: _, customerId: __, ...update } = base;
  const legacy = {
    ...update,
    version: 0,
    requestedRooms: [{ roomType: "Family", quantity: 2, bedsPerRoom: 4 }],
  };
  assert.equal(updateBookingSchema.safeParse(legacy).success, true);
  assert.equal(accommodationTotalMinor(legacy.requestedRooms), undefined);
  assert.equal(
    createBookingSchema.safeParse({
      ...base,
      requestedRooms: legacy.requestedRooms,
    }).success,
    false,
  );
});

test("rejects unknown row fields and forged tenant fields", () => {
  assert.equal(
    createBookingSchema.safeParse({ ...base, organizationId: "other-tenant" })
      .success,
    false,
  );
  assert.equal(
    createBookingSchema.safeParse({
      ...base,
      requestedRooms: [{ ...base.requestedRooms[0], total: 1 }],
    }).success,
    false,
  );
});

test("room tariffs round-trip encrypted only for the owning tenant", () => {
  const source = {
    notes: "Private tariff agreement",
    termsSnapshot: "Agreed terms.",
    requestedRooms: base.requestedRooms,
  };
  const protectedData = protectBookingData("organization-a", source);
  assert.equal(protectedData.includes("Family"), false);
  assert.equal(protectedData.includes("Private tariff agreement"), false);
  assert.deepEqual(
    revealBookingRecord({ protectedData }, "organization-a"),
    source,
  );
  assert.throws(() => revealBookingRecord({ protectedData }, "organization-b"));
});

test("booking updates cannot strip existing tariffs or undercut recorded advances", async (t) => {
  const { default: mongoose } = await import("mongoose");
  const { BookingModel } = await import("../models/Booking.js");
  const { updateBooking } = await import("../services/bookingService.js");
  const tenant = {
    organizationId: "64b7f19d71c6411b74000011",
    userId: "64b7f19d71c6411b74000012",
    userEmail: "owner@example.test",
  };
  const source = {
    notes: "",
    termsSnapshot: base.terms,
    requestedRooms: base.requestedRooms,
  };
  let ended = 0;
  const session = {
    withTransaction: async (fn: () => Promise<void>) => fn(),
    endSession: async () => {
      ended++;
    },
  };
  t.mock.method(mongoose, "startSession", (async () => session) as any);
  const record = {
    _id: base.customerId,
    version: 0,
    invoiceId: null,
    status: "enquiry",
    advanceBalanceMinor: 100000,
    protectedData: protectBookingData(tenant.organizationId, source),
    toObject() {
      return this;
    },
  };
  t.mock.method(BookingModel, "findOne", ((filter: any) => {
    assert.equal(filter.organizationId, tenant.organizationId);
    return {
      select: (fields: string) => {
        assert.equal(fields, "+protectedData");
        return { session: async () => record };
      },
    };
  }) as any);
  const { customerId: _, idempotencyKey: __, ...rest } = base;
  const removed = updateBookingSchema.parse({
    ...rest,
    version: 0,
    requestedRooms: [{ roomType: "Family", bedsPerRoom: 4, quantity: 2 }],
  });
  await assert.rejects(
    updateBooking(tenant, base.customerId, removed),
    /tariffs cannot be removed/,
  );
  const reduced = updateBookingSchema.parse({
    ...rest,
    version: 0,
    estimatedTotal: 0,
    requestedRooms: [{ ...base.requestedRooms[0], tariffPerRoom: 0 }],
  });
  await assert.rejects(
    updateBooking(tenant, base.customerId, reduced),
    /lower than the recorded advance/,
  );
  assert.equal(ended, 2);
});

test("payment service reads protected tariffs and blocks advances on zero-priced bookings", async (t) => {
  const { default: mongoose } = await import("mongoose");
  const { BookingModel } = await import("../models/Booking.js");
  const { BookingPaymentModel } = await import("../models/BookingPayment.js");
  const { recordBookingPayment } =
    await import("../services/bookingService.js");
  const tenant = {
    organizationId: "64b7f19d71c6411b74000011",
    userId: "64b7f19d71c6411b74000012",
    userEmail: "owner@example.test",
  };
  t.mock.method(mongoose, "startSession", (async () => ({
    withTransaction: async (fn: () => Promise<void>) => fn(),
    endSession: async () => {},
  })) as any);
  t.mock.method(BookingPaymentModel, "findOne", ((filter: any) => {
    assert.equal(filter.organizationId, tenant.organizationId);
    return { select: () => ({ lean: async () => null }) };
  }) as any);
  t.mock.method(BookingPaymentModel, "countDocuments", (() => ({
    session: async () => 0,
  })) as any);
  const record = {
    _id: base.customerId,
    status: "enquiry",
    estimatedTotalMinor: 0,
    advanceBalanceMinor: 0,
    protectedData: protectBookingData(tenant.organizationId, {
      notes: "",
      termsSnapshot: base.terms,
      requestedRooms: [{ ...base.requestedRooms[0], tariffPerRoom: 0 }],
    }),
    toObject() {
      return this;
    },
  };
  t.mock.method(BookingModel, "findOne", ((filter: any) => {
    assert.equal(filter.organizationId, tenant.organizationId);
    return {
      select: (fields: string) => {
        assert.equal(fields, "+protectedData");
        return { session: async () => record };
      },
    };
  }) as any);
  await assert.rejects(
    recordBookingPayment(tenant, base.customerId, {
      type: "advance",
      amount: 1,
      method: "cash",
      reference: "",
      notes: "",
      idempotencyKey: base.idempotencyKey,
      confirmBooking: false,
    }),
    /cannot exceed the estimated booking total/,
  );
});
