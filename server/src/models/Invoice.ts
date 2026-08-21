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

const invoiceSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      immutable: true,
      index: true,
    },
    invNo: { type: String, required: true, trim: true },
    invoicePrefix: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
      index: true,
    },
    invoiceMonth: { type: String, default: "", trim: true, index: true },
    sequenceNo: { type: Number, min: 1 },
    sourceDraftId: { type: Schema.Types.ObjectId, ref: "InvoiceDraft" },
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
      enum: ["draft", "reserved", "checkedIn", "checkedOut", "cancelled"],
      default: "checkedOut",
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
    status: {
      type: String,
      enum: ["active", "cancelled"],
      default: "active",
      index: true,
    },
    recordStatus: {
      type: String,
      enum: ["active", "cancelled"],
      default: "active",
      index: true,
    },
    cancelledAt: { type: Date },
    presetSnapshot: { type: Schema.Types.Mixed, required: true },
    businessSnapshot: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: String, default: "system", trim: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, minimize: false },
);

invoiceSchema.index({ organizationId: 1, invNo: 1 }, { unique: true });
invoiceSchema.index({ organizationId: 1, invDate: -1 });
invoiceSchema.index(
  { organizationId: 1, invoicePrefix: 1, invoiceMonth: 1, sequenceNo: 1 },
  {
    unique: true,
    partialFilterExpression: {
      invoicePrefix: { $type: "string" },
      invoiceMonth: { $type: "string" },
      sequenceNo: { $type: "number" },
    },
  },
);
invoiceSchema.index({ organizationId: 1, workflowStatus: 1, createdAt: -1 });
invoiceSchema.index({
  organizationId: 1,
  partyName: "text",
  invNo: "text",
  roomNo: "text",
  confirmNo: "text",
});

export const InvoiceModel = model("Invoice", invoiceSchema);
