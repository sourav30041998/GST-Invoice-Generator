import { Schema, model } from "mongoose";

const organizationInvitationSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      immutable: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      index: true,
    },
    ownerName: { type: String, required: true, trim: true, maxlength: 120 },
    tokenHash: { type: String, required: true, unique: true, select: false },
    tokenHint: { type: String, required: true, trim: true, maxlength: 16 },
    expiresAt: { type: Date, required: true, index: true },
    acceptedAt: { type: Date },
    revokedAt: { type: Date },
    emailDeliveryStatus: {
      type: String,
      enum: ["pending", "sending", "sent", "failed"],
      default: "pending",
      required: true,
    },
    emailLastAttemptAt: { type: Date },
    emailSentAt: { type: Date },
    emailDeliveryLeaseUntil: { type: Date, select: false },
    acceptedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    issuedByPlatformAdminId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
      index: true,
    },
  },
  { timestamps: true, minimize: false },
);

organizationInvitationSchema.index({ organizationId: 1, createdAt: -1 });
organizationInvitationSchema.index({ email: 1, acceptedAt: 1, revokedAt: 1 });
organizationInvitationSchema.index({ createdAt: -1, _id: -1 });
organizationInvitationSchema.index(
  { email: 1 },
  {
    name: "unique_open_invitation_per_email",
    unique: true,
    partialFilterExpression: {
      acceptedAt: null,
      revokedAt: null,
    },
  },
);

export const OrganizationInvitationModel = model(
  "OrganizationInvitation",
  organizationInvitationSchema,
);
