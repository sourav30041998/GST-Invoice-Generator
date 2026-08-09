import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { ApiError } from "./errorHandler.js";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isTrustedOrigin(origin: string) {
  if (env.CLIENT_ORIGINS.includes(origin)) {
    return true;
  }

  return (
    env.NODE_ENV !== "production" &&
    /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
  );
}

export const requireTrustedOrigin: RequestHandler = (req, _res, next) => {
  if (!UNSAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.get("origin");
  if (!origin) {
    if (env.NODE_ENV === "production") {
      next(new ApiError(403, "Request origin is required"));
      return;
    }
    next();
    return;
  }

  if (!isTrustedOrigin(origin)) {
    next(new ApiError(403, "Request origin is not trusted"));
    return;
  }

  next();
};

export const noStoreApiResponses: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  next();
};