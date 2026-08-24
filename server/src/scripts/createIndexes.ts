import mongoose from "mongoose";
import { connectDatabase } from "../db/mongoose.js";
import { AuditLogModel } from "../models/AuditLog.js";
import { BusinessProfileModel } from "../models/BusinessProfile.js";
import { CounterModel } from "../models/Counter.js";
import { InvoiceDraftModel } from "../models/InvoiceDraft.js";
import { InvoiceModel } from "../models/Invoice.js";
import { OrganizationModel } from "../models/Organization.js";
import { OrganizationInvitationModel } from "../models/OrganizationInvitation.js";
import { PasswordRecoveryChallengeModel } from "../models/PasswordRecoveryChallenge.js";
import { PasswordRecoveryThrottleModel } from "../models/PasswordRecoveryThrottle.js";
import { ReferenceDataModel } from "../models/ReferenceData.js";
import { RoomAllocationModel } from "../models/RoomAllocation.js";
import { RoomModel } from "../models/Room.js";
import { SchemaMigrationModel } from "../models/SchemaMigration.js";
import { SessionModel } from "../models/Session.js";
import { SettingModel } from "../models/Setting.js";
import { UserModel } from "../models/User.js";

const models = [
  AuditLogModel,
  BusinessProfileModel,
  CounterModel,
  InvoiceDraftModel,
  InvoiceModel,
  OrganizationModel,
  OrganizationInvitationModel,
  PasswordRecoveryChallengeModel,
  PasswordRecoveryThrottleModel,
  ReferenceDataModel,
  RoomAllocationModel,
  RoomModel,
  SchemaMigrationModel,
  SessionModel,
  SettingModel,
  UserModel,
];

const legacyIndexes = [
  ["invoices", "invNo_1"],
  ["invoices", "invoicePrefix_1_invoiceMonth_1_sequenceNo_1"],
  ["invoices", "partyName_text_invNo_text_roomNo_text_confirmNo_text"],
  ["counters", "prefix_1_period_1"],
  ["invoicedrafts", "partyName_text_roomNo_text_confirmNo_text"],
] as const;

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

async function createIndexes() {
  try {
    await connectDatabase();
    await Promise.all(
      legacyIndexes.map(([collection, index]) =>
        dropIndexIfPresent(collection, index),
      ),
    );
    await Promise.all(models.map((model) => model.createIndexes()));
    console.log(`MongoDB indexes are ready for ${models.length} collections.`);
  } finally {
    await mongoose.disconnect();
  }
}

createIndexes().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Failed to create MongoDB indexes: ${message}`);
  process.exit(1);
});
