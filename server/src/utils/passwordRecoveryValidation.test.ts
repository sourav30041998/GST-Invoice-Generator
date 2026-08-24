import assert from "node:assert/strict";
import test from "node:test";
import {
  completePasswordRecoverySchema,
  requestPasswordRecoverySchema,
  verifyPasswordRecoveryOtpSchema,
} from "../validation/authSchemas.js";

const challengeToken = "a".repeat(43);
const resetToken = "b".repeat(43);

test("normalizes a recovery email without accepting extra fields", () => {
  assert.equal(
    requestPasswordRecoverySchema.parse({ email: " Owner@Example.COM " }).email,
    "owner@example.com",
  );
  assert.equal(
    requestPasswordRecoverySchema.safeParse({
      email: "owner@example.com",
      organizationId: "attacker-controlled",
    }).success,
    false,
  );
});

test("accepts only a six-digit OTP and opaque challenge token", () => {
  assert.equal(
    verifyPasswordRecoveryOtpSchema.safeParse({
      challengeToken,
      otp: "012345",
    }).success,
    true,
  );
  assert.equal(
    verifyPasswordRecoveryOtpSchema.safeParse({
      challengeToken,
      otp: "12345a",
    }).success,
    false,
  );
});

test("requires a strong matching password pair", () => {
  assert.equal(
    completePasswordRecoverySchema.safeParse({
      challengeToken,
      resetToken,
      newPassword: "ValidPassword123",
      confirmPassword: "ValidPassword123",
    }).success,
    true,
  );
  assert.equal(
    completePasswordRecoverySchema.safeParse({
      challengeToken,
      resetToken,
      newPassword: "ValidPassword123",
      confirmPassword: "DifferentPassword123",
    }).success,
    false,
  );
  assert.equal(
    completePasswordRecoverySchema.safeParse({
      challengeToken,
      resetToken,
      newPassword: "alllowercase123",
      confirmPassword: "alllowercase123",
    }).success,
    false,
  );
});
