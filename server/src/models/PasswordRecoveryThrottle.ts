import { Schema, model } from "mongoose";

const passwordRecoveryThrottleSchema = new Schema(
  {
    emailHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },
    requestCount: { type: Number, required: true, min: 0, default: 0 },
    otpAttemptCount: { type: Number, required: true, min: 0, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, minimize: false },
);

passwordRecoveryThrottleSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 },
);

export const PasswordRecoveryThrottleModel = model(
  "PasswordRecoveryThrottle",
  passwordRecoveryThrottleSchema,
);

