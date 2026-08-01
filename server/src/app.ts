import compression from "compression";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import invoiceRoutes from "./routes/invoiceRoutes.js";
<<<<<<< HEAD
=======
import referenceDataRoutes from "./routes/referenceDataRoutes.js";
>>>>>>> codex/backend-api-data
import settingsRoutes from "./routes/settingsRoutes.js";

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
<<<<<<< HEAD
    credentials: true
  })
=======
    credentials: true,
  }),
>>>>>>> codex/backend-api-data
);
app.use(compression());
app.use(express.json({ limit: "6mb" }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 240,
    standardHeaders: true,
<<<<<<< HEAD
    legacyHeaders: false
  })
=======
    legacyHeaders: false,
  }),
>>>>>>> codex/backend-api-data
);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "gst-invoice-api" });
});

<<<<<<< HEAD
=======
app.use("/api/reference-data", referenceDataRoutes);
>>>>>>> codex/backend-api-data
app.use("/api/settings", settingsRoutes);
app.use("/api/invoices", invoiceRoutes);

app.use(notFound);
app.use(errorHandler);
