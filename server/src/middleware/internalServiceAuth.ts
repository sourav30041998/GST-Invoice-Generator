import crypto from "node:crypto";
import type { Request, RequestHandler } from "express";
import { env } from "../config/env.js";
import { InternalRequestNonceModel } from "../models/InternalRequestNonce.js";
import {
  internalBodyDigest,
  signInternalRequest,
} from "../utils/internalRequestSignature.js";
import { ApiError } from "./errorHandler.js";

const MAX_SIGNATURE_AGE_MS = 60 * 1000;
const INTERNAL_AUTH_VERSION = "2";

type RawBodyRequest = Request & { rawBody?: Buffer };

function nonceHash(nonce: string) {
  return crypto
    .createHmac("sha256", env.ADMIN_INTERNAL_SHARED_SECRET)
    .update(`internal-request-nonce:${nonce}`)
    .digest("hex");
}

function timingSafeMatch(expected: string, received: string) {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export const requireAdminInternalService: RequestHandler = async (
  req,
  _res,
  next,
) => {
  try {
    const origin = req.get("origin");
    const version = req.get("x-internal-auth-version") || "";
    const timestamp = req.get("x-internal-timestamp") || "";
    const nonce = req.get("x-internal-nonce") || "";
    const receivedBodyDigest = req.get("x-internal-body-sha256") || "";
    const signature = req.get("x-internal-signature") || "";
    const timestampValue = Number(timestamp);
    const rawBody = (req as RawBodyRequest).rawBody || Buffer.alloc(0);
    const expectedBodyDigest = internalBodyDigest(rawBody);

    if (
      origin ||
      version !== INTERNAL_AUTH_VERSION ||
      !/^\d{13}$/.test(timestamp) ||
      !Number.isSafeInteger(timestampValue) ||
      Math.abs(Date.now() - timestampValue) > MAX_SIGNATURE_AGE_MS ||
      !/^[A-Za-z0-9_-]{32}$/.test(nonce) ||
      !/^[A-Za-z0-9_-]{43}$/.test(receivedBodyDigest) ||
      !/^[A-Za-z0-9_-]{43}$/.test(signature) ||
      !timingSafeMatch(expectedBodyDigest, receivedBodyDigest)
    ) {
      throw new ApiError(403, "Invalid internal service request");
    }

    const expectedSignature = signInternalRequest(
      req.method,
      req.originalUrl,
      timestamp,
      nonce,
      receivedBodyDigest,
      env.ADMIN_INTERNAL_SHARED_SECRET,
    );
    if (!timingSafeMatch(expectedSignature, signature)) {
      throw new ApiError(403, "Invalid internal service request");
    }

    try {
      await InternalRequestNonceModel.create({
        _id: nonceHash(nonce),
        expiresAt: new Date(timestampValue + MAX_SIGNATURE_AGE_MS),
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new ApiError(403, "Invalid internal service request");
      }
      throw error;
    }

    next();
  } catch (error) {
    next(error);
  }
};
