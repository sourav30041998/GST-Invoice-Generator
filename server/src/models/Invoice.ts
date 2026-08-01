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
<<<<<<< HEAD
    total: { type: Number, default: 0 }
  },
  { _id: false }
=======
    total: { type: Number, default: 0 },
  },
  { _id: false },
>>>>>>> codex/backend-api-data
);

const adjustmentSchema = new Schema(
  {
    desc: { type: String, default: "" },
    amount: { type: Number, required: true, min: 0 },
<<<<<<< HEAD
    type: { type: String, enum: ["add", "deduct"], default: "add" }
  },
  { _id: false }
=======
    type: { type: String, enum: ["add", "deduct"], default: "add" },
  },
  { _id: false },
>>>>>>> codex/backend-api-data
);

const invoiceSchema = new Schema(
  {
    invNo: { type: String, required: true, unique: true, trim: true },
<<<<<<< HEAD
=======
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
>>>>>>> codex/backend-api-data
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
<<<<<<< HEAD
    workflowStatus: { type: String, enum: ["draft", "checkedIn", "checkedOut", "cancelled"], default: "checkedOut", index: true },
=======
    workflowStatus: {
      type: String,
      enum: ["draft", "checkedIn", "checkedOut", "cancelled"],
      default: "checkedOut",
      index: true,
    },
>>>>>>> codex/backend-api-data
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
<<<<<<< HEAD
    status: { type: String, enum: ["active", "cancelled"], default: "active", index: true },
    cancelledAt: { type: Date },
    presetSnapshot: { type: Schema.Types.Mixed, required: true }
  },
  { timestamps: true, minimize: false }
);

invoiceSchema.index({ invDate: -1 });
invoiceSchema.index({ workflowStatus: 1, createdAt: -1 });
invoiceSchema.index({ partyName: "text", invNo: "text" });
=======
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
  },
  { timestamps: true, minimize: false },
);

invoiceSchema.index({ invDate: -1 });
invoiceSchema.index(
  { invoicePrefix: 1, invoiceMonth: 1, sequenceNo: 1 },
  {
    unique: true,
    partialFilterExpression: {
      invoicePrefix: { $type: "string" },
      invoiceMonth: { $type: "string" },
      sequenceNo: { $type: "number" },
    },
  },
);
invoiceSchema.index({ workflowStatus: 1, createdAt: -1 });
invoiceSchema.index({
  partyName: "text",
  invNo: "text",
  roomNo: "text",
  confirmNo: "text",
});
>>>>>>> codex/backend-api-data

export const InvoiceModel = model("Invoice", invoiceSchema);
