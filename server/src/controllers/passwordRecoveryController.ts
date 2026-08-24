import type { RequestHandler } from "express";
import {
  completePasswordRecoverySchema,
  requestPasswordRecoverySchema,
  verifyPasswordRecoveryOtpSchema,
} from "../validation/authSchemas.js";
import {
  sendPasswordChangedEmail,
  sendPasswordRecoveryCodeEmail,
} from "../services/passwordRecoveryEmailService.js";
import {
  completePasswordRecovery,
  createPasswordRecoveryRequest,
  markPasswordRecoveryDelivery,
  verifyPasswordRecoveryOtp,
} from "../services/passwordRecoveryService.js";
import { recoveryRecipientMatchesRequest } from "../utils/passwordRecoveryDelivery.js";

const GENERIC_REQUEST_MESSAGE =
  "If that email is registered, a 6-digit code has been sent";

function requestContext(req: Parameters<RequestHandler>[0]) {
  return {
    ipAddress: (req.ip || req.socket.remoteAddress || "unknown").slice(0, 128),
    userAgent: (req.get("user-agent") || "unknown").slice(0, 512),
  };
}

export const requestPasswordRecovery: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const values = requestPasswordRecoverySchema.parse(req.body);
    const result = await createPasswordRecoveryRequest(
      values.email,
      requestContext(req),
    );

    res.status(202).json({
      message: GENERIC_REQUEST_MESSAGE,
      challengeToken: result.challengeToken,
      expiresInSeconds: result.expiresInSeconds,
      resendAfterSeconds: result.resendAfterSeconds,
    });

    const delivery = result.delivery;
    if (
      delivery &&
      recoveryRecipientMatchesRequest(values.email, delivery.recipientEmail)
    ) {
      void sendPasswordRecoveryCodeEmail(delivery)
        .then(() =>
          markPasswordRecoveryDelivery(delivery.challengeId, "sent"),
        )
        .catch(async () => {
          console.error("Password recovery email delivery failed");
          await markPasswordRecoveryDelivery(
            delivery.challengeId,
            "failed",
          ).catch(() => undefined);
        });
    } else if (delivery) {
      console.error("Password recovery recipient invariant failed");
      void markPasswordRecoveryDelivery(delivery.challengeId, "failed").catch(
        () => undefined,
      );
    }
  } catch (error) {
    next(error);
  }
};

export const verifyPasswordRecoveryCode: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const values = verifyPasswordRecoveryOtpSchema.parse(req.body);
    res.json(
      await verifyPasswordRecoveryOtp(values.challengeToken, values.otp),
    );
  } catch (error) {
    next(error);
  }
};

export const resetRecoveredPassword: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const values = completePasswordRecoverySchema.parse(req.body);
    const notification = await completePasswordRecovery(
      values.challengeToken,
      values.resetToken,
      values.newPassword,
    );
    let notificationSent = true;
    try {
      await sendPasswordChangedEmail(notification);
    } catch {
      notificationSent = false;
      console.error("Password reset notification email delivery failed");
    }

    res.json({
      message: "Password reset successfully. Sign in with your new password.",
      notificationSent,
    });
  } catch (error) {
    next(error);
  }
};
