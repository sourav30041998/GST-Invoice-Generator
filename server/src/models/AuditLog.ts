import { Schema, model } from "mongoose";

const auditLogSchema = new Schema(
  {
    entityType: { type: String, required: true, trim: true, index: true },
    entityId: { type: String, required: true, trim: true, index: true },
    action: { type: String, required: true, trim: true, index: true },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    createdBy: { type: String, default: "system", trim: true },
    requestId: { type: String, default: "", trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

export const AuditLogModel = model("AuditLog", auditLogSchema);
