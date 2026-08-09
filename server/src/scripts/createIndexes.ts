import mongoose from "mongoose";
import { connectDatabase } from "../db/mongoose.js";
import { AuditLogModel } from "../models/AuditLog.js";
import { BusinessProfileModel } from "../models/BusinessProfile.js";
import { CounterModel } from "../models/Counter.js";
import { InvoiceDraftModel } from "../models/InvoiceDraft.js";
import { InvoiceModel } from "../models/Invoice.js";
import { ReferenceDataModel } from "../models/ReferenceData.js";
import { SettingModel } from "../models/Setting.js";

const models = [
  AuditLogModel,
  BusinessProfileModel,
  CounterModel,
  InvoiceDraftModel,
  InvoiceModel,
  ReferenceDataModel,
  SettingModel,
];

async function createIndexes() {
  try {
    await connectDatabase();
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
