import crypto from "node:crypto";
import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { ApiError } from "./errorHandler.js";

const MAX_SIGNATURE_AGE_MS = 60 * 1000;

function requestSignature(method: string, path: string, timestamp: string) {
  return crypto
    .createHmac("sha256", env.ADMIN_INTERNAL_SHARED_SECRET)
    .update(`${method}\n${path}\n${timestamp}`)
    .digest("base64url");
}

export const requireAdminInternalService: RequestHandler = (req, _res, next) => {
  const origin = req.get("origin");
  const timestamp = req.get("x-internal-timestamp") || "";
  const signature = req.get("x-internal-signature") || "";
  const timestampValue = Number(timestamp);

  if (
    origin ||
    !/^\d{13}$/.test(timestamp) ||
    !Number.isSafeInteger(timestampValue) ||
    Math.abs(Date.now() - timestampValue) > MAX_SIGNATURE_AGE_MS
  ) {
    next(new ApiError(403, "Invalid internal service request"));
    return;
  }

  const expected = Buffer.from(
    requestSignature(req.method, req.originalUrl, timestamp),
  );
  const received = Buffer.from(signature);
  if (
    expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)
  ) {
    next(new ApiError(403, "Invalid internal service request"));
    return;
  }

  next();
};
