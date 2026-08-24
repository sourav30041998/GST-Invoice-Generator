import crypto from "node:crypto";
import { Types, type ClientSession } from "mongoose";
import { z } from "zod";
import { env } from "../config/env.js";
import { ApiError } from "../middleware/errorHandler.js";
import { AuditLogModel } from "../models/AuditLog.js";
import { OrganizationModel } from "../models/Organization.js";
import { OrganizationInvitationModel } from "../models/OrganizationInvitation.js";
import { SessionModel } from "../models/Session.js";
import { UserModel } from "../models/User.js";
import type {
  InternalCommand,
  InternalListQuery,
  IssueInvitationCommand,
  RenewInvitationCommand,
  UpdateOrganizationStatusCommand,
} from "../validation/internalProvisioningSchemas.js";
import { sendOrganizationInvitationEmail } from "./invitationEmailService.js";
import {
  deriveInvitationToken,
  invitationTokenHash,
} from "./invitationTokenService.js";
import { executeInternalCommand } from "./internalCommandService.js";

const DELIVERY_LEASE_MS = 2 * 60 * 1000;

const cursorPayloadSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string().refine(Types.ObjectId.isValid),
});

type InvitationRecord = {
  _id: unknown;
  organizationId: unknown;
  email: string;
  ownerName: string;
  tokenHint: string;
  expiresAt: Date;
  acceptedAt?: Date;
  revokedAt?: Date;
  emailDeliveryStatus?: "pending" | "sending" | "sent" | "failed";
  emailLastAttemptAt?: Date;
  emailSentAt?: Date;
  createdAt?: Date;
};

function cursorSignature(value: string) {
  return crypto
    .createHmac("sha256", env.ADMIN_INTERNAL_SHARED_SECRET)
    .update(`company-internal-pagination:${value}`)
    .digest("base64url");
}

function encodeCursor(record: { _id: unknown; createdAt?: Date }) {
  if (!record.createdAt) {
    return null;
  }
  const value = Buffer.from(
    JSON.stringify({
      createdAt: record.createdAt.toISOString(),
      id: String(record._id),
    }),
  ).toString("base64url");
  return `${value}.${cursorSignature(value)}`;
}

function decodeCursor(cursor?: string) {
  if (!cursor) {
    return null;
  }
  const [value, signature, ...extra] = cursor.split(".");
  if (!value || !signature || extra.length) {
    throw new ApiError(422, "Invalid page cursor");
  }
  const expected = Buffer.from(cursorSignature(value));
  const received = Buffer.from(signature);
  if (
    expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)
  ) {
    throw new ApiError(422, "Invalid page cursor");
  }
  try {
    return cursorPayloadSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
  } catch {
    throw new ApiError(422, "Invalid page cursor");
  }
}

function cursorFilter(cursor?: string) {
  const decoded = decodeCursor(cursor);
  if (!decoded) {
    return {};
  }
  const createdAt = new Date(decoded.createdAt);
  return {
    $or: [
      { createdAt: { $lt: createdAt } },
      { createdAt, _id: { $lt: new Types.ObjectId(decoded.id) } },
    ],
  };
}

function organizationSlug(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 68);
  return `${base || "company"}-${crypto.randomBytes(4).toString("hex")}`;
}

function invitationState(invitation: InvitationRecord) {
  if (invitation.acceptedAt) return "accepted" as const;
  if (invitation.revokedAt) return "revoked" as const;
  if (invitation.expiresAt <= new Date()) return "expired" as const;
  return "pending" as const;
}

function invitationResponse(
  invitation: InvitationRecord,
  organizationName: string,
) {
  const deliveryStatus = invitation.emailDeliveryStatus || "pending";
  return {
    id: String(invitation._id),
    organizationId: String(invitation.organizationId),
    organizationName,
    ownerEmail: invitation.email,
    ownerName: invitation.ownerName,
    tokenHint: invitation.tokenHint,
    status: invitationState(invitation),
    emailDeliveryStatus:
      deliveryStatus === "sending" ? ("pending" as const) : deliveryStatus,
    emailLastAttemptAt: invitation.emailLastAttemptAt?.toISOString() || null,
    emailSentAt: invitation.emailSentAt?.toISOString() || null,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt?.toISOString() || null,
  };
}

async function writeProvisioningAudit(
  organizationId: unknown,
  platformAdminId: string,
  requestId: string,
  action: string,
  entityType: string,
  entityId: unknown,
  after: unknown,
  session: ClientSession,
) {
  await AuditLogModel.create(
    [
      {
        organizationId,
        action,
        entityType,
        entityId: String(entityId),
        after,
        createdBy: `platform-admin:${platformAdminId}`,
        requestId,
      },
    ],
    { session },
  );
}

function duplicateKey(error: unknown) {
  return (error as { code?: number }).code === 11000;
}

async function loadInvitationResponse(invitationId: string) {
  const invitation =
    await OrganizationInvitationModel.findById(invitationId).lean();
  if (!invitation) {
    throw new ApiError(404, "Invitation not found");
  }
  const organization = await OrganizationModel.findById(
    invitation.organizationId,
  )
    .select("name")
    .lean();
  if (!organization) {
    throw new ApiError(404, "Organization not found");
  }
  return invitationResponse(invitation as InvitationRecord, organization.name);
}

async function deliverInvitation(
  invitationId: string,
  token: string,
  platformAdminId: string,
  requestId: string,
) {
  const now = new Date();
  const claimed = await OrganizationInvitationModel.findOneAndUpdate(
    {
      _id: invitationId,
      acceptedAt: { $exists: false },
      revokedAt: { $exists: false },
      $or: [
        { emailDeliveryStatus: { $in: ["pending", "failed"] } },
        {
          emailDeliveryStatus: "sending",
          emailDeliveryLeaseUntil: { $lte: now },
        },
      ],
    },
    {
      $set: {
        emailDeliveryStatus: "sending",
        emailLastAttemptAt: now,
        emailDeliveryLeaseUntil: new Date(now.getTime() + DELIVERY_LEASE_MS),
      },
    },
    { new: true },
  )
    .select("+emailDeliveryLeaseUntil")
    .lean();

  if (!claimed) {
    return loadInvitationResponse(invitationId);
  }

  const organization = await OrganizationModel.findById(claimed.organizationId)
    .select("name")
    .lean();
  if (!organization) {
    throw new ApiError(404, "Organization not found");
  }

  let status: "sent" | "failed" = "failed";
  try {
    await sendOrganizationInvitationEmail({
      recipientEmail: claimed.email,
      recipientName: claimed.ownerName,
      organizationName: organization.name,
      token,
      expiresAt: claimed.expiresAt,
    });
    status = "sent";
  } catch {
    console.error("Organization invitation email delivery failed");
  }

  const completedAt = new Date();
  await OrganizationInvitationModel.updateOne(
    { _id: claimed._id, emailDeliveryStatus: "sending" },
    {
      $set: {
        emailDeliveryStatus: status,
        emailLastAttemptAt: completedAt,
        ...(status === "sent" ? { emailSentAt: completedAt } : {}),
      },
      $unset: { emailDeliveryLeaseUntil: 1 },
    },
  );
  await AuditLogModel.create({
    organizationId: claimed.organizationId,
    action: `organization_invitation_email_${status}`,
    entityType: "organization_invitation",
    entityId: String(claimed._id),
    createdBy: `platform-admin:${platformAdminId}`,
    requestId,
  });
  return loadInvitationResponse(invitationId);
}

export async function getProvisioningOverview() {
  const now = new Date();
  const pending = {
    acceptedAt: { $exists: false },
    revokedAt: { $exists: false },
    expiresAt: { $gt: now },
  };
  const [
    totalOrganizations,
    activeOrganizations,
    totalInvitations,
    pendingInvitations,
    attentionInvitations,
  ] = await Promise.all([
    OrganizationModel.countDocuments(),
    OrganizationModel.countDocuments({ status: "active" }),
    OrganizationInvitationModel.countDocuments(),
    OrganizationInvitationModel.countDocuments(pending),
    OrganizationInvitationModel.countDocuments({
      ...pending,
      emailDeliveryStatus: { $nin: ["sent", "sending"] },
    }),
  ]);
  return {
    totalOrganizations,
    activeOrganizations,
    totalInvitations,
    pendingInvitations,
    attentionInvitations,
  };
}

export async function listProvisionedOrganizations(query: InternalListQuery) {
  const records = await OrganizationModel.find(cursorFilter(query.cursor))
    .sort({ createdAt: -1, _id: -1 })
    .limit(query.limit + 1)
    .lean();
  const hasNextPage = records.length > query.limit;
  const organizations = records.slice(0, query.limit);
  const owners = await UserModel.find({
    role: "owner",
    organizationId: { $in: organizations.map((item) => item._id) },
  })
    .select("organizationId email displayName")
    .lean();
  const ownerByOrganization = new Map(
    owners.map((owner) => [
      String(owner.organizationId),
      {
        email: owner.email,
        displayName: owner.displayName || owner.email,
      },
    ]),
  );
  return {
    organizations: organizations.map((organization) => ({
      id: String(organization._id),
      name: organization.name,
      status: organization.status,
      onboardingComplete: organization.onboardingComplete,
      createdAt: organization.createdAt?.toISOString() || null,
      owner: ownerByOrganization.get(String(organization._id)) || null,
    })),
    pagination: {
      nextCursor: hasNextPage ? encodeCursor(organizations.at(-1)!) : null,
      pageSize: query.limit,
    },
  };
}

export async function listProvisioningInvitations(query: InternalListQuery) {
  const records = await OrganizationInvitationModel.find(
    cursorFilter(query.cursor),
  )
    .sort({ createdAt: -1, _id: -1 })
    .limit(query.limit + 1)
    .lean();
  const hasNextPage = records.length > query.limit;
  const invitations = records.slice(0, query.limit);
  const organizations = await OrganizationModel.find({
    _id: { $in: invitations.map((item) => item.organizationId) },
  })
    .select("name")
    .lean();
  const names = new Map(
    organizations.map((organization) => [
      String(organization._id),
      organization.name,
    ]),
  );
  return {
    invitations: invitations.map((invitation) =>
      invitationResponse(
        invitation as InvitationRecord,
        names.get(String(invitation.organizationId)) || "Unknown company",
      ),
    ),
    pagination: {
      nextCursor: hasNextPage ? encodeCursor(invitations.at(-1)!) : null,
      pageSize: query.limit,
    },
  };
}

export async function issueOrganizationInvitation(
  command: IssueInvitationCommand,
) {
  const token = deriveInvitationToken(command.requestId);
  try {
    const result = await executeInternalCommand(
      command.requestId,
      "organization-invitation.issue",
      command,
      async (session) => {
        if (
          await UserModel.exists({ email: command.ownerEmail }).session(session)
        ) {
          throw new ApiError(409, "The owner email already has an account");
        }
        if (
          await OrganizationInvitationModel.exists({
            email: command.ownerEmail,
            acceptedAt: { $exists: false },
            revokedAt: { $exists: false },
          }).session(session)
        ) {
          throw new ApiError(
            409,
            "An open invitation already exists for this owner email; renew or revoke it first",
          );
        }

        const [organization] = await OrganizationModel.create(
          [
            {
              name: command.organizationName,
              slug: organizationSlug(command.organizationName),
              status: "pending",
            },
          ],
          { session },
        );
        const [invitation] = await OrganizationInvitationModel.create(
          [
            {
              organizationId: organization._id,
              email: command.ownerEmail,
              ownerName: command.ownerName,
              tokenHash: invitationTokenHash(token),
              tokenHint: token.slice(-8),
              expiresAt: new Date(
                Date.now() + command.expiresInHours * 60 * 60 * 1000,
              ),
              issuedByPlatformAdminId: command.platformAdminId,
            },
          ],
          { session },
        );
        await writeProvisioningAudit(
          organization._id,
          command.platformAdminId,
          command.requestId,
          "organization_invited",
          "organization",
          organization._id,
          { invitationId: String(invitation._id) },
          session,
        );
        return {
          invitationId: String(invitation._id),
        };
      },
    );
    return {
      invitation: await deliverInvitation(
        result.invitationId,
        token,
        command.platformAdminId,
        command.requestId,
      ),
    };
  } catch (error) {
    if (duplicateKey(error)) {
      throw new ApiError(
        409,
        "An organization or open invitation already exists with these details",
      );
    }
    throw error;
  }
}

export async function renewOrganizationInvitation(
  invitationId: string,
  command: RenewInvitationCommand,
) {
  const token = deriveInvitationToken(command.requestId);
  const result = await executeInternalCommand(
    command.requestId,
    "organization-invitation.renew",
    { invitationId, ...command },
    async (session) => {
      const invitation =
        await OrganizationInvitationModel.findById(invitationId).session(
          session,
        );
      if (!invitation || invitation.acceptedAt) {
        throw new ApiError(404, "Invitation not found");
      }
      const organization = await OrganizationModel.findOne({
        _id: invitation.organizationId,
        status: "pending",
      }).session(session);
      if (!organization) {
        throw new ApiError(409, "Only pending invitations can be renewed");
      }
      const revoked = await OrganizationInvitationModel.updateOne(
        {
          _id: invitation._id,
          acceptedAt: { $exists: false },
          revokedAt: { $exists: false },
        },
        { $set: { revokedAt: new Date() } },
        { session },
      );
      if (revoked.modifiedCount !== 1) {
        throw new ApiError(409, "Invitation is no longer active");
      }
      const [replacement] = await OrganizationInvitationModel.create(
        [
          {
            organizationId: organization._id,
            email: invitation.email,
            ownerName: invitation.ownerName,
            tokenHash: invitationTokenHash(token),
            tokenHint: token.slice(-8),
            expiresAt: new Date(
              Date.now() + command.expiresInHours * 60 * 60 * 1000,
            ),
            issuedByPlatformAdminId: command.platformAdminId,
          },
        ],
        { session },
      );
      await writeProvisioningAudit(
        organization._id,
        command.platformAdminId,
        command.requestId,
        "organization_invitation_renewed",
        "organization_invitation",
        invitationId,
        { replacementInvitationId: String(replacement._id) },
        session,
      );
      return { invitationId: String(replacement._id) };
    },
  );
  return {
    invitation: await deliverInvitation(
      result.invitationId,
      token,
      command.platformAdminId,
      command.requestId,
    ),
  };
}

export async function revokeOrganizationInvitation(
  invitationId: string,
  command: InternalCommand,
) {
  return executeInternalCommand(
    command.requestId,
    "organization-invitation.revoke",
    { invitationId, ...command },
    async (session) => {
      const invitation = await OrganizationInvitationModel.findOneAndUpdate(
        {
          _id: invitationId,
          acceptedAt: { $exists: false },
          revokedAt: { $exists: false },
        },
        { $set: { revokedAt: new Date() } },
        { new: true, session },
      );
      if (!invitation) {
        throw new ApiError(404, "Active invitation not found");
      }
      await writeProvisioningAudit(
        invitation.organizationId,
        command.platformAdminId,
        command.requestId,
        "organization_invitation_revoked",
        "organization_invitation",
        invitationId,
        {},
        session,
      );
      return { revoked: true };
    },
  );
}

export async function updateProvisionedOrganizationStatus(
  organizationId: string,
  command: UpdateOrganizationStatusCommand,
) {
  return executeInternalCommand(
    command.requestId,
    "organization.status.update",
    { organizationId, ...command },
    async (session) => {
      const organization = await OrganizationModel.findOne({
        _id: organizationId,
        status: { $ne: "pending" },
      }).session(session);
      if (!organization) {
        throw new ApiError(404, "Active or suspended organization not found");
      }
      const beforeStatus = organization.status;
      organization.status = command.status;
      await organization.save({ session });
      const revoked =
        command.status === "suspended"
          ? await SessionModel.deleteMany({ organizationId }, { session })
          : { deletedCount: 0 };
      await writeProvisioningAudit(
        organization._id,
        command.platformAdminId,
        command.requestId,
        command.status === "suspended"
          ? "organization_suspended"
          : "organization_activated",
        "organization",
        organization._id,
        {
          beforeStatus,
          status: command.status,
          sessionsRevoked: revoked.deletedCount,
        },
        session,
      );
      return { revokedSessionCount: revoked.deletedCount };
    },
  );
}

export async function revokeProvisionedOrganizationSessions(
  organizationId: string,
  command: InternalCommand,
) {
  return executeInternalCommand(
    command.requestId,
    "organization.sessions.revoke",
    { organizationId, ...command },
    async (session) => {
      const organization =
        await OrganizationModel.findById(organizationId).session(session);
      if (!organization) {
        throw new ApiError(404, "Organization not found");
      }
      const result = await SessionModel.deleteMany(
        { organizationId },
        { session },
      );
      await writeProvisioningAudit(
        organization._id,
        command.platformAdminId,
        command.requestId,
        "organization_sessions_revoked",
        "organization",
        organization._id,
        { sessionCount: result.deletedCount },
        session,
      );
      return { revokedSessionCount: result.deletedCount };
    },
  );
}
