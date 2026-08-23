import assert from "node:assert/strict";
import { test } from "node:test";
import {
  internalBodyDigest,
  signInternalRequest,
} from "./internalRequestSignature.js";

test("internal signatures bind the method, path, timestamp, nonce, and body", () => {
  const secret = "a".repeat(48);
  const digest = internalBodyDigest("");
  const signature = signInternalRequest(
    "POST",
    "/api/internal/organizations/1/revoke-sessions",
    "1720000000000",
    "0123456789abcdef0123456789abcdef",
    digest,
    secret,
  );
  assert.equal(signature, "R5qbjXUZ6es7i9gYrf_jDC_Kw2sGMk2c_4PdRbUnnb0");
  assert.notEqual(
    signature,
    signInternalRequest(
      "POST",
      "/api/internal/organizations/1/revoke-sessions",
      "1720000000000",
      "a-different-nonce-value-32-byte",
      digest,
      secret,
    ),
  );
  assert.notEqual(
    signature,
    signInternalRequest(
      "POST",
      "/api/internal/organizations/1/revoke-sessions",
      "1720000000000",
      "0123456789abcdef0123456789abcdef",
      internalBodyDigest("changed"),
      secret,
    ),
  );
});
