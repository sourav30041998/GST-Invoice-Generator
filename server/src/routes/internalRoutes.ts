import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { requireAdminInternalService } from "../middleware/internalServiceAuth.js";
import { ApiError } from "../middleware/errorHandler.js";
import { SessionModel } from "../models/Session.js";
import { UserModel } from "../models/User.js";

const router = Router();

const organizationIdSchema = z
  .string()
  .refine(Types.ObjectId.isValid, "Organization not found");
const ownerQuerySchema = z.object({
  organizationIds: z.array(organizationIdSchema).min(1).max(25),
});
const emailQuerySchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
});

router.use(requireAdminInternalService);

router.get("/organization-owners", async (req, res, next) => {
  try {
    const organizationIds = Array.isArray(req.query.organizationId)
      ? req.query.organizationId
      : [req.query.organizationId];
    const values = ownerQuerySchema.parse({ organizationIds });
    const owners = await UserModel.find({
      role: "owner",
      organizationId: { $in: values.organizationIds },
    })
      .select("organizationId email displayName")
      .lean();
    res.json({
      owners: owners.map((owner) => ({
        organizationId: String(owner.organizationId),
        email: owner.email,
        displayName: owner.displayName || owner.email,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/owner-account", async (req, res, next) => {
  try {
    const { email } = emailQuerySchema.parse(req.query);
    res.json({ exists: Boolean(await UserModel.exists({ email })) });
  } catch (error) {
    next(error);
  }
});

router.post("/organizations/:organizationId/revoke-sessions", async (req, res, next) => {
  try {
    const organizationId = organizationIdSchema.parse(req.params.organizationId);
    const result = await SessionModel.deleteMany({ organizationId });
    res.json({ revokedSessionCount: result.deletedCount });
  } catch (error) {
    next(error instanceof z.ZodError ? new ApiError(422, "Organization not found") : error);
  }
});

export default router;
