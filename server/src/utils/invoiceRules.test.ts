import assert from "node:assert/strict";
import test from "node:test";
import { invoicePayloadSchema } from "../validation/invoiceSchemas.js";
import {
  assertExpectedVersion,
  assertInvoiceWorkflowTransition,
} from "./invoiceRules.js";

const validPayload = {
  invDate: "2026-08-13",
  checkinDate: "2026-08-10",
  checkoutDate: "2026-08-13",
  confirmNo: "CONF-100",
  partyName: "Example Guest",
  partyGSTIN: "",
  partyAddress: "1 Example Road, Kolkata",
  partyState: "West Bengal",
  groupName: "",
  rooms: [{ roomId: "66b5d4a9e1c2f3a4b5c6d7e8" }],
  workflowStatus: "checkedIn" as const,
  lineItems: [
    {
      presetKey: "Custom",
      description: "Room charge",
      hsn: "996311",
      date: "2026-08-10",
      units: 1,
      rate: 1000,
      cgstRate: 6,
      sgstRate: 6,
      igstRate: 0,
      taxInclusive: false,
    },
  ],
  adjustments: [],
};

test("accepts a valid invoice payload", () => {
  assert.equal(invoicePayloadSchema.safeParse(validPayload).success, true);
  assert.equal(
    invoicePayloadSchema.safeParse({
      ...validPayload,
      lineItems: [{ ...validPayload.lineItems[0], description: "" }],
    }).success,
    true,
  );
});

test("rejects invalid calendar dates and reverse stays", () => {
  assert.equal(
    invoicePayloadSchema.safeParse({
      ...validPayload,
      checkinDate: "2026-02-30",
    }).success,
    false,
  );
  assert.equal(
    invoicePayloadSchema.safeParse({
      ...validPayload,
      checkoutDate: "2026-08-09",
    }).success,
    false,
  );
});

test("rejects unsafe tax mixes, zero line values, and precision loss", () => {
  assert.equal(
    invoicePayloadSchema.safeParse({
      ...validPayload,
      lineItems: [{ ...validPayload.lineItems[0], igstRate: 12 }],
    }).success,
    false,
  );
  assert.equal(
    invoicePayloadSchema.safeParse({
      ...validPayload,
      lineItems: [{ ...validPayload.lineItems[0], rate: 0 }],
    }).success,
    false,
  );
  assert.equal(
    invoicePayloadSchema.safeParse({
      ...validPayload,
      lineItems: [{ ...validPayload.lineItems[0], rate: 10.999 }],
    }).success,
    false,
  );
  assert.equal(
    invoicePayloadSchema.safeParse({
      ...validPayload,
      lineItems: [{ ...validPayload.lineItems[0], rate: 10_000_000_000 }],
    }).success,
    false,
  );
  assert.equal(
    invoicePayloadSchema.safeParse({
      ...validPayload,
      lineItems: [{ ...validPayload.lineItems[0], units: 1_000 }],
    }).success,
    false,
  );
  assert.equal(
    invoicePayloadSchema.safeParse({
      ...validPayload,
      lineItems: [{ ...validPayload.lineItems[0], hsn: "1234567" }],
    }).success,
    false,
  );
  assert.equal(
    invoicePayloadSchema.safeParse({
      ...validPayload,
      lineItems: [
        { ...validPayload.lineItems[0], cgstRate: 101, sgstRate: 101 },
      ],
    }).success,
    false,
  );
  assert.equal(
    invoicePayloadSchema.safeParse({
      ...validPayload,
      lineItems: [
        { ...validPayload.lineItems[0], units: 2, rate: 6_000_000_000 },
      ],
    }).success,
    true,
  );
});

test("rejects deductions that would make the payable amount negative", () => {
  assert.equal(
    invoicePayloadSchema.safeParse({
      ...validPayload,
      adjustments: [
        { desc: "Discount", amount: 1120.01, type: "deduct" as const },
      ],
    }).success,
    false,
  );
});

test("locks invalid invoice lifecycle transitions", () => {
  assert.doesNotThrow(() =>
    assertInvoiceWorkflowTransition("reserved", "checkedIn"),
  );
  assert.doesNotThrow(() =>
    assertInvoiceWorkflowTransition("checkedIn", "checkedOut"),
  );
  assert.throws(() =>
    assertInvoiceWorkflowTransition("reserved", "checkedOut"),
  );
  assert.throws(() =>
    assertInvoiceWorkflowTransition("checkedOut", "checkedIn"),
  );
  assert.throws(() => assertExpectedVersion(3, 2, "Invoice"));
});
