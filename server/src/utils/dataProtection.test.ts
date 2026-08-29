import assert from "node:assert/strict";
import test from "node:test";

process.env.SESSION_SECRET ||= "test-session-secret-that-is-long-enough";
process.env.INVITATION_TOKEN_SECRET ||=
  "test-invitation-secret-that-is-long-enough";
process.env.PASSWORD_RESET_SECRET ||=
  "test-password-reset-secret-that-is-long-enough";
process.env.ADMIN_INTERNAL_SHARED_SECRET ||=
  "test-admin-shared-secret-that-is-long-enough";

test("protected data round-trips only in its tenant and scope", async () => {
  const { decryptProtectedJson, encryptProtectedJson } =
    await import("../services/dataProtectionService.js");
  const envelope = encryptProtectedJson("invoice", "organization-a", {
    partyName: "Test Guest",
  });
  assert.equal(envelope.includes("Test Guest"), false);
  assert.deepEqual(
    decryptProtectedJson("invoice", "organization-a", envelope),
    { partyName: "Test Guest" },
  );
  assert.throws(() =>
    decryptProtectedJson("invoice", "organization-b", envelope),
  );
  assert.throws(() =>
    decryptProtectedJson("invoice-draft", "organization-a", envelope),
  );
});

test("tampering with ciphertext is detected", async () => {
  const { decryptProtectedJson, encryptProtectedJson } =
    await import("../services/dataProtectionService.js");
  const envelope = encryptProtectedJson("business-profile", "org", {
    accountNumber: "1234567890",
  });
  const tampered = `${envelope.slice(0, -1)}${envelope.endsWith("A") ? "B" : "A"}`;
  assert.throws(() =>
    decryptProtectedJson("business-profile", "org", tampered),
  );
});

test("invoice storage removes customer and printable profile plaintext", async () => {
  const { protectInvoiceRecord, revealInvoiceRecord } =
    await import("../services/protectedRecordService.js");
  const source = {
    organizationId: "organization-a",
    partyName: "Test Guest",
    partyGSTIN: "19ABCDE1234F1Z5",
    partyAddress: "1 Test Road",
    partyState: "West Bengal",
    confirmNo: "CONF-1",
    groupName: "Test Group",
    presetSnapshot: {
      invoice_prefix: "INV",
      bank_account: "1234567890",
    },
    businessSnapshot: { contact: { email: "owner@example.com" } },
  };
  const stored = protectInvoiceRecord("invoice", source);
  assert.equal(stored.partyName, "Protected customer");
  assert.deepEqual(stored.presetSnapshot, { invoice_prefix: "INV" });
  assert.equal(JSON.stringify(stored).includes("1234567890"), false);
  assert.deepEqual(revealInvoiceRecord("invoice", stored), {
    ...source,
  });
});

test("business profile storage removes bank and contact plaintext", async () => {
  const { protectBusinessProfileRecord, revealBusinessProfileRecord } =
    await import("../services/protectedRecordService.js");
  const source = {
    organizationId: "organization-a",
    businessName: "Test Hotel",
    gstin: "19ABCDE1234F1Z5",
    address: { line1: "1 Test Road" },
    contact: { email: "owner@example.com" },
    bankDetails: { accountNumber: "1234567890" },
  };
  const stored = protectBusinessProfileRecord(source);
  assert.equal(JSON.stringify(stored).includes("1234567890"), false);
  assert.deepEqual(revealBusinessProfileRecord(stored), source);
});
