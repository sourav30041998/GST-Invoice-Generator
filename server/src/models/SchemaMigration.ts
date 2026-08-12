import { Schema, model } from "mongoose";

const schemaMigrationSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    appliedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: false },
);

export const SchemaMigrationModel = model(
  "SchemaMigration",
  schemaMigrationSchema,
);
