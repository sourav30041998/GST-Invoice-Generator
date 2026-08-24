import mongoose, { Types } from "mongoose";
import { env } from "../config/env.js";
import { ApiError } from "../middleware/errorHandler.js";
import { AuditLogModel } from "../models/AuditLog.js";
import { OrganizationModel } from "../models/Organization.js";
import { PasswordRecoveryChallengeModel } from "../models/PasswordRecoveryChallenge.js";
import { PasswordRecoveryThrottleModel } from "../models/PasswordRecoveryThrottle.js";
import { SessionModel } from "../models/Session.js";
import { UserModel } from "../models/User.js";
import { hashPassword, verifyPassword } from "./passwordService.js";
import {
  generateRecoveryOtp,
  generateRecoveryToken,
  hashRecoveryChallenge,
  hashRecoveryEmail,
  hashRecoveryOtp,
  hashRecoveryRequestFingerprint,
  hashRecoveryResetGrant,
  PASSWORD_RECOVERY_MAX_OTP_ATTEMPTS,
  PASSWORD_RECOVERY_MAX_REQUESTS,
  PASSWORD_RECOVERY_OTP_TTL_SECONDS,
  PASSWORD_RECOVERY_REQUEST_WINDOW_MS,
  PASSWORD_RECOVERY_RESEND_SECONDS,
  PASSWORD_RECOVERY_RESET_TTL_SECONDS,
  safeHashEqual,
} from "../utils/passwordRecoveryTokens.js";

const RECOVERY_RECORD_RETENTION_MS = 30 * 60 * 1000;
const INVALID_CODE_MESSAGE = "The code is invalid or has expired";
const INVALID_RESET_MESSAGE =
  "The password reset session is invalid or has expired";

type RecoveryRequestContext = {
  ipAddress: string;
  userAgent: string;
};

type RecoveryEmailDelivery = {
  challengeId: string;
  recipientEmail: string;
  recipientName: string;
  organizationName: string;
  otp: string;
  expiresAt: Date;
};

type PasswordChangedNotification = {
  recipientEmail: string;
  recipientName: string;
  organizationName: string;
  changedAt: Date;
};

function isDuplicateKeyError(error: unknown) {
  return (error as { code?: number }).code === 11000;
}

async function acquireRecoveryRequestSlot(emailHash: string, now: Date) {
  const expiresAt = new Date(
    now.getTime() + PASSWORD_RECOVERY_REQUEST_WINDOW_MS,
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const active = await PasswordRecoveryThrottleModel.findOneAndUpdate(
      {
        emailHash,
        expiresAt: { $gt: now },
        requestCount: { $lt: PASSWORD_RECOVERY_MAX_REQUESTS },
      },
      { $inc: { requestCount: 1 } },
      { new: true },
    );
    if (active) {
      return active;
    }

    const blocked = await PasswordRecoveryThrottleModel.exists({
      emailHash,
      expiresAt: { $gt: now },
    });
    if (blocked) {
      return null;
    }

    const refreshed = await PasswordRecoveryThrottleModel.findOneAndUpdate(
      { emailHash, expiresAt: { $lte: now } },
      {
        $set: {
          requestCount: 1,
          otpAttemptCount: 0,
          expiresAt,
        },
      },
      { new: true },
    );
    if (refreshed) {
      return refreshed;
    }

    try {
      return await PasswordRecoveryThrottleModel.create({
        emailHash,
        requestCount: 1,
        otpAttemptCount: 0,
        expiresAt,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  }

  return null;
}

export async function createPasswordRecoveryRequest(
  email: string,
  context: RecoveryRequestContext,
) {
  const now = new Date();
  const challengeToken = generateRecoveryToken();
  const otp = generateRecoveryOtp();
  const expiresAt = new Date(
    now.getTime() + PASSWORD_RECOVERY_OTP_TTL_SECONDS * 1000,
  );
  const emailHash = hashRecoveryEmail(env.PASSWORD_RESET_SECRET, email);
  const throttle = await acquireRecoveryRequestSlot(emailHash, now);

  const user = await UserModel.findOne({ email, status: "active" }).lean();
  const organization = await OrganizationModel.findOne({
    _id: user?.organizationId || new Types.ObjectId(),
    status: "active",
  }).lean();

  if (!throttle) {
    return {
      challengeToken,
      expiresInSeconds: PASSWORD_RECOVERY_OTP_TTL_SECONDS,
      resendAfterSeconds: PASSWORD_RECOVERY_RESEND_SECONDS,
      delivery: undefined,
    };
  }

  await PasswordRecoveryChallengeModel.updateMany(
    {
      emailHash,
      consumedAt: null,
      supersededAt: null,
    },
    { $set: { supersededAt: now } },
  );

  const recognizedAccount = Boolean(user && organization);
  const challenge = await PasswordRecoveryChallengeModel.create({
    challengeTokenHash: hashRecoveryChallenge(
      env.PASSWORD_RESET_SECRET,
      challengeToken,
    ),
    emailHash,
    ...(recognizedAccount
      ? {
          userId: user?._id,
          organizationId: organization?._id,
        }
      : {}),
    throttleId: throttle._id,
    otpHash: hashRecoveryOtp(
      env.PASSWORD_RESET_SECRET,
      challengeToken,
      otp,
    ),
    attemptCount: 0,
    expiresAt,
    deliveryStatus: recognizedAccount ? "queued" : "suppressed",
    requestFingerprintHash: hashRecoveryRequestFingerprint(
      env.PASSWORD_RESET_SECRET,
      context.ipAddress,
      context.userAgent,
    ),
    purgeAt: new Date(now.getTime() + RECOVERY_RECORD_RETENTION_MS),
  });

  const delivery: RecoveryEmailDelivery | undefined = recognizedAccount
    ? {
        challengeId: String(challenge._id),
        recipientEmail: user!.email,
        recipientName: user!.displayName || user!.email,
        organizationName: organization!.name,
        otp,
        expiresAt,
      }
    : undefined;

  return {
    challengeToken,
    expiresInSeconds: PASSWORD_RECOVERY_OTP_TTL_SECONDS,
    resendAfterSeconds: PASSWORD_RECOVERY_RESEND_SECONDS,
    delivery,
  };
}

export async function markPasswordRecoveryDelivery(
  challengeId: string,
  status: "sent" | "failed",
) {
  await PasswordRecoveryChallengeModel.updateOne(
    { _id: challengeId, deliveryStatus: "queued" },
    {
      $set: {
        deliveryStatus: status,
        deliveryLastAttemptAt: new Date(),
      },
    },
  );
}

export async function verifyPasswordRecoveryOtp(
  challengeToken: string,
  otp: string,
) {
  const now = new Date();
  const challengeTokenHash = hashRecoveryChallenge(
    env.PASSWORD_RESET_SECRET,
    challengeToken,
  );
  const challenge = await PasswordRecoveryChallengeModel.findOneAndUpdate(
    {
      challengeTokenHash,
      expiresAt: { $gt: now },
      verifiedAt: null,
      consumedAt: null,
      supersededAt: null,
      attemptCount: { $lt: PASSWORD_RECOVERY_MAX_OTP_ATTEMPTS },
    },
    { $inc: { attemptCount: 1 } },
    { new: true },
  ).select("+otpHash +challengeTokenHash");

  if (!challenge) {
    throw new ApiError(400, INVALID_CODE_MESSAGE);
  }

  const throttle = await PasswordRecoveryThrottleModel.findOneAndUpdate(
    {
      _id: challenge.throttleId,
      expiresAt: { $gt: now },
      otpAttemptCount: { $lt: PASSWORD_RECOVERY_MAX_OTP_ATTEMPTS },
    },
    { $inc: { otpAttemptCount: 1 } },
    { new: true },
  );
  if (!throttle) {
    await PasswordRecoveryChallengeModel.updateOne(
      { _id: challenge._id },
      { $set: { supersededAt: now } },
    );
    throw new ApiError(400, INVALID_CODE_MESSAGE);
  }

  const suppliedOtpHash = hashRecoveryOtp(
    env.PASSWORD_RESET_SECRET,
    challengeToken,
    otp,
  );
  if (!safeHashEqual(suppliedOtpHash, challenge.otpHash)) {
    if (challenge.attemptCount >= PASSWORD_RECOVERY_MAX_OTP_ATTEMPTS) {
      await PasswordRecoveryChallengeModel.updateOne(
        { _id: challenge._id },
        { $set: { supersededAt: now } },
      );
    }
    throw new ApiError(400, INVALID_CODE_MESSAGE);
  }

  const user = await UserModel.findOne({
    _id: challenge.userId || new Types.ObjectId(),
    organizationId: challenge.organizationId,
    status: "active",
  }).lean();
  const organization = await OrganizationModel.findOne({
    _id: user?.organizationId || new Types.ObjectId(),
    status: "active",
  }).lean();
  if (!user || !organization) {
    throw new ApiError(400, INVALID_CODE_MESSAGE);
  }

  const resetToken = generateRecoveryToken();
  const resetGrantExpiresAt = new Date(
    now.getTime() + PASSWORD_RECOVERY_RESET_TTL_SECONDS * 1000,
  );
  const verified = await PasswordRecoveryChallengeModel.findOneAndUpdate(
    {
      _id: challenge._id,
      verifiedAt: null,
      consumedAt: null,
      supersededAt: null,
    },
    {
      $set: {
        verifiedAt: now,
        resetGrantHash: hashRecoveryResetGrant(
          env.PASSWORD_RESET_SECRET,
          resetToken,
        ),
        resetGrantExpiresAt,
      },
      $unset: { otpHash: 1 },
    },
    { new: true },
  );
  if (!verified) {
    throw new ApiError(400, INVALID_CODE_MESSAGE);
  }

  return {
    resetToken,
    expiresInSeconds: PASSWORD_RECOVERY_RESET_TTL_SECONDS,
  };
}

export async function completePasswordRecovery(
  challengeToken: string,
  resetToken: string,
  newPassword: string,
) {
  const challengeTokenHash = hashRecoveryChallenge(
    env.PASSWORD_RESET_SECRET,
    challengeToken,
  );
  const resetGrantHash = hashRecoveryResetGrant(
    env.PASSWORD_RESET_SECRET,
    resetToken,
  );
  const nextPasswordHash = await hashPassword(newPassword);
  const databaseSession = await mongoose.startSession();
  let notification: PasswordChangedNotification | undefined;

  try {
    await databaseSession.withTransaction(async () => {
      const now = new Date();
      const challenge = await PasswordRecoveryChallengeModel.findOne({
        challengeTokenHash,
        verifiedAt: { $ne: null },
        resetGrantExpiresAt: { $gt: now },
        consumedAt: null,
        supersededAt: null,
      })
        .select("+resetGrantHash +challengeTokenHash")
        .session(databaseSession);
      if (
        !challenge?.resetGrantHash ||
        !safeHashEqual(resetGrantHash, challenge.resetGrantHash) ||
        !challenge.userId ||
        !challenge.organizationId
      ) {
        throw new ApiError(400, INVALID_RESET_MESSAGE);
      }

      const user = await UserModel.findOne({
        _id: challenge.userId,
        organizationId: challenge.organizationId,
        status: "active",
      })
        .select("+passwordHash")
        .session(databaseSession);
      const organization = await OrganizationModel.findOne({
        _id: challenge.organizationId,
        status: "active",
      }).session(databaseSession);
      if (!user || !organization) {
        throw new ApiError(400, INVALID_RESET_MESSAGE);
      }

      if (await verifyPassword(newPassword, user.passwordHash)) {
        throw new ApiError(
          422,
          "New password must be different from the current password",
        );
      }

      user.passwordHash = nextPasswordHash;
      user.passwordChangedAt = now;
      await user.save({ session: databaseSession });

      const consumed = await PasswordRecoveryChallengeModel.updateOne(
        {
          _id: challenge._id,
          consumedAt: null,
          resetGrantExpiresAt: { $gt: now },
        },
        {
          $set: { consumedAt: now },
          $unset: { otpHash: 1, resetGrantHash: 1 },
        },
        { session: databaseSession },
      );
      if (consumed.modifiedCount !== 1) {
        throw new ApiError(400, INVALID_RESET_MESSAGE);
      }

      const revokedSessions = await SessionModel.deleteMany(
        { userId: user._id },
        { session: databaseSession },
      );
      await PasswordRecoveryChallengeModel.updateMany(
        {
          _id: { $ne: challenge._id },
          userId: user._id,
          consumedAt: null,
          supersededAt: null,
        },
        {
          $set: { supersededAt: now },
          $unset: { otpHash: 1, resetGrantHash: 1 },
        },
        { session: databaseSession },
      );
      await PasswordRecoveryThrottleModel.deleteOne(
        { _id: challenge.throttleId },
        { session: databaseSession },
      );
      await AuditLogModel.create(
        [
          {
            organizationId: organization._id,
            actorUserId: user._id,
            action: "organization_owner_password_reset",
            entityType: "user",
            entityId: String(user._id),
            after: {
              sessionsRevoked: revokedSessions.deletedCount,
              recoveryChallengeId: String(challenge._id),
            },
            createdBy: "password-recovery",
          },
        ],
        { session: databaseSession },
      );

      notification = {
        recipientEmail: user.email,
        recipientName: user.displayName || user.email,
        organizationName: organization.name,
        changedAt: now,
      };
    });
  } finally {
    await databaseSession.endSession();
  }

  if (!notification) {
    throw new Error("Password recovery could not be completed");
  }

  return notification;
}

