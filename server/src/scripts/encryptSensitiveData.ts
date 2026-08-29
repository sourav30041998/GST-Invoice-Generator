import mongoose from "mongoose";
import { connectDatabase } from "../db/mongoose.js";
import { AuditLogModel } from "../models/AuditLog.js";
import { BusinessProfileModel } from "../models/BusinessProfile.js";
import { InvoiceModel } from "../models/Invoice.js";
import { InvoiceDraftModel } from "../models/InvoiceDraft.js";
import { SchemaMigrationModel } from "../models/SchemaMigration.js";
import { isProtectedEnvelope } from "../services/dataProtectionService.js";
import {
  protectBusinessProfileRecord,
  protectInvoiceRecord,
} from "../services/protectedRecordService.js";
import { sanitizeAuditData } from "../utils/auditSanitization.js";

const MIGRATION_NAME = "encrypt-sensitive-data-v1";
const CONFIRMATION = "encrypt-existing-records";

async function protectInvoices() {
  let encrypted = 0;
  const cursor = InvoiceModel.find().select("+protectedData").cursor();
  for await (const invoice of cursor) {
    if (isProtectedEnvelope(invoice.protectedData)) {
      continue;
    }
    Object.assign(
      invoice,
      protectInvoiceRecord(
        "invoice",
        invoice.toObject(),
        String(invoice.organizationId),
      ),
    );
    await invoice.save({ validateBeforeSave: false });
    encrypted += 1;
  }
  return encrypted;
}

async function protectDrafts() {
  let encrypted = 0;
  const cursor = InvoiceDraftModel.find().select("+protectedData").cursor();
  for await (const draft of cursor) {
    if (isProtectedEnvelope(draft.protectedData)) {
      continue;
    }
    Object.assign(
      draft,
      protectInvoiceRecord(
        "invoice-draft",
        draft.toObject(),
        String(draft.organizationId),
      ),
    );
    await draft.save({ validateBeforeSave: false });
    encrypted += 1;
  }
  return encrypted;
}

async function protectProfiles() {
  let encrypted = 0;
  const cursor = BusinessProfileModel.find().select("+protectedData").cursor();
  for await (const profile of cursor) {
    if (isProtectedEnvelope(profile.protectedData)) {
      continue;
    }
    Object.assign(
      profile,
      protectBusinessProfileRecord(
        profile.toObject(),
        String(profile.organizationId),
      ),
    );
    await profile.save({ validateBeforeSave: false });
    encrypted += 1;
  }
  return encrypted;
}

async function sanitizeAudits() {
  let sanitized = 0;
  const cursor = AuditLogModel.find({
    $or: [{ before: { $ne: null } }, { after: { $ne: null } }],
  }).cursor();
  for await (const audit of cursor) {
    audit.before = sanitizeAuditData(audit.before);
    audit.after = sanitizeAuditData(audit.after);
    if (audit.createdBy?.includes("@")) {
      audit.createdBy = "authenticated-user";
    }
    await audit.save({ validateBeforeSave: false });
    sanitized += 1;
  }
  return sanitized;
}

async function dropLegacySensitiveIndexes() {
  const indexes = [
    ["invoices", "partyName_text_invNo_text_roomNo_text_confirmNo_text"],
    ["invoicedrafts", "partyName_text_roomNo_text_confirmNo_text"],
  ] as const;
  for (const [collectionName, indexName] of indexes) {
    try {
      await mongoose.connection.collection(collectionName).dropIndex(indexName);
    } catch (error) {
      if ((error as { codeName?: string }).codeName !== "IndexNotFound") {
        throw error;
      }
    }
  }
}

async function run() {
  if (process.env.CONFIRM_SENSITIVE_DATA_MIGRATION !== CONFIRMATION) {
    throw new Error(
      `Set CONFIRM_SENSITIVE_DATA_MIGRATION=${CONFIRMATION} for this one-time operation`,
    );
  }
  await connectDatabase();
  const alreadyApplied = await SchemaMigrationModel.exists({
    name: MIGRATION_NAME,
  });
  if (alreadyApplied) {
    console.log(`${MIGRATION_NAME} was already applied.`);
    return;
  }

  const [invoices, drafts, profiles] = await Promise.all([
    protectInvoices(),
    protectDrafts(),
    protectProfiles(),
  ]);
  const audits = await sanitizeAudits();
  await dropLegacySensitiveIndexes();
  await SchemaMigrationModel.create({ name: MIGRATION_NAME });
  console.log(
    `Encrypted ${invoices} invoices, ${drafts} drafts, ${profiles} profiles; sanitized ${audits} audit entries.`,
  );
}

run()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Sensitive-data migration failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
