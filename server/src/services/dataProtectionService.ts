import crypto from "node:crypto";
import { env } from "../config/env.js";

const ENVELOPE_VERSION = "enc1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class DataProtectionError extends Error {
  constructor() {
    super("Protected data could not be decrypted");
    this.name = "DataProtectionError";
  }
}

function additionalData(scope: string, organizationId: string) {
  return Buffer.from(
    `${ENVELOPE_VERSION}\0${scope}\0${organizationId}`,
    "utf8",
  );
}

export function encryptProtectedJson(
  scope: string,
  organizationId: string,
  value: unknown,
) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    env.DATA_ENCRYPTION_KEY_BYTES,
    iv,
  );
  cipher.setAAD(additionalData(scope, organizationId));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    ENVELOPE_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptProtectedJson<T>(
  scope: string,
  organizationId: string,
  envelope: string,
): T {
  try {
    const [version, encodedIv, encodedTag, encodedCiphertext, extra] =
      envelope.split(".");
    if (
      version !== ENVELOPE_VERSION ||
      !encodedIv ||
      !encodedTag ||
      !encodedCiphertext ||
      extra
    ) {
      throw new DataProtectionError();
    }
    const iv = Buffer.from(encodedIv, "base64url");
    const tag = Buffer.from(encodedTag, "base64url");
    const ciphertext = Buffer.from(encodedCiphertext, "base64url");
    if (
      iv.length !== IV_BYTES ||
      tag.length !== TAG_BYTES ||
      !ciphertext.length
    ) {
      throw new DataProtectionError();
    }
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      env.DATA_ENCRYPTION_KEY_BYTES,
      iv,
    );
    decipher.setAAD(additionalData(scope, organizationId));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(plaintext) as T;
  } catch (error) {
    if (error instanceof DataProtectionError) {
      throw error;
    }
    throw new DataProtectionError();
  }
}

export function isProtectedEnvelope(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${ENVELOPE_VERSION}.`);
}
