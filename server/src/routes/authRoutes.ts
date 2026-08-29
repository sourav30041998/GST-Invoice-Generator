import { Router } from "express";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import {
  authStatus,
  login,
  logout,
  requireAuth,
  requireCsrf,
} from "../middleware/auth.js";
import {
  requestPasswordRecovery,
  resetRecoveredPassword,
  verifyPasswordRecoveryCode,
} from "../controllers/passwordRecoveryController.js";
import { env } from "../config/env.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Try again later." },
});

const accountLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "invalid";
    return crypto
      .createHmac("sha256", env.SESSION_SECRET || "")
      .update(email)
      .digest("hex");
  },
  message: { message: "Too many login attempts. Try again later." },
});

const recoveryRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many recovery requests. Try again later." },
});

const recoveryVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many verification attempts. Try again later." },
});

const recoveryResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many password reset attempts. Try again later." },
});

router.get("/me", authStatus);
router.post("/login", loginLimiter, accountLoginLimiter, login);
router.post(
  "/password-recovery/request",
  recoveryRequestLimiter,
  requestPasswordRecovery,
);
router.post(
  "/password-recovery/verify",
  recoveryVerificationLimiter,
  verifyPasswordRecoveryCode,
);
router.post(
  "/password-recovery/reset",
  recoveryResetLimiter,
  resetRecoveredPassword,
);
router.post("/logout", requireAuth, requireCsrf, logout);

export default router;
