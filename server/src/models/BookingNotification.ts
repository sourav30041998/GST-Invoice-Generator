import { Schema, model } from "mongoose";

const bookingNotificationSchema = new Schema(
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
    paymentId: { type: Schema.Types.ObjectId, ref: "BookingPayment" },
    channel: { type: String, enum: ["email", "whatsapp"], required: true },
    kind: {
      type: String,
      enum: ["confirmation", "advanceReceipt", "cancellation"],
      required: true,
    },
    idempotencyKeyHash: {
      type: String,
      immutable: true,
      select: false,
    },
    recipientHash: { type: String, required: true, select: false },
    status: {
      type: String,
      enum: ["pending", "sent", "failed", "skipped"],
      required: true,
      index: true,
    },
    errorCode: { type: String, default: "", trim: true, maxlength: 80 },
    protectedData: { type: String, select: false },
    sentAt: { type: Date },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, minimize: false },
);

bookingNotificationSchema.index({
  organizationId: 1,
  bookingId: 1,
  createdAt: -1,
});
bookingNotificationSchema.index({
  organizationId: 1,
  status: 1,
  createdAt: -1,
});
bookingNotificationSchema.index(
  { organizationId: 1, idempotencyKeyHash: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKeyHash: { $type: "string" } },
  },
);

export const BookingNotificationModel = model(
  "BookingNotification",
  bookingNotificationSchema,
);
