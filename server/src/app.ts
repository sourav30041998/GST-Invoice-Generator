import compression from "compression";
import cors from "cors";
import express from "express";
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
import invoiceRoutes from "./routes/invoiceRoutes.js";
import referenceDataRoutes from "./routes/referenceDataRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";

export const app = express();

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
    crossOriginResourcePolicy: { policy: "cross-origin" },
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
app.use(express.json({ limit: env.REQUEST_BODY_LIMIT, strict: true }));
app.use("/api", noStoreApiResponses);
app.use(
  morgan(
    env.NODE_ENV === "production"
      ? ":method :status :response-time ms :res[content-length]"
      : "dev",
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
app.use("/api", requireTrustedOrigin);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "gst-invoice-api" });
});

app.use("/api/auth", authRoutes);
app.use("/api/reference-data", requireAuth, referenceDataRoutes);
app.use("/api/settings", requireAuth, requireCsrf, settingsRoutes);
app.use("/api/invoices", requireAuth, requireCsrf, invoiceRoutes);

app.use(notFound);
app.use(errorHandler);