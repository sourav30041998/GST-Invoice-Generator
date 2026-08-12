import crypto from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { defaultPreset } from "../config/defaultPreset.js";
import { connectDatabase } from "../db/mongoose.js";
import { AuditLogModel } from "../models/AuditLog.js";
import { BusinessProfileModel } from "../models/BusinessProfile.js";
import { CounterModel } from "../models/Counter.js";
import { InvoiceModel } from "../models/Invoice.js";
import { InvoiceDraftModel } from "../models/InvoiceDraft.js";
import { OrganizationModel } from "../models/Organization.js";
import { OrganizationInvitationModel } from "../models/OrganizationInvitation.js";
import { SchemaMigrationModel } from "../models/SchemaMigration.js";
import { SessionModel } from "../models/Session.js";
import { SettingModel } from "../models/Setting.js";
import { UserModel } from "../models/User.js";
import { hashPassword } from "../services/passwordService.js";

const MIGRATION_NAME = "2026-08-single-company-tenancy";

const migrationEnvSchema = z.object({
  LEGACY_MIGRATION_OWNER_EMAIL: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  LEGACY_MIGRATION_OWNER_NAME: z.string().trim().min(2).max(120),
  LEGACY_MIGRATION_OWNER_PASSWORD: z
    .string()
    .min(12)
    .max(128)
    .refine(
      (value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value),
      "Owner password must include upper-case, lower-case, and numeric characters",
    ),
});

function organizationSlug(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 68);
  return `${base || "company"}-${crypto.randomBytes(4).toString("hex")}`;
}

async function dropIndexIfPresent(collection: string, index: string) {
  try {
    await mongoose.connection.collection(collection).dropIndex(index);
    console.log(`Dropped legacy index ${collection}.${index}`);
  } catch (error) {
    const codeName = error as { codeName?: string };
    if (codeName.codeName !== "IndexNotFound") {
      throw error;
    }
  }
}

async function rebuildTenantIndexes() {
  await dropIndexIfPresent("invoices", "invNo_1");
  await dropIndexIfPresent(
    "invoices",
    "invoicePrefix_1_invoiceMonth_1_sequenceNo_1",
  );
  await dropIndexIfPresent(
    "invoices",
    "partyName_text_invNo_text_roomNo_text_confirmNo_text",
  );
  await dropIndexIfPresent("counters", "prefix_1_period_1");
  await dropIndexIfPresent(
    "invoicedrafts",
    "partyName_text_roomNo_text_confirmNo_text",
  );

  await Promise.all([
    AuditLogModel.createIndexes(),
    BusinessProfileModel.createIndexes(),
    CounterModel.createIndexes(),
    InvoiceDraftModel.createIndexes(),
    InvoiceModel.createIndexes(),
    OrganizationModel.createIndexes(),
    OrganizationInvitationModel.createIndexes(),
    SchemaMigrationModel.createIndexes(),
    SessionModel.createIndexes(),
    UserModel.createIndexes(),
  ]);
}

async function migrate() {
  const migrationEnv = migrationEnvSchema.parse(process.env);
  await connectDatabase();

  const alreadyApplied = await SchemaMigrationModel.exists({
    name: MIGRATION_NAME,
  });
  if (alreadyApplied) {
    await rebuildTenantIndexes();
    console.log("Single-company tenancy migration is already complete.");
    return;
  }

  const legacyProfile = await BusinessProfileModel.findOne({
    organizationId: { $exists: false },
  }).lean();
  const organizationName =
    legacyProfile?.businessName || defaultPreset.business_name;

  const existingEmail = await UserModel.exists({
    email: migrationEnv.LEGACY_MIGRATION_OWNER_EMAIL,
  });
  if (existingEmail) {
    throw new Error("The migration owner email is already registered");
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const organization = await OrganizationModel.create(
        [
          {
            name: organizationName,
            slug: organizationSlug(organizationName),
            onboardingComplete: true,
          },
        ],
        { session },
      );
      const organizationId = String(organization[0]._id);
      const passwordHash = await hashPassword(
        migrationEnv.LEGACY_MIGRATION_OWNER_PASSWORD,
      );
      const owner = await UserModel.create(
        [
          {
            organizationId,
            email: migrationEnv.LEGACY_MIGRATION_OWNER_EMAIL,
            displayName: migrationEnv.LEGACY_MIGRATION_OWNER_NAME,
            passwordHash,
            role: "owner",
          },
        ],
        { session },
      );
      const ownerId = String(owner[0]._id);

      if (legacyProfile) {
        await BusinessProfileModel.updateOne(
          { _id: legacyProfile._id },
          {
            $set: {
              organizationId,
              profileKey: `organization-${organizationId}`,
            },
          },
          { session },
        );
      } else {
        await BusinessProfileModel.create(
          [
            {
              organizationId,
              profileKey: `organization-${organizationId}`,
              businessName: organizationName,
              tagline: defaultPreset.tagline,
              gstin: defaultPreset.gstin,
              address: {
                line1: defaultPreset.address_line1,
                line2: defaultPreset.address_line2,
              },
              contact: {
                phone: defaultPreset.phone,
                fax: defaultPreset.fax,
                upi: defaultPreset.upi,
                website: defaultPreset.website,
                email: migrationEnv.LEGACY_MIGRATION_OWNER_EMAIL,
              },
              invoicePrefix: defaultPreset.invoice_prefix,
              bankDetails: {
                accountName: defaultPreset.bank_acc_name,
                bankName: defaultPreset.bank_name,
                accountNumber: defaultPreset.bank_account,
                ifsc: defaultPreset.bank_ifsc,
              },
              terms: defaultPreset.terms,
              logoDataUrl: "",
              isActive: true,
            },
          ],
          { session },
        );
      }

      await Promise.all([
        InvoiceModel.updateMany(
          { organizationId: { $exists: false } },
          { $set: { organizationId, createdByUserId: ownerId } },
          { session },
        ),
        InvoiceDraftModel.updateMany(
          { organizationId: { $exists: false } },
          { $set: { organizationId, createdByUserId: ownerId } },
          { session },
        ),
        AuditLogModel.updateMany(
          { organizationId: { $exists: false } },
          { $set: { organizationId, actorUserId: ownerId } },
          { session },
        ),
      ]);

      const counters = await CounterModel.find({
        organizationId: { $exists: false },
      }).session(session);
      await Promise.all(
        counters.map((counter) => {
          counter.organizationId = new mongoose.Types.ObjectId(organizationId);
          counter.scope = `${organizationId}:${counter.prefix}-${counter.period}`;
          return counter.save({ session });
        }),
      );

      await SettingModel.deleteMany({}, { session });
      await SchemaMigrationModel.create([{ name: MIGRATION_NAME }], {
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  await rebuildTenantIndexes();
  console.log("Single-company tenancy migration completed successfully.");
}

migrate()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Single-company tenancy migration failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
