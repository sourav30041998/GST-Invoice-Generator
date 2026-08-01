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

const businessProfileSchema = new Schema(
  {
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
    terms: { type: String, default: "", trim: true },
    logoDataUrl: { type: String, default: "" },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, minimize: false },
);

businessProfileSchema.index({ isActive: 1, updatedAt: -1 });

export const BusinessProfileModel = model(
  "BusinessProfile",
  businessProfileSchema,
);
