import { Schema, model } from "mongoose";

const referenceDataSchema = new Schema(
  {
    type: { type: String, required: true, trim: true, index: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    label: { type: String, required: true, trim: true },
    aliases: { type: [String], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
    active: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, minimize: false },
);

referenceDataSchema.index({ type: 1, code: 1 }, { unique: true });
referenceDataSchema.index({ type: 1, active: 1, sortOrder: 1, label: 1 });
referenceDataSchema.index({ label: "text", aliases: "text" });

export const ReferenceDataModel = model("ReferenceData", referenceDataSchema);
