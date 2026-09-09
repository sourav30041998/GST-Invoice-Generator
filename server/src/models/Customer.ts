import { Schema, model } from "mongoose";

const customerSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      immutable: true,
      index: true,
    },
    displayName: {
      type: String,
      default: "Protected customer",
      trim: true,
      maxlength: 160,
    },
    phoneLookupHash: {
      type: String,
      required: true,
      select: false,
    },
    searchTokens: { type: [String], default: [], select: false },
    protectedData: { type: String, required: true, select: false },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
    minimize: false,
    optimisticConcurrency: true,
    versionKey: "version",
  },
);

customerSchema.index(
  { organizationId: 1, phoneLookupHash: 1 },
  { unique: true },
);
customerSchema.index({ organizationId: 1, searchTokens: 1 });
customerSchema.index({ organizationId: 1, status: 1, updatedAt: -1 });

export const CustomerModel = model("Customer", customerSchema);
