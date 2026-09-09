import { Router, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { getAuthContext } from "../middleware/auth.js";
import { ApiError } from "../middleware/errorHandler.js";
import {
  domainConnectSchema,
  emailReauthSchema,
  gmailCompleteSchema,
  gmailConnectSchema,
} from "../validation/organizationEmailSchemas.js";
import {
  completeGmailConnection,
  connectDomain,
  disconnectOrganizationEmail,
  getOrganizationEmailSettings,
  reauthenticateEmailOwner,
  sendOrganizationTestEmail,
  startGmailConnection,
  verifyDomainConnection,
} from "../services/organizationEmailService.js";

const router = Router();
router.use(((_req, res, next) => {
  if (getAuthContext(res).role !== "owner")
    return next(
      new ApiError(403, "Only the company owner can manage email settings."),
    );
  next();
}) satisfies RequestHandler);
router.use(
  rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      message: "Too many email settings requests. Try again shortly.",
    },
  }),
);

router.get("/", async (_req, res, next) => {
  try {
    res.json(
      await getOrganizationEmailSettings(getAuthContext(res).organizationId),
    );
  } catch (error) {
    next(error);
  }
});
router.post("/gmail/start", async (req, res, next) => {
  try {
    const input = gmailConnectSchema.parse(req.body);
    const context = getAuthContext(res);
    await reauthenticateEmailOwner(context, input.password);
    res.json(await startGmailConnection(context, input.senderName));
  } catch (error) {
    next(error);
  }
});
router.post("/gmail/complete", async (req, res, next) => {
  try {
    const input = gmailCompleteSchema.parse(req.body);
    res.json(
      await completeGmailConnection(
        getAuthContext(res),
        input.code,
        input.state,
      ),
    );
  } catch (error) {
    next(error);
  }
});
router.post("/domain", async (req, res, next) => {
  try {
    const { password, ...input } = domainConnectSchema.parse(req.body);
    const context = getAuthContext(res);
    await reauthenticateEmailOwner(context, password);
    res.json(await connectDomain(context, input));
  } catch (error) {
    next(error);
  }
});
router.post("/domain/verify", async (req, res, next) => {
  try {
    // This may register the sender with the provider and trigger its verification email.
    const { password } = emailReauthSchema.parse(req.body);
    const context = getAuthContext(res);
    await reauthenticateEmailOwner(context, password);
    res.json(await verifyDomainConnection(context));
  } catch (error) {
    next(error);
  }
});
router.post("/test", async (req, res, next) => {
  try {
    const { password } = emailReauthSchema.parse(req.body);
    const context = getAuthContext(res);
    await reauthenticateEmailOwner(context, password);
    res.json(await sendOrganizationTestEmail(context));
  } catch (error) {
    next(error);
  }
});
router.delete("/", async (req, res, next) => {
  try {
    const { password } = emailReauthSchema.parse(req.body);
    const context = getAuthContext(res);
    await reauthenticateEmailOwner(context, password);
    res.json(await disconnectOrganizationEmail(context));
  } catch (error) {
    next(error);
  }
});
export default router;
