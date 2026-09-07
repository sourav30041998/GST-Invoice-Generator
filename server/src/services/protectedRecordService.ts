import {
  decryptProtectedJson,
  encryptProtectedJson,
  isProtectedEnvelope,
} from "./dataProtectionService.js";

type AnyRecord = Record<string, any>;

type InvoiceSensitiveData = {
  confirmNo: string;
  partyName: string;
  partyPhone?: string;
  partyEmail?: string;
  partyGSTIN: string;
  partyAddress: string;
  partyState: string;
  groupName: string;
  presetSnapshot: unknown;
  businessSnapshot: unknown;
};

type BusinessSensitiveData = {
  gstin: string;
  address: unknown;
  contact: unknown;
  bankDetails: unknown;
};

function organizationKey(record: AnyRecord, organizationId?: string) {
  const value = organizationId || record.organizationId;
  if (!value) {
    throw new Error("Organization context is required for protected data");
  }
  return String(value);
}

export function protectInvoiceRecord(
  scope: "invoice" | "invoice-draft",
  record: AnyRecord,
  organizationId?: string,
) {
  const tenantId = organizationKey(record, organizationId);
  const sensitive: InvoiceSensitiveData = {
    confirmNo: record.confirmNo || "",
    partyName: record.partyName || "",
    ...(typeof record.partyPhone === "string"
      ? { partyPhone: record.partyPhone }
      : {}),
    ...(typeof record.partyEmail === "string"
      ? { partyEmail: record.partyEmail }
      : {}),
    partyGSTIN: record.partyGSTIN || "",
    partyAddress: record.partyAddress || "",
    partyState: record.partyState || "",
    groupName: record.groupName || "",
    presetSnapshot: record.presetSnapshot || {},
    businessSnapshot: record.businessSnapshot || {},
  };
  return {
    ...record,
    ...(typeof record.createdBy === "string"
      ? {
          createdBy: record.createdBy.includes("@")
            ? "authenticated-user"
            : record.createdBy,
        }
      : {}),
    confirmNo: "",
    partyName: "Protected customer",
    ...(typeof record.partyPhone === "string" ? { partyPhone: "" } : {}),
    ...(typeof record.partyEmail === "string" ? { partyEmail: "" } : {}),
    partyGSTIN: "",
    partyAddress: "",
    partyState: "",
    groupName: "",
    presetSnapshot: {
      invoice_prefix: record.presetSnapshot?.invoice_prefix || "INV",
    },
    businessSnapshot: {},
    protectedData: encryptProtectedJson(scope, tenantId, sensitive),
  };
}

export function revealInvoiceRecord(
  scope: "invoice" | "invoice-draft",
  record: AnyRecord,
  organizationId?: string,
) {
  if (!isProtectedEnvelope(record.protectedData)) {
    return record;
  }
  const tenantId = organizationKey(record, organizationId);
  const sensitive = decryptProtectedJson<InvoiceSensitiveData>(
    scope,
    tenantId,
    record.protectedData,
  );
  const { protectedData: _protectedData, ...publicRecord } = record;
  return { ...publicRecord, ...sensitive };
}

export function protectBusinessProfileRecord(
  record: AnyRecord,
  organizationId?: string,
) {
  const tenantId = organizationKey(record, organizationId);
  const sensitive: BusinessSensitiveData = {
    gstin: record.gstin || "",
    address: record.address || {},
    contact: record.contact || {},
    bankDetails: record.bankDetails || {},
  };
  return {
    ...record,
    gstin: "",
    address: {},
    contact: {},
    bankDetails: {},
    protectedData: encryptProtectedJson(
      "business-profile",
      tenantId,
      sensitive,
    ),
  };
}

export function revealBusinessProfileRecord(
  record: AnyRecord,
  organizationId?: string,
) {
  if (!isProtectedEnvelope(record.protectedData)) {
    return record;
  }
  const tenantId = organizationKey(record, organizationId);
  const sensitive = decryptProtectedJson<BusinessSensitiveData>(
    "business-profile",
    tenantId,
    record.protectedData,
  );
  const { protectedData: _protectedData, ...publicRecord } = record;
  return { ...publicRecord, ...sensitive };
}
