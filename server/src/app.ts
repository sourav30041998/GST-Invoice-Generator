import { existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import compression from "compression";
import cors from "cors";
import express from "express";
import type { Request } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { requireAuth, requireCsrf } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import {
  noStoreApiResponses,
  requireTrustedOrigin,
} from "./middleware/security.js";
import authRoutes from "./routes/authRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import invoiceRoutes from "./routes/invoiceRoutes.js";
import invitationRoutes from "./routes/invitationRoutes.js";
import internalRoutes from "./routes/internalRoutes.js";
import referenceDataRoutes from "./routes/referenceDataRoutes.js";
import roomRoutes from "./routes/roomRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import organizationEmailRoutes from "./routes/organizationEmailRoutes.js";

export const app = express();

const serverDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDistDirectory = resolve(serverDirectory, "../../client/dist");
const frontendIndexFile = resolve(frontendDistDirectory, "index.html");

function isTrustedOrigin(origin?: string) {
  if (!origin) {
    return true;
  }

  if (env.CLIENT_ORIGINS.includes(origin)) {
    return true;
  }

  return (
    env.NODE_ENV !== "production" &&
    /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
  );
}

app.disable("x-powered-by");
if (env.TRUST_PROXY) {
  app.set("trust proxy", 1);
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "same-origin" },
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      if (isTrustedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS origin is not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-CSRF-Token"],
    maxAge: 600,
  }),
);
app.use(compression());
app.use(
  express.json({
    limit: env.REQUEST_BODY_LIMIT,
    strict: true,
    verify(req, _res, buffer) {
      const request = req as Request & { rawBody?: Buffer };
      if (request.originalUrl.startsWith("/api/internal")) {
        request.rawBody = Buffer.from(buffer);
      }
    },
  }),
);
app.use("/api", noStoreApiResponses);
app.use("/email-connect", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
app.use(
  morgan(
    env.NODE_ENV === "production"
      ? ":method :status :response-time ms :res[content-length]"
      : "dev",
    { skip: (req) => req.path === "/email-connect" },
  ),
);
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    limit: env.NODE_ENV === "production" ? 120 : 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests. Try again shortly." },
  }),
);
app.use("/api/internal", internalRoutes);
app.use("/api", requireTrustedOrigin);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "gst-invoice-api" });
});

app.use("/api/auth", authRoutes);
app.use("/api/invitations", invitationRoutes);
app.use("/api/reference-data", requireAuth, referenceDataRoutes);
app.use("/api/customers", requireAuth, requireCsrf, customerRoutes);
app.use("/api/bookings", requireAuth, requireCsrf, bookingRoutes);
app.use("/api/rooms", requireAuth, requireCsrf, roomRoutes);
app.use("/api/settings", requireAuth, requireCsrf, settingsRoutes);
app.use("/api/organization-email", requireAuth, requireCsrf, organizationEmailRoutes);
app.use("/api/invoices", requireAuth, requireCsrf, invoiceRoutes);

if (env.NODE_ENV === "production") {
  if (!existsSync(frontendIndexFile)) {
    throw new Error(
      "Frontend build is missing. Run the root build command before starting production.",
    );
  }

  app.use(
    express.static(frontendDistDirectory, {
      index: false,
      maxAge: 1000 * 60 * 60 * 24 * 365,
      immutable: true,
      setHeaders(res, filePath) {
        if (basename(filePath) === "index.html") {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }),
  );
  app.get("*", (req, res, next) => {
    const isApiRequest = req.path === "/api" || req.path.startsWith("/api/");
    if (isApiRequest || !req.accepts("html")) {
      next();
      return;
    }

    res.setHeader("Cache-Control", req.path === "/email-connect" ? "no-store" : "no-cache");
    res.sendFile(frontendIndexFile, (error) => {
      if (error) {
        next(error);
      }
    });
  });
}

app.use(notFound);
app.use(errorHandler);
