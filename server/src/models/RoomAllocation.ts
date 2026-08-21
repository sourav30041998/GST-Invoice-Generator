import { Schema, model } from "mongoose";

const roomAllocationSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      immutable: true,
      index: true,
    },
    roomId: {
      type: Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      immutable: true,
      index: true,
    },
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
      immutable: true,
      index: true,
    },
    invoiceNumber: { type: String, required: true, trim: true, maxlength: 40 },
    roomNumberSnapshot: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    checkinDate: { type: String, required: true },
    checkoutDate: { type: String, required: true },
    status: {
      type: String,
      enum: ["reserved", "checkedIn", "checkedOut", "cancelled"],
      required: true,
      index: true,
    },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, minimize: false },
);

roomAllocationSchema.index(
  { organizationId: 1, invoiceId: 1, roomId: 1 },
  { unique: true },
);
roomAllocationSchema.index({
  organizationId: 1,
  roomId: 1,
  status: 1,
  checkinDate: 1,
  checkoutDate: 1,
});
roomAllocationSchema.index({
  organizationId: 1,
  status: 1,
  checkinDate: 1,
  checkoutDate: 1,
});
roomAllocationSchema.index({ organizationId: 1, invoiceNumber: 1 });
roomAllocationSchema.index({ organizationId: 1, roomId: 1, createdAt: -1 });

export const RoomAllocationModel = model(
  "RoomAllocation",
  roomAllocationSchema,
);
