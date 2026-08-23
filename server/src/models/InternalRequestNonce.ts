import { Schema, model } from "mongoose";

const internalRequestNonceSchema = new Schema(
  {
    _id: {
      type: String,
      required: true,
      immutable: true,
    },
    expiresAt: { type: Date, required: true, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);

internalRequestNonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const InternalRequestNonceModel = model(
  "InternalRequestNonce",
  internalRequestNonceSchema,
);
