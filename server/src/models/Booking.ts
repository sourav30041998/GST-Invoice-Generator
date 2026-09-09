import { Schema, model } from "mongoose";

const bookingRoomSchema = new Schema(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "Room", required: true },
    roomNumber: { type: String, required: true, trim: true, maxlength: 40 },
    roomType: { type: String, default: "", trim: true, maxlength: 80 },
  },
  { _id: false },
);

const bookingSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
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
    confirmationNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    idempotencyKeyHash: {
      type: String,
      immutable: true,
      select: false,
    },
    checkinDate: { type: String, required: true, index: true },
    checkoutDate: { type: String, required: true, index: true },
    rooms: { type: [bookingRoomSchema], default: [] },
    guestCount: { type: Number, default: 1, min: 1, max: 100 },
    estimatedTotalMinor: {
      type: Number,
      default: 0,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
    },
    advanceBalanceMinor: {
      type: Number,
      default: 0,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
    },
    status: {
      type: String,
      enum: [
        "enquiry",
        "pendingAdvance",
        "confirmed",
        "cancelled",
        "completed",
      ],
      default: "enquiry",
      index: true,
    },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", index: true },
    invoiceNumber: { type: String, default: "", trim: true, maxlength: 40 },
    protectedData: { type: String, required: true, select: false },
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

bookingSchema.index(
  { organizationId: 1, confirmationNumber: 1 },
  { unique: true },
);
bookingSchema.index(
  { organizationId: 1, idempotencyKeyHash: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKeyHash: { $type: "string" } },
  },
);
bookingSchema.index({ organizationId: 1, customerId: 1, createdAt: -1 });
bookingSchema.index({ organizationId: 1, status: 1, checkinDate: 1 });
bookingSchema.index({ organizationId: 1, "rooms.roomId": 1, createdAt: -1 });

export const BookingModel = model("Booking", bookingSchema);
