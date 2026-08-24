import assert from "node:assert/strict";
import test from "node:test";
import { recoveryRecipientMatchesRequest } from "./passwordRecoveryDelivery.js";

test("allows delivery only to the normalized requested address", () => {
  assert.equal(
    recoveryRecipientMatchesRequest(" Owner@Example.com ", "owner@example.COM"),
    true,
  );
});

test("blocks delivery when the recipient is missing or differs", () => {
  assert.equal(
    recoveryRecipientMatchesRequest("owner@example.com", undefined),
    false,
  );
  assert.equal(
    recoveryRecipientMatchesRequest(
      "owner@example.com",
      "attacker@example.com",
    ),
    false,
  );
});
