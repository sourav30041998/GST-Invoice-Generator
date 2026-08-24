import crypto from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import { env } from "../config/env.js";
import { ApiError } from "../middleware/errorHandler.js";
import { InternalCommandModel } from "../models/InternalCommand.js";

const COMMAND_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function commandId(requestId: string) {
  return crypto
    .createHmac("sha256", env.ADMIN_INTERNAL_SHARED_SECRET)
    .update(`internal-command:${requestId}`)
    .digest("hex");
}

function requestDigest(operation: string, payload: unknown) {
  return crypto
    .createHash("sha256")
    .update(`${operation}\n${JSON.stringify(payload)}`)
    .digest("hex");
}

function safeMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

async function findCompletedCommand<T>(
  id: string,
  operation: string,
  digest: string,
) {
  const existing = await InternalCommandModel.findById(id)
    .select("+requestDigest +response")
    .lean();
  if (!existing) {
    return undefined;
  }
  if (
    existing.operation !== operation ||
    !safeMatch(existing.requestDigest, digest)
  ) {
    throw new ApiError(409, "The internal request ID was already used");
  }
  return existing.response as T;
}

function isDuplicateKeyError(error: unknown) {
  const candidate = error as {
    code?: number;
    keyPattern?: Record<string, unknown>;
  };
  return candidate.code === 11000 && Boolean(candidate.keyPattern?._id);
}

async function waitForConcurrentCommand<T>(
  id: string,
  operation: string,
  digest: string,
) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const existing = await findCompletedCommand<T>(id, operation, digest);
    if (existing !== undefined) {
      return existing;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new ApiError(409, "The internal command is still processing");
}

export async function executeInternalCommand<T extends object>(
  requestId: string,
  operation: string,
  payload: unknown,
  handler: (session: ClientSession) => Promise<T>,
) {
  const id = commandId(requestId);
  const digest = requestDigest(operation, payload);
  const completed = await findCompletedCommand<T>(id, operation, digest);
  if (completed !== undefined) {
    return completed;
  }

  const session = await mongoose.startSession();
  try {
    let response: T | undefined;
    await session.withTransaction(async () => {
      const existing = await InternalCommandModel.findById(id)
        .select("+requestDigest +response")
        .session(session);
      if (existing) {
        if (
          existing.operation !== operation ||
          !safeMatch(existing.requestDigest, digest)
        ) {
          throw new ApiError(409, "The internal request ID was already used");
        }
        response = existing.response as T;
        return;
      }

      response = await handler(session);
      await InternalCommandModel.create(
        [
          {
            _id: id,
            operation,
            requestDigest: digest,
            response,
            expiresAt: new Date(Date.now() + COMMAND_RETENTION_MS),
          },
        ],
        { session },
      );
    });
    if (response === undefined) {
      throw new Error("Internal command did not complete");
    }
    return response;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return waitForConcurrentCommand<T>(id, operation, digest);
    }
    throw error;
  } finally {
    await session.endSession();
  }
}
