import { Schema, model } from "mongoose";

const passwordRecoveryChallengeSchema = new Schema(
  {
    challengeTokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },
    emailHash: { type: String, required: true, select: false, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      index: true,
    },
    throttleId: {
      type: Schema.Types.ObjectId,
      ref: "PasswordRecoveryThrottle",
      required: true,
    },
    otpHash: { type: String, required: true, select: false },
    attemptCount: { type: Number, required: true, min: 0, default: 0 },
    expiresAt: { type: Date, required: true },
    verifiedAt: { type: Date },
    resetGrantHash: { type: String, select: false },
    resetGrantExpiresAt: { type: Date },
    consumedAt: { type: Date },
    supersededAt: { type: Date },
    deliveryStatus: {
      type: String,
      enum: ["queued", "sent", "failed", "suppressed"],
      required: true,
    },
    deliveryLastAttemptAt: { type: Date },
    requestFingerprintHash: { type: String, required: true, select: false },
    purgeAt: { type: Date, required: true },
  },
  { timestamps: true, minimize: false },
);

passwordRecoveryChallengeSchema.index(
  { purgeAt: 1 },
  { expireAfterSeconds: 0 },
);
passwordRecoveryChallengeSchema.index({ userId: 1, createdAt: -1 });
passwordRecoveryChallengeSchema.index({ organizationId: 1, createdAt: -1 });
passwordRecoveryChallengeSchema.index(
  { resetGrantHash: 1 },
  { unique: true, sparse: true },
);

export const PasswordRecoveryChallengeModel = model(
  "PasswordRecoveryChallenge",
  passwordRecoveryChallengeSchema,
);

