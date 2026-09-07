import crypto from "node:crypto";
import { env } from "../config/env.js";

const MAX_SEARCH_PREFIX = 32;

export function normalizeCustomerPhone(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, "");
  let digits = compact.replace(/^\+/, "");

  if (/^0[6-9]\d{9}$/.test(digits)) {
    digits = digits.slice(1);
  }
  if (/^[6-9]\d{9}$/.test(digits)) {
    return `+91${digits}`;
  }
  if (/^91[6-9]\d{9}$/.test(digits)) {
    return `+${digits}`;
  }
  if (compact.startsWith("+") && /^\d{8,15}$/.test(digits)) {
    return `+${digits}`;
  }

  throw new Error(
    "Enter a valid phone number with country code, or a 10-digit Indian mobile number",
  );
}

function lookupKey(purpose: string, organizationId: string) {
  return crypto
    .createHmac("sha256", env.DATA_ENCRYPTION_KEY_BYTES)
    .update(`customer-lookup:v1:${purpose}:${organizationId}`)
    .digest();
}

function keyedLookupHash(
  purpose: string,
  organizationId: string,
  value: string,
) {
  return crypto
    .createHmac("sha256", lookupKey(purpose, organizationId))
    .update(value)
    .digest("base64url");
}

export function customerPhoneLookupHash(
  organizationId: string,
  normalizedPhone: string,
) {
  return keyedLookupHash("phone", organizationId, normalizedPhone);
}

function normalizedSearchValue(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function prefixes(value: string) {
  const normalized = normalizedSearchValue(value);
  const values = new Set<string>();
  const parts = [normalized, ...normalized.split(/[\s@._-]+/)].filter(Boolean);
  for (const part of parts) {
    const upperBound = Math.min(MAX_SEARCH_PREFIX, part.length);
    for (let length = 2; length <= upperBound; length += 1) {
      values.add(part.slice(0, length));
    }
  }
  if (normalized) {
    values.add(normalized.slice(0, MAX_SEARCH_PREFIX));
  }
  return [...values];
}

export function customerSearchToken(
  organizationId: string,
  searchValue: string,
) {
  const normalized = normalizedSearchValue(searchValue).slice(
    0,
    MAX_SEARCH_PREFIX,
  );
  return normalized.length >= 2
    ? keyedLookupHash("search", organizationId, normalized)
    : "";
}

export function buildCustomerSearchTokens(
  organizationId: string,
  input: { name: string; email: string; normalizedPhone: string },
) {
  const values = new Set([
    ...prefixes(input.name),
    ...prefixes(input.email),
    input.normalizedPhone,
    input.normalizedPhone.replace(/^\+/, ""),
    input.normalizedPhone.slice(-10),
    input.normalizedPhone.slice(-4),
  ]);
  return [...values]
    .filter((value) => value.length >= 2)
    .map((value) => keyedLookupHash("search", organizationId, value));
}

export function maskPhone(normalizedPhone: string) {
  const visible = normalizedPhone.slice(-4);
  return `${normalizedPhone.slice(0, 3)} ${"*".repeat(
    Math.max(4, normalizedPhone.length - 7),
  )}${visible}`;
}
