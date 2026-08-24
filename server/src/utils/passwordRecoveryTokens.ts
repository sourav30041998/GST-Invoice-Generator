import crypto from "node:crypto";

export const PASSWORD_RECOVERY_OTP_TTL_SECONDS = 10 * 60;
export const PASSWORD_RECOVERY_RESET_TTL_SECONDS = 10 * 60;
export const PASSWORD_RECOVERY_RESEND_SECONDS = 60;
export const PASSWORD_RECOVERY_REQUEST_WINDOW_MS = 15 * 60 * 1000;
export const PASSWORD_RECOVERY_MAX_REQUESTS = 3;
export const PASSWORD_RECOVERY_MAX_OTP_ATTEMPTS = 5;

export function generateRecoveryOtp() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function generateRecoveryToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function keyedHash(secret: string, purpose: string, value: string) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${purpose}\0${value}`, "utf8")
    .digest("hex");
}

export function hashRecoveryEmail(secret: string, email: string) {
  return keyedHash(secret, "password-recovery-email-v1", email);
}

export function hashRecoveryChallenge(secret: string, token: string) {
  return keyedHash(secret, "password-recovery-challenge-v1", token);
}

export function hashRecoveryOtp(
  secret: string,
  challengeToken: string,
  otp: string,
) {
  return keyedHash(
    secret,
    "password-recovery-otp-v1",
    `${challengeToken}\0${otp}`,
  );
}

export function hashRecoveryResetGrant(secret: string, token: string) {
  return keyedHash(secret, "password-recovery-grant-v1", token);
}

export function hashRecoveryRequestFingerprint(
  secret: string,
  ipAddress: string,
  userAgent: string,
) {
  return keyedHash(
    secret,
    "password-recovery-request-v1",
    `${ipAddress}\0${userAgent}`,
  );
}

export function safeHashEqual(actual: string, expected: string) {
  if (!/^[a-f0-9]{64}$/i.test(actual) || !/^[a-f0-9]{64}$/i.test(expected)) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(actual, "hex"),
    Buffer.from(expected, "hex"),
  );
}
