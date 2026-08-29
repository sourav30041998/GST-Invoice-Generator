import { Schema, model } from "mongoose";

const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true, select: false },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    csrfToken: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
  },
  { timestamps: true, minimize: false },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ absoluteExpiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1, expiresAt: 1 });

export const SessionModel = model("Session", sessionSchema);
