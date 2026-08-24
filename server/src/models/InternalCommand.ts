import { Schema, model } from "mongoose";

const internalCommandSchema = new Schema(
  {
    _id: { type: String, required: true },
    operation: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      immutable: true,
    },
    requestDigest: {
      type: String,
      required: true,
      minlength: 64,
      maxlength: 64,
      immutable: true,
      select: false,
    },
    response: { type: Schema.Types.Mixed, required: true, select: false },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);

internalCommandSchema.index({ operation: 1, createdAt: -1 });

export const InternalCommandModel = model(
  "InternalCommand",
  internalCommandSchema,
);
