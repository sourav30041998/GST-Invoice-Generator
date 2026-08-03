import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  authStatus,
  login,
  logout,
  requireAuth,
  requireCsrf,
} from "../middleware/auth.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Try again later." },
});

router.get("/me", authStatus);
router.post("/login", loginLimiter, login);
router.post("/logout", requireAuth, requireCsrf, logout);

export default router;
