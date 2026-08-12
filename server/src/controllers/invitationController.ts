import mongoose from "mongoose";
import type { RequestHandler } from "express";
import { z } from "zod";
import { sendUserSession } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { AuditLogModel } from "../models/AuditLog.js";
import { OrganizationInvitationModel } from "../models/OrganizationInvitation.js";
import { OrganizationModel } from "../models/Organization.js";
import { UserModel } from "../models/User.js";
import { hashPassword } from "../services/passwordService.js";
import { createInitialBusinessProfile } from "../services/settingsService.js";
import { invitationTokenHash } from "../services/invitationTokenService.js";

const acceptInvitationSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(40)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/),
    password: z
      .string()
      .min(12, "Password must be at least 12 characters")
      .max(128)
      .refine(
        (value) =>
          /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value),
        "Password must include upper-case, lower-case, and numeric characters",
      ),
  })
  .strict();

export const acceptOrganizationInvitation: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const values = acceptInvitationSchema.parse(req.body);
    const session = await mongoose.startSession();
    let accepted:
      | {
          userId: string;
          organizationId: string;
          organizationName: string;
          email: string;
          displayName: string;
        }
      | undefined;

    try {
      await session.withTransaction(async () => {
        const invitation = await OrganizationInvitationModel.findOne({
          tokenHash: invitationTokenHash(values.token),
        })
          .select("+tokenHash")
          .session(session);
        if (
          !invitation ||
          invitation.acceptedAt ||
          invitation.revokedAt ||
          invitation.expiresAt <= new Date()
        ) {
          throw new ApiError(400, "Invitation cannot be accepted");
        }

        const organization = await OrganizationModel.findOne({
          _id: invitation.organizationId,
          status: "pending",
        }).session(session);
        if (!organization) {
          throw new ApiError(400, "Invitation cannot be accepted");
        }

        const existingUser = await UserModel.exists({
          email: invitation.email,
        }).session(session);
        if (existingUser) {
          throw new ApiError(409, "Invitation cannot be accepted");
        }

        const passwordHash = await hashPassword(values.password);
        const owner = await UserModel.create(
          [
            {
              organizationId: organization._id,
              email: invitation.email,
              displayName: invitation.ownerName,
              passwordHash,
              role: "owner",
            },
          ],
          { session },
        );
        await createInitialBusinessProfile(
          String(organization._id),
          organization.name,
          invitation.email,
          session,
        );
        organization.status = "active";
        await organization.save({ session });
        invitation.acceptedAt = new Date();
        invitation.acceptedByUserId = owner[0]._id;
        await invitation.save({ session });
        await AuditLogModel.create(
          [
            {
              organizationId: organization._id,
              actorUserId: owner[0]._id,
              action: "organization_onboarding_completed",
              entityType: "organization",
              entityId: String(organization._id),
              after: { invitationId: String(invitation._id) },
            },
          ],
          { session },
        );

        accepted = {
          userId: String(owner[0]._id),
          organizationId: String(organization._id),
          organizationName: organization.name,
          email: invitation.email,
          displayName: invitation.ownerName,
        };
      });
    } finally {
      await session.endSession();
    }

    if (!accepted) {
      throw new Error("Invitation acceptance could not be completed");
    }

    await sendUserSession(res, {
      ...accepted,
      role: "owner",
    });
  } catch (error) {
    next(error);
  }
};
