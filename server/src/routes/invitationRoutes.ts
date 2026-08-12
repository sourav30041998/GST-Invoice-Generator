import { Router } from "express";
import rateLimit from "express-rate-limit";
import { acceptOrganizationInvitation } from "../controllers/invitationController.js";

const router = Router();

const invitationAcceptanceLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many invitation attempts. Try again later." },
});

router.post(
  "/accept",
  invitationAcceptanceLimiter,
  acceptOrganizationInvitation,
);

export default router;
