import { Schema, model } from "mongoose";

const roomSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      immutable: true,
      index: true,
    },
    roomNumber: { type: String, required: true, trim: true, maxlength: 40 },
    normalizedRoomNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    roomType: { type: String, default: "", trim: true, maxlength: 80 },
    floor: { type: String, default: "", trim: true, maxlength: 40 },
    wing: { type: String, default: "", trim: true, maxlength: 40 },
    capacity: { type: Number, default: 1, min: 1, max: 50 },
    isActive: { type: Boolean, default: true, index: true },
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

roomSchema.index(
  { organizationId: 1, normalizedRoomNumber: 1 },
  { unique: true },
);
roomSchema.index({ organizationId: 1, isActive: 1, roomNumber: 1 });

export const RoomModel = model("Room", roomSchema);
