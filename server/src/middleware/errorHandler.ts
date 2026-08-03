import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

type HttpError = Error & {
  status?: number;
  statusCode?: number;
  type?: string;
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(422).json({
      message: "Validation failed",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  const httpError = error as HttpError;
  if (httpError.type === "entity.parse.failed") {
    res.status(400).json({ message: "Invalid JSON payload" });
    return;
  }

  if (httpError.type === "entity.too.large") {
    res.status(413).json({ message: "Request payload is too large" });
    return;
  }

  if (httpError.message === "CORS origin is not allowed") {
    res.status(403).json({ message: "Request origin is not allowed" });
    return;
  }

  const statusCode = error instanceof ApiError ? error.statusCode : 500;
  res.status(statusCode).json({
    message: statusCode === 500 ? "Unexpected server error" : error.message,
  });
};