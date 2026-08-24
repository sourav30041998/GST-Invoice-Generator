import assert from "node:assert/strict";
import test from "node:test";
import {
  generateRecoveryOtp,
  generateRecoveryToken,
  hashRecoveryChallenge,
  hashRecoveryEmail,
  hashRecoveryOtp,
  hashRecoveryResetGrant,
  safeHashEqual,
} from "./passwordRecoveryTokens.js";

const secret = "test-password-recovery-secret-with-more-than-32-characters";

test("generates fixed-width numeric recovery codes", () => {
  for (let index = 0; index < 250; index += 1) {
    assert.match(generateRecoveryOtp(), /^\d{6}$/);
  }
});

test("generates high-entropy URL-safe recovery tokens", () => {
  const first = generateRecoveryToken();
  const second = generateRecoveryToken();
  assert.match(first, /^[A-Za-z0-9_-]{40,}$/);
  assert.notEqual(first, second);
});

test("uses purpose-separated deterministic HMAC values", () => {
  const token = generateRecoveryToken();
  const challengeHash = hashRecoveryChallenge(secret, token);
  const grantHash = hashRecoveryResetGrant(secret, token);

  assert.equal(challengeHash, hashRecoveryChallenge(secret, token));
  assert.notEqual(challengeHash, grantHash);
  assert.notEqual(
    hashRecoveryEmail(secret, "owner@example.com"),
    hashRecoveryEmail(secret, "other@example.com"),
  );
});

test("binds an OTP hash to its challenge and compares hashes safely", () => {
  const firstChallenge = generateRecoveryToken();
  const secondChallenge = generateRecoveryToken();
  const expected = hashRecoveryOtp(secret, firstChallenge, "123456");

  assert.equal(
    safeHashEqual(expected, hashRecoveryOtp(secret, firstChallenge, "123456")),
    true,
  );
  assert.equal(
    safeHashEqual(expected, hashRecoveryOtp(secret, secondChallenge, "123456")),
    false,
  );
  assert.equal(safeHashEqual(expected, "not-a-valid-hash"), false);
});
