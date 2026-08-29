import assert from "node:assert/strict";
import test from "node:test";
import {
  hashPassword,
  passwordNeedsRehash,
  verifyPassword,
} from "../services/passwordService.js";

test("new password hashes verify and use the current work factor", async () => {
  const hash = await hashPassword("A-long-test-password!42");
  assert.equal(await verifyPassword("A-long-test-password!42", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
  assert.equal(passwordNeedsRehash(hash), false);
});

test("legacy hashes are accepted and flagged for transparent upgrade", async () => {
  const crypto = await import("node:crypto");
  const salt = crypto.randomBytes(16).toString("base64url");
  const key = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      "legacy-password",
      salt,
      64,
      { N: 16_384, r: 8, p: 1, maxmem: 128 * 1024 * 1024 },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
  });
  const hash = `scrypt$16384$8$1$${salt}$${key.toString("base64url")}`;
  assert.equal(await verifyPassword("legacy-password", hash), true);
  assert.equal(passwordNeedsRehash(hash), true);
});
