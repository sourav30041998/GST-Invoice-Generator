import { Schema, model } from "mongoose";

const lineItemSchema = new Schema(
  {
    presetKey: { type: String, default: "Custom" },
    description: { type: String, default: "" },
    hsn: { type: String, default: "" },
    date: { type: String, default: "" },
    units: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true, min: 0 },
    cgstRate: { type: Number, default: 0, min: 0, max: 100 },
    sgstRate: { type: Number, default: 0, min: 0, max: 100 },
    igstRate: { type: Number, default: 0, min: 0, max: 100 },
    taxInclusive: { type: Boolean, default: false },
    taxable: { type: Number, default: 0 },
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    taxTotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false },
);

const adjustmentSchema = new Schema(
  {
    desc: { type: String, default: "" },
    amount: { type: Number, required: true, min: 0 },
    type: { type: String, enum: ["add", "deduct"], default: "add" },
  },
  { _id: false },
);

const roomSnapshotSchema = new Schema(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "Room", required: true },
    roomNumber: { type: String, required: true, trim: true, maxlength: 40 },
    roomType: { type: String, default: "", trim: true, maxlength: 80 },
  },
  { _id: false },
);

const invoiceDraftSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      immutable: true,
      index: true,
    },
    businessProfileId: { type: Schema.Types.ObjectId, ref: "BusinessProfile" },
    invDate: { type: String, required: true },
    checkinDate: { type: String, default: "" },
    checkoutDate: { type: String, default: "" },
    confirmNo: { type: String, default: "" },
    partyName: { type: String, required: true, trim: true },
    partyGSTIN: { type: String, default: "" },
    partyAddress: { type: String, default: "" },
    partyState: { type: String, default: "" },
    groupName: { type: String, default: "" },
    roomNo: { type: String, default: "" },
    rooms: { type: [roomSnapshotSchema], default: [] },
    workflowStatus: {
      type: String,
      enum: ["draft"],
      default: "draft",
      index: true,
    },
    lineItems: { type: [lineItemSchema], default: [] },
    adjustments: { type: [adjustmentSchema], default: [] },
    totalTaxable: { type: Number, default: 0 },
    totalCGST: { type: Number, default: 0 },
    totalSGST: { type: Number, default: 0 },
    totalIGST: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    addTotal: { type: Number, default: 0 },
    deductTotal: { type: Number, default: 0 },
    netTotal: { type: Number, default: 0 },
    presetSnapshot: { type: Schema.Types.Mixed, required: true },
    businessSnapshot: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: String, default: "system", trim: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, minimize: false },
);

invoiceDraftSchema.index({ organizationId: 1, createdAt: -1 });
invoiceDraftSchema.index({
  organizationId: 1,
  workflowStatus: 1,
  createdAt: -1,
});
invoiceDraftSchema.index({
  organizationId: 1,
  partyName: "text",
  roomNo: "text",
  confirmNo: "text",
});

export const InvoiceDraftModel = model("InvoiceDraft", invoiceDraftSchema);
