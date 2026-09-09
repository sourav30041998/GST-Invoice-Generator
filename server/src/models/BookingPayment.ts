import { Schema, model } from "mongoose";

const bookingPaymentSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      immutable: true,
      index: true,
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      immutable: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      immutable: true,
      index: true,
    },
    receiptNumber: { type: String, required: true, trim: true, maxlength: 40 },
    type: {
      type: String,
      enum: ["advance", "refund"],
      required: true,
      immutable: true,
    },
    amountMinor: {
      type: Number,
      required: true,
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      immutable: true,
    },
    method: {
      type: String,
      enum: ["cash", "card", "upi", "bankTransfer", "other"],
      required: true,
      immutable: true,
    },
    receivedAt: { type: Date, required: true, immutable: true },
    idempotencyKeyHash: {
      type: String,
      required: true,
      immutable: true,
      select: false,
    },
    protectedData: { type: String, required: true, select: false },
    status: {
      type: String,
      enum: ["recorded", "voided"],
      default: "recorded",
      index: true,
    },
    voidedAt: { type: Date },
    voidReason: { type: String, default: "", trim: true, maxlength: 240 },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, minimize: false },
);

bookingPaymentSchema.index(
  { organizationId: 1, receiptNumber: 1 },
  { unique: true },
);
bookingPaymentSchema.index(
  { organizationId: 1, idempotencyKeyHash: 1 },
  { unique: true },
);
bookingPaymentSchema.index({ organizationId: 1, bookingId: 1, createdAt: -1 });

export const BookingPaymentModel = model(
  "BookingPayment",
  bookingPaymentSchema,
);
