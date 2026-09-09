import { Schema, model } from "mongoose";

const connectionSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      immutable: true,
      unique: true,
    },
    provider: { type: String, enum: ["gmail", "brevo"], required: true },
    status: {
      type: String,
      enum: ["pending", "connected", "reconnectRequired", "disconnected"],
      required: true,
    },
    // Sender identity and credentials are encrypted together, bound to this tenant.
    protectedData: { type: String, required: true, select: false },
    revision: { type: String, required: true },
    verifiedAt: Date,
    lastAcceptedAt: Date,
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, minimize: false },
);

const challengeSchema = new Schema(
  {
    _id: { type: String, required: true },
    organizationId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, required: true },
    stateHash: { type: String, required: true, unique: true },
    sessionBinding: { type: String, required: true },
    protectedData: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true },
);

// Mongo-backed limits survive process restarts and apply across all replicas.
const throttleSchema = new Schema({
  _id: { type: String, required: true },
  key: { type: String, required: true, unique: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true, expires: 0 },
});

export const OrganizationEmailConnectionModel = model(
  "OrganizationEmailConnection",
  connectionSchema,
);
export const EmailOAuthChallengeModel = model(
  "EmailOAuthChallenge",
  challengeSchema,
);
export const EmailThrottleModel = model("EmailThrottle", throttleSchema);
