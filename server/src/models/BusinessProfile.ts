import { Schema, model } from "mongoose";

const addressSchema = new Schema(
  {
    line1: { type: String, default: "", trim: true },
    line2: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const contactSchema = new Schema(
  {
    phone: { type: String, default: "", trim: true },
    fax: { type: String, default: "", trim: true },
    upi: { type: String, default: "", trim: true },
    website: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true, lowercase: true },
  },
  { _id: false },
);

const bankDetailsSchema = new Schema(
  {
    accountName: { type: String, default: "", trim: true },
    bankName: { type: String, default: "", trim: true },
    accountNumber: { type: String, default: "", trim: true },
    ifsc: { type: String, default: "", trim: true, uppercase: true },
  },
  { _id: false },
);

const taxPresetSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 80 },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    hsn: { type: String, default: "", trim: true, maxlength: 16 },
    cgstRate: { type: Number, required: true, min: 0, max: 100 },
    sgstRate: { type: Number, required: true, min: 0, max: 100 },
    igstRate: { type: Number, required: true, min: 0, max: 100 },
    allowInclusive: { type: Boolean, default: false },
    note: { type: String, default: "", trim: true, maxlength: 240 },
  },
  { _id: false },
);

const businessProfileSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      immutable: true,
      unique: true,
      index: true,
    },
    profileKey: {
      type: String,
      required: true,
      unique: true,
      default: "default",
      trim: true,
    },
    businessName: { type: String, required: true, trim: true },
    tagline: { type: String, default: "", trim: true },
    gstin: { type: String, default: "", trim: true, uppercase: true },
    address: { type: addressSchema, default: () => ({}) },
    contact: { type: contactSchema, default: () => ({}) },
    invoicePrefix: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    bankDetails: { type: bankDetailsSchema, default: () => ({}) },
    protectedData: { type: String, select: false },
    taxPresets: {
      type: [taxPresetSchema],
      default: [],
      validate: {
        validator: (presets: Array<{ key?: string; label?: string }> = []) =>
          presets.every(
            (preset) =>
              preset.key?.trim().toLowerCase() !== "custom" &&
              preset.label?.trim().toLowerCase() !== "custom",
          ),
        message:
          "Custom is invoice-only and cannot be stored as a company preset",
      },
    },
    terms: { type: String, default: "", trim: true },
    logoDataUrl: { type: String, default: "" },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, minimize: false },
);

businessProfileSchema.index({ organizationId: 1, isActive: 1, updatedAt: -1 });

export const BusinessProfileModel = model(
  "BusinessProfile",
  businessProfileSchema,
);
