import { Schema, model } from "mongoose";

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      immutable: true,
      match: /^[a-z0-9-]{3,80}$/,
    },
    status: {
      type: String,
      enum: ["pending", "active", "suspended"],
      default: "active",
      index: true,
    },
    onboardingComplete: { type: Boolean, default: false },
  },
  { timestamps: true, minimize: false },
);

organizationSchema.index({ status: 1, createdAt: -1 });
organizationSchema.index({ createdAt: -1, _id: -1 });

export const OrganizationModel = model("Organization", organizationSchema);
