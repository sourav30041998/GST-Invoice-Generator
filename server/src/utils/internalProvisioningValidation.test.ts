import assert from "node:assert/strict";
import test from "node:test";
import {
  internalListQuerySchema,
  issueInvitationCommandSchema,
  updateOrganizationStatusCommandSchema,
} from "../validation/internalProvisioningSchemas.js";

const command = {
  requestId: "6f5cd7e0-94d1-44f7-a663-22250ab3dc65",
  platformAdminId: "66b5d4a9e1c2f3a4b5c6d7e8",
};

test("accepts only bounded invitation provisioning commands", () => {
  assert.equal(
    issueInvitationCommandSchema.safeParse({
      ...command,
      organizationName: "Example Hotel",
      ownerName: "Example Owner",
      ownerEmail: "OWNER@example.com",
      expiresInHours: 6,
    }).success,
    true,
  );
  assert.equal(
    issueInvitationCommandSchema.safeParse({
      ...command,
      organizationName: "Example Hotel",
      ownerName: "Example Owner",
      ownerEmail: "owner@example.com",
      expiresInHours: 48,
    }).success,
    false,
  );
  assert.equal(
    issueInvitationCommandSchema.safeParse({
      ...command,
      organizationName: "Example Hotel\r\nBcc: attacker@example.com",
      ownerName: "Example Owner",
      ownerEmail: "owner@example.com",
      expiresInHours: 6,
    }).success,
    false,
  );
});

test("rejects browser-supplied tenant fields and invalid command identifiers", () => {
  assert.equal(
    updateOrganizationStatusCommandSchema.safeParse({
      ...command,
      status: "suspended",
      organizationId: "66b5d4a9e1c2f3a4b5c6d7e8",
    }).success,
    false,
  );
  assert.equal(
    updateOrganizationStatusCommandSchema.safeParse({
      ...command,
      requestId: "predictable-request-id",
      status: "active",
    }).success,
    false,
  );
});

test("bounds internal directory pages", () => {
  assert.equal(internalListQuerySchema.parse({}).limit, 12);
  assert.equal(internalListQuerySchema.safeParse({ limit: 25 }).success, true);
  assert.equal(internalListQuerySchema.safeParse({ limit: 26 }).success, false);
});
