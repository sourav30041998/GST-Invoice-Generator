import crypto from "node:crypto";
import { env } from "../config/env.js";

export function deriveInvitationToken(requestId: string) {
  return crypto
    .createHmac("sha256", env.INVITATION_TOKEN_SECRET)
    .update(`organization-invitation-token:${requestId}`)
    .digest("base64url");
}

export function invitationTokenHash(token: string) {
  return crypto
    .createHmac("sha256", env.INVITATION_TOKEN_SECRET)
    .update(`organization-invitation:${token}`)
    .digest("hex");
}
