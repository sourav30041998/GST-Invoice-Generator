import crypto from "node:crypto";
import { env } from "../config/env.js";
import { ApiError } from "../middleware/errorHandler.js";
import { AuditLogModel } from "../models/AuditLog.js";
import {
  EmailOAuthChallengeModel,
  EmailThrottleModel,
  OrganizationEmailConnectionModel,
} from "../models/OrganizationEmailConnection.js";
import { UserModel } from "../models/User.js";
import { OrganizationModel } from "../models/Organization.js";
import {
  decryptProtectedJson,
  encryptProtectedJson,
} from "./dataProtectionService.js";
import { verifyPassword } from "./passwordService.js";
import {
  exchangeGoogleCode,
  googleAuthorization,
  inspectDomain,
  OrganizationEmailError,
  revokeGoogleToken,
  sendDomainMail,
  sendGmailMail,
  verifiedDomainSender,
  type OrganizationMail,
} from "./organizationEmailProvider.js";

type EmailContext = {
  organizationId: string;
  userId: string;
  csrfToken: string;
  role: string;
};
type ConnectionDetails = {
  senderName: string;
  senderEmail: string;
  apiKey?: string;
  refreshToken?: string;
  googleSubject?: string;
  dnsRecords?: Array<{
    type: string;
    host: string;
    value: string;
    verified: boolean;
  }>;
};
const scope = "organization-email";
const hash = (value: string) =>
  crypto
    .createHmac("sha256", env.DATA_ENCRYPTION_KEY_BYTES)
    .update(value)
    .digest("base64url");
const readConnection = (organizationId: string) =>
  OrganizationEmailConnectionModel.findOne({ organizationId }).select(
    "+protectedData",
  );
type Connection = NonNullable<Awaited<ReturnType<typeof readConnection>>>;
const reveal = (record: Connection) =>
  decryptProtectedJson<ConnectionDetails>(
    scope,
    record.organizationId.toString(),
    record.protectedData,
  );

export async function consumeEmailLimit(
  organizationId: string,
  purpose: string,
  limit: number,
  windowMs: number,
) {
  const bucket = Math.floor(Date.now() / windowMs);
  const key = hash(`email-limit:${organizationId}:${purpose}:${bucket}`);
  let row;
  try {
    row = await EmailThrottleModel.findOneAndUpdate(
      { _id: key },
      {
        $inc: { count: 1 },
        $setOnInsert: { key, expiresAt: new Date((bucket + 2) * windowMs) },
      },
      { upsert: true, new: true },
    );
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    row = await EmailThrottleModel.findOneAndUpdate(
      { _id: key },
      { $inc: { count: 1 } },
      { new: true },
    );
  }
  if (!row || row.count > limit)
    throw new ApiError(429, "Too many email requests. Please try again later.");
}

export async function reauthenticateEmailOwner(
  context: EmailContext,
  password: string,
) {
  if (context.role !== "owner")
    throw new ApiError(
      403,
      "Only the company owner can manage email connections.",
    );
  await consumeEmailLimit(
    context.organizationId,
    `reauth:${context.userId}`,
    5,
    15 * 60_000,
  );
  const user = await UserModel.findOne({
    _id: context.userId,
    organizationId: context.organizationId,
    status: "active",
    role: "owner",
  }).select("+passwordHash");
  if (!user || !(await verifyPassword(password, user.passwordHash)))
    throw new ApiError(401, "The company account password is incorrect.");
}

async function audit(
  context: Pick<EmailContext, "organizationId" | "userId">,
  action: string,
  provider?: string,
) {
  await AuditLogModel.create({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    entityType: "emailConnection",
    entityId: context.organizationId,
    action,
    after: provider ? { provider } : null,
    createdBy: "authenticated-user",
  });
}

export async function getOrganizationEmailSettings(organizationId: string) {
  const record = await readConnection(organizationId);
  const details = record ? reveal(record) : null;
  return {
    gmailAvailable: env.GOOGLE_EMAIL_CONFIGURED,
    provider: record?.provider || null,
    status: record?.status || "notConnected",
    senderName: details?.senderName || "",
    senderEmail: details?.senderEmail || "",
    dnsRecords: details?.dnsRecords || [],
    verifiedAt: record?.verifiedAt?.toISOString() || null,
    lastAcceptedAt: record?.lastAcceptedAt?.toISOString() || null,
  };
}

async function saveConnection(
  context: EmailContext,
  previous: Connection | null,
  provider: "gmail" | "brevo",
  status: "pending" | "connected",
  details: ConnectionDetails,
) {
  const values = {
    provider,
    status,
    protectedData: encryptProtectedJson(scope, context.organizationId, details),
    updatedBy: context.userId,
    revision: crypto.randomUUID(),
    verifiedAt: status === "connected" ? new Date() : null,
    lastAcceptedAt:
      previous?.status !== "disconnected"
        ? previous?.lastAcceptedAt || null
        : null,
  };
  if (previous) {
    const result = await OrganizationEmailConnectionModel.updateOne(
      { organizationId: context.organizationId, revision: previous.revision },
      { $set: values },
    );
    if (!result.modifiedCount)
      throw new ApiError(
        409,
        "Email settings changed in another window. Reload before reconnecting.",
      );
  } else {
    try {
      // A tenant's primary key also prevents duplicate connections before secondary indexes are built.
      await OrganizationEmailConnectionModel.create({
        _id: context.organizationId,
        organizationId: context.organizationId,
        ...values,
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000)
        throw new ApiError(
          409,
          "Email settings changed. Reload before reconnecting.",
        );
      throw error;
    }
  }
  await audit(
    context,
    status === "connected" ? "email.sender.connected" : "email.sender.pending",
    provider,
  );
  // Do not revoke during Gmail replacement: Google can reuse the same account grant.
  // Revoke old grants through Disconnect before switching accounts/providers.
}

export async function startGmailConnection(
  context: EmailContext,
  senderName: string,
) {
  const previous = await readConnection(context.organizationId);
  if (previous && previous.status !== "disconnected")
    throw new ApiError(
      409,
      "Disconnect the current sender before connecting Gmail.",
    );
  const state = crypto.randomBytes(32).toString("base64url");
  const nonce = crypto.randomBytes(32).toString("base64url");
  const authorization = await googleAuthorization(state, nonce);
  await EmailOAuthChallengeModel.deleteMany({
    organizationId: context.organizationId,
    userId: context.userId,
  });
  const stateHash = hash(`email-oauth:${state}`);
  await EmailOAuthChallengeModel.create({
    _id: stateHash,
    organizationId: context.organizationId,
    userId: context.userId,
    stateHash,
    sessionBinding: hash(`email-session:${context.csrfToken}`),
    expiresAt: new Date(Date.now() + 10 * 60_000),
    protectedData: encryptProtectedJson("email-oauth", context.organizationId, {
      codeVerifier: authorization.codeVerifier,
      nonce,
      senderName,
      revision: previous?.revision || null,
    }),
  });
  await audit(context, "email.gmail.authorization.started", "gmail");
  return { authorizationUrl: authorization.url };
}

export async function completeGmailConnection(
  context: EmailContext,
  code: string,
  state: string,
) {
  const challenge = await EmailOAuthChallengeModel.findOneAndDelete({
    _id: hash(`email-oauth:${state}`),
    organizationId: context.organizationId,
    userId: context.userId,
    sessionBinding: hash(`email-session:${context.csrfToken}`),
    expiresAt: { $gt: new Date() },
  }).select("+protectedData");
  if (!challenge)
    throw new ApiError(
      400,
      "The Gmail connection expired or belongs to another session. Start again from Company Profile.",
    );
  const pending = decryptProtectedJson<{
    codeVerifier: string;
    nonce: string;
    senderName: string;
    revision: string | null;
  }>("email-oauth", context.organizationId, challenge.protectedData);
  const previous = await readConnection(context.organizationId);
  if ((previous?.revision || null) !== pending.revision)
    throw new ApiError(
      409,
      "Email settings changed while connecting Gmail. Start again.",
    );
  const identity = await exchangeGoogleCode(
    code,
    pending.codeVerifier,
    pending.nonce,
  );
  try {
    await saveConnection(context, previous, "gmail", "connected", {
      senderName: pending.senderName,
      ...identity,
    });
  } catch (error) {
    await revokeGoogleToken(identity.refreshToken);
    throw error;
  }
  return getOrganizationEmailSettings(context.organizationId);
}

export async function connectDomain(
  context: EmailContext,
  input: { senderName: string; senderEmail: string; apiKey: string },
) {
  const previous = await readConnection(context.organizationId);
  if (previous && previous.status !== "disconnected")
    throw new ApiError(
      409,
      "Disconnect the current sender before adding another one.",
    );
  const config = await inspectDomain(input.apiKey, input.senderEmail, {
    create: true,
  });
  const ready =
    config.verified &&
    config.authenticated &&
    (await verifiedDomainSender(input.apiKey, input));
  await saveConnection(
    context,
    previous,
    "brevo",
    ready ? "connected" : "pending",
    {
      ...input,
      dnsRecords: Object.values(config.dns_records).map((record) => ({
        type: record.type,
        host: record.host_name,
        value: record.value,
        verified: record.status,
      })),
    },
  );
  return getOrganizationEmailSettings(context.organizationId);
}

export async function verifyDomainConnection(context: EmailContext) {
  await consumeEmailLimit(
    context.organizationId,
    "verify-domain",
    10,
    60 * 60_000,
  );
  const record = await readConnection(context.organizationId);
  if (
    !record ||
    record.provider !== "brevo" ||
    record.status === "disconnected"
  )
    throw new ApiError(409, "Connect a custom domain first.");
  const details = reveal(record);
  if (!details.apiKey)
    throw new ApiError(409, "Reconnect your domain delivery account.");
  const config = await inspectDomain(details.apiKey, details.senderEmail, {
    verify: true,
  });
  const ready =
    config.verified &&
    config.authenticated &&
    (await verifiedDomainSender(details.apiKey, details, true));
  await saveConnection(
    context,
    record,
    "brevo",
    ready ? "connected" : "pending",
    {
      ...details,
      dnsRecords: Object.values(config.dns_records).map((dns) => ({
        type: dns.type,
        host: dns.host_name,
        value: dns.value,
        verified: dns.status,
      })),
    },
  );
  return getOrganizationEmailSettings(context.organizationId);
}

export async function disconnectOrganizationEmail(context: EmailContext) {
  const record = await readConnection(context.organizationId);
  await EmailOAuthChallengeModel.deleteMany({
    organizationId: context.organizationId,
  });
  if (!record || record.status === "disconnected")
    return { message: "Email sender is disconnected." };
  const details = reveal(record);
  const result = await OrganizationEmailConnectionModel.updateOne(
    { organizationId: context.organizationId, revision: record.revision },
    {
      $set: {
        status: "disconnected",
        revision: crypto.randomUUID(),
        updatedBy: context.userId,
        protectedData: encryptProtectedJson(scope, context.organizationId, {
          senderName: details.senderName,
          senderEmail: details.senderEmail,
        }),
      },
    },
  );
  if (!result.modifiedCount)
    throw new ApiError(
      409,
      "Email settings changed. Reload and try disconnecting again.",
    );
  const revoked = details.refreshToken
    ? await revokeGoogleToken(details.refreshToken)
    : true;
  await audit(context, "email.sender.disconnected", record.provider);
  return {
    message: !revoked
      ? "Sender disconnected locally. Google revocation could not be confirmed; remove this application's access in your Google Account."
      : record.provider === "brevo"
        ? "Sender disconnected and the stored API key removed. Revoke its dedicated key in Brevo if it is no longer needed."
        : "Gmail disconnected and its stored authorization removed.",
  };
}

export async function sendOrganizationEmail(
  organizationId: string,
  mail: OrganizationMail,
) {
  const record = await readConnection(organizationId);
  if (!record || record.status !== "connected")
    throw new OrganizationEmailError(
      "connection",
      "Connect a verified email sender in Company Profile before sending customer emails.",
    );
  const assertSendAllowed = async () => {
    if (
      !(await OrganizationModel.exists({
        _id: organizationId,
        status: "active",
      }))
    )
      throw new ApiError(
        403,
        "Email delivery is unavailable for this company.",
      );
    if (
      !(await OrganizationEmailConnectionModel.exists({
        organizationId,
        revision: record.revision,
        status: "connected",
      }))
    )
      throw new OrganizationEmailError(
        "connection",
        "The sender was disconnected. Email was not sent.",
      );
  };
  await assertSendAllowed();
  await consumeEmailLimit(organizationId, "send-hour", 100, 60 * 60_000);
  await consumeEmailLimit(organizationId, "send-day", 300, 24 * 60 * 60_000);
  const details = reveal(record);
  let reference: string;
  try {
    if (record.provider === "gmail" && details.refreshToken) {
      reference = await sendGmailMail(
        details.refreshToken,
        details,
        mail,
        assertSendAllowed,
      );
    } else if (record.provider === "brevo" && details.apiKey) {
      const domain = await inspectDomain(details.apiKey, details.senderEmail);
      if (
        !domain.verified ||
        !domain.authenticated ||
        !(await verifiedDomainSender(details.apiKey, details))
      ) {
        throw new OrganizationEmailError(
          "connection",
          "The domain or sender is no longer verified. Check Email settings before sending again.",
        );
      }
      // Recheck after provider validation so a concurrent disconnect cannot start a new send.
      await assertSendAllowed();
      reference = await sendDomainMail(details.apiKey, details, mail);
    } else
      throw new OrganizationEmailError(
        "connection",
        "Email credentials are missing. Reconnect the sender.",
      );
  } catch (error) {
    if (
      error instanceof OrganizationEmailError &&
      error.reason === "connection"
    ) {
      await OrganizationEmailConnectionModel.updateOne(
        { organizationId, revision: record.revision, status: "connected" },
        { $set: { status: "reconnectRequired" } },
      );
    }
    throw error;
  }
  await OrganizationEmailConnectionModel.updateOne(
    { organizationId, revision: record.revision },
    { $set: { lastAcceptedAt: new Date() } },
  );
  return reference;
}

export async function sendOrganizationTestEmail(context: EmailContext) {
  await consumeEmailLimit(context.organizationId, "test", 3, 60 * 60_000);
  const record = await readConnection(context.organizationId);
  if (!record || record.status !== "connected")
    throw new ApiError(409, "Connect and verify a sender first.");
  const { senderEmail } = reveal(record);
  await sendOrganizationEmail(context.organizationId, {
    to: senderEmail,
    subject: "Your company email connection is ready",
    text: "This test confirms that your company can submit outgoing email. This application does not read your inbox.",
    html: "<p>Your company email connection is ready.</p><p>This application does not read your inbox.</p>",
  });
  await audit(context, "email.test.accepted", record.provider);
  return {
    message:
      "The provider accepted the test email to your connected sender address. Check its inbox or spam folder.",
  };
}
