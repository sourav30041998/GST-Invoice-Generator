import { Types } from "mongoose";
import { z } from "zod";

const requestIdSchema = z.string().uuid();
const platformAdminIdSchema = z
  .string()
  .refine(Types.ObjectId.isValid, "Platform administrator is invalid");

const commandContextSchema = z.object({
  requestId: requestIdSchema,
  platformAdminId: platformAdminIdSchema,
});

const safeDisplayText = (minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .refine(
      (value) => !/[\u0000-\u001f\u007f]/.test(value),
      "Control characters are not allowed",
    );

export const internalObjectIdParamSchema = z
  .object({ id: z.string().refine(Types.ObjectId.isValid, "Record not found") })
  .strict();

export const internalListQuerySchema = z
  .object({
    cursor: z.string().trim().min(1).max(320).optional(),
    limit: z.coerce.number().int().min(5).max(25).default(12),
  })
  .strict();

export const issueInvitationCommandSchema = commandContextSchema
  .extend({
    organizationName: safeDisplayText(2, 160),
    ownerName: safeDisplayText(2, 120),
    ownerEmail: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    expiresInHours: z.coerce
      .number()
      .int()
      .refine(
        (value) => [1, 6, 24].includes(value),
        "Choose an expiry of 1, 6, or 24 hours",
      ),
  })
  .strict();

export const renewInvitationCommandSchema = commandContextSchema
  .extend({
    expiresInHours: z.coerce
      .number()
      .int()
      .refine(
        (value) => [1, 6, 24].includes(value),
        "Choose an expiry of 1, 6, or 24 hours",
      )
      .default(24),
  })
  .strict();

export const internalCommandSchema = commandContextSchema.strict();

export const updateOrganizationStatusCommandSchema = commandContextSchema
  .extend({ status: z.enum(["active", "suspended"]) })
  .strict();

export type IssueInvitationCommand = z.infer<
  typeof issueInvitationCommandSchema
>;
export type RenewInvitationCommand = z.infer<
  typeof renewInvitationCommandSchema
>;
export type InternalCommand = z.infer<typeof internalCommandSchema>;
export type UpdateOrganizationStatusCommand = z.infer<
  typeof updateOrganizationStatusCommandSchema
>;
export type InternalListQuery = z.infer<typeof internalListQuerySchema>;
