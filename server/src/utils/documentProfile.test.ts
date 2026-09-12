import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";
import { defaultPreset } from "../config/defaultPreset.js";
import { freshDefaultTaxPresets } from "../config/defaultTaxPresets.js";
import { BusinessProfileModel } from "../models/BusinessProfile.js";
import { OrganizationModel } from "../models/Organization.js";
import { BookingModel } from "../models/Booking.js";
import { BookingNotificationModel } from "../models/BookingNotification.js";
import { BookingPaymentModel } from "../models/BookingPayment.js";
import { CustomerModel } from "../models/Customer.js";
import { getBookingReceipt } from "../services/bookingService.js";
import { protectBusinessProfileRecord } from "../services/protectedRecordService.js";
import { savePreset } from "../services/settingsService.js";

function query(value: unknown) {
  return { select() { return this; }, async lean() { return structuredClone(value); } } as any;
}

test("receipts and outgoing attachments use the latest tenant profile without rewriting bookings", async (t) => {
  const companyA = "64b7f19d71c6411b74000001";
  const companyB = "64b7f19d71c6411b74000002";
  const bookingId = "64b7f19d71c6411b74000003";
  const paymentId = "64b7f19d71c6411b74000004";
  const customerId = "64b7f19d71c6411b74000005";
  const tenant = { organizationId: companyA, userId: "64b7f19d71c6411b74000006", userEmail: "owner@example.com" };
  const profiles = new Map([companyA, companyB].map((id) => [id, {
    ...protectBusinessProfileRecord({
      organizationId: id,
      businessName: id === companyA ? "Previous Hotel" : "Other Company",
      invoicePrefix: "INV",
      address: { line1: "Previous address", line2: "" },
      contact: { email: "previous@example.com" },
      bankDetails: { accountNumber: "OLD-ACCOUNT" },
      terms: "Previous profile terms",
    }, id),
    taxPresets: freshDefaultTaxPresets(),
    logoDataUrl: "",
  }]));
  t.mock.method(BusinessProfileModel, "findOneAndUpdate", (filter: any, update: any) => {
    assert.ok(profiles.has(filter.organizationId), "Profile queries must be tenant scoped");
    const profile = { ...profiles.get(filter.organizationId), ...update.$set };
    profiles.set(filter.organizationId, profile);
    return query(profile);
  });
  t.mock.method(OrganizationModel, "updateOne", async (filter: any) => {
    assert.equal(filter._id, companyA);
    return { acknowledged: true } as any;
  });
  const booking = {
    _id: bookingId, customerId, organizationId: companyA,
    confirmationNumber: "BKG-UNCHANGED", status: "confirmed",
    checkinDate: "2026-09-10", checkoutDate: "2026-09-12", guestCount: 2,
    requestedRooms: [{ roomType: "Standard", bedsPerRoom: 2, quantity: 1 }],
    termsSnapshot: "Agreed booking terms", notes: "", estimatedTotalMinor: 500000,
    advanceBalanceMinor: 100000,
  };
  const originalBooking = structuredClone(booking);
  t.mock.method(BookingModel, "findOne", (filter: any) => {
    assert.equal(filter._id, bookingId);
    return query(filter.organizationId === companyA ? booking : null);
  });
  t.mock.method(BookingPaymentModel, "findOne", (filter: any) => {
    if (filter.organizationId === companyB) return query(null);
    assert.equal(filter.organizationId, companyA);
    assert.equal(filter.bookingId, bookingId);
    assert.equal(filter._id, paymentId);
    return query({
      _id: paymentId, bookingId, customerId, amountMinor: 100000,
      receiptNumber: "REC-UNCHANGED", method: "upi", receivedAt: "2026-09-08T10:00:00.000Z",
    });
  });
  t.mock.method(BookingPaymentModel, "aggregate", async (pipeline: any) => {
    assert.equal(String(pipeline[0].$match.organizationId), companyA);
    return [{ _id: new Types.ObjectId(bookingId), total: 100000 }] as any;
  });
  t.mock.method(BookingNotificationModel, "aggregate", async () => [] as any);
  t.mock.method(CustomerModel, "findOne", (filter: any) => {
    assert.equal(filter.organizationId, companyA);
    assert.equal(filter._id, customerId);
    return query({ _id: customerId, name: "Example Guest", phone: "+919000000000", email: "guest@example.com" });
  });

  const before = await getBookingReceipt(tenant, bookingId, paymentId);
  assert.equal(before.business.business_name, "Previous Hotel");
  const otherCompanyBefore = structuredClone(profiles.get(companyB));
  const updated = {
    ...defaultPreset,
    business_name: "Updated Hotel", invoice_prefix: "NEW",
    address_line1: "Updated address", address_line2: "Updated city",
    email: "new@example.com", phone: "+91 90000 00001", bank_account: "",
    terms: "Updated invoice terms",
  };
  await savePreset(tenant.organizationId, updated);
  const after = await getBookingReceipt(tenant, bookingId, paymentId);
  assert.deepEqual(after.business, updated);
  assert.equal(after.business.bank_account, "", "Cleared fields must not fall back to old values");
  assert.equal(after.booking.termsSnapshot, "Agreed booking terms");
  assert.ok("receiptNumber" in after.payment);
  assert.equal(after.payment.receiptNumber, "REC-UNCHANGED");
  assert.equal(after.payment.amount, 1000);
  assert.deepEqual(profiles.get(companyB), otherCompanyBefore);
  assert.deepEqual(booking, originalBooking);
  await assert.rejects(
    getBookingReceipt({ ...tenant, organizationId: companyB }, bookingId, paymentId),
    /Booking not found/,
  );
});
