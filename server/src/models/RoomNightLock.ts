import { Schema, model } from "mongoose";

const roomNightLockSchema = new Schema(
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
    stayDate: { type: String, required: true, immutable: true, index: true },
    sourceType: {
      type: String,
      enum: ["booking", "invoice"],
      required: true,
      immutable: true,
    },
    sourceId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
      index: true,
    },
    sourceLabel: { type: String, required: true, trim: true, maxlength: 40 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);

roomNightLockSchema.index(
  { organizationId: 1, roomId: 1, stayDate: 1 },
  { unique: true },
);
roomNightLockSchema.index({
  organizationId: 1,
  sourceType: 1,
  sourceId: 1,
});

export const RoomNightLockModel = model("RoomNightLock", roomNightLockSchema);
