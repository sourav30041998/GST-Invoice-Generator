const REDACTED = "[REDACTED]";
const SENSITIVE_KEYS = new Set([
  "address",
  "bankdetails",
  "businesssnapshot",
  "confirmno",
  "contact",
  "createdby",
  "email",
  "groupname",
  "gstin",
  "owneremail",
  "ownername",
  "partyaddress",
  "partygstin",
  "partyname",
  "partystate",
  "password",
  "passwordhash",
  "protecteddata",
  "presetsnapshot",
  "recipientemail",
  "token",
]);

export function sanitizeAuditData(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeAuditData);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      SENSITIVE_KEYS.has(key.toLowerCase())
        ? REDACTED
        : sanitizeAuditData(child),
    ]),
  );
}
