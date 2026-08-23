import crypto from "node:crypto";

export function internalBodyDigest(body: Buffer | string) {
  return crypto.createHash("sha256").update(body).digest("base64url");
}

export function canonicalInternalRequest(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  bodyDigest: string,
) {
  return ["v2", method, path, timestamp, nonce, bodyDigest].join("\n");
}

export function signInternalRequest(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  bodyDigest: string,
  secret: string,
) {
  return crypto
    .createHmac("sha256", secret)
    .update(
      canonicalInternalRequest(method, path, timestamp, nonce, bodyDigest),
    )
    .digest("base64url");
}
