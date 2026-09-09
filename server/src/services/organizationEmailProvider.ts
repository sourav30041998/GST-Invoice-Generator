import { OAuth2Client, CodeChallengeMethod } from "google-auth-library";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { z } from "zod";
import { env } from "../config/env.js";
import { ApiError } from "../middleware/errorHandler.js";
import {
  domainConfigurationSchema,
  GMAIL_SCOPES,
  hasOnlySendScopes,
  mailboxSchema,
  senderListSchema,
} from "../validation/organizationEmailSchemas.js";

export class OrganizationEmailError extends ApiError {
  constructor(
    public readonly reason:
      "connection" | "verification" | "quota" | "unconfirmed",
    message: string,
  ) {
    super(reason === "quota" ? 429 : 409, message);
  }
}

export type OrganizationMail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
};
export type SenderIdentity = { senderName: string; senderEmail: string };

// No caller-controlled host, redirect, message URL, file path, CC or BCC is accepted.
async function providerJson(url: string, init: RequestInit, fetcher = fetch) {
  let response: Response;
  try {
    response = await fetcher(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new OrganizationEmailError(
      "unconfirmed",
      "The email service did not confirm the request. Check the provider before retrying.",
    );
  }
  if (!response.ok) {
    const errorBody =
      response.status === 403
        ? await readProviderBody(response, 64_000).catch(() => ({}))
        : null;
    if (response.status !== 403) await response.body?.cancel();
    const quotaError = z
      .object({
        error: z
          .object({
            errors: z.array(z.object({ reason: z.string() })).optional(),
          })
          .optional(),
      })
      .safeParse(errorBody);
    const quotaReasons = new Set([
      "dailyLimitExceeded",
      "userRateLimitExceeded",
      "rateLimitExceeded",
    ]);
    if (
      response.status === 429 ||
      (quotaError.success &&
        quotaError.data.error?.errors?.some((item) =>
          quotaReasons.has(item.reason),
        ))
    )
      throw new OrganizationEmailError(
        "quota",
        "The email provider's limit was reached. Try again later.",
      );
    if (response.status === 401 || response.status === 403) {
      throw new OrganizationEmailError(
        "connection",
        "Email authorization was rejected. Reconnect the sender in Company Profile.",
      );
    }
    if (response.status === 404)
      throw new ApiError(
        404,
        "This sending domain is not configured in the delivery account.",
      );
    throw new OrganizationEmailError(
      "verification",
      "The provider could not accept this request. Check the sender and domain verification in your delivery account.",
    );
  }
  return readProviderBody(response);
}

async function readProviderBody(
  response: Response,
  maxBytes = 1_000_000,
): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error("oversized");
      }
      chunks.push(value);
    }
    const content = Buffer.concat(chunks).toString("utf8");
    return content ? (JSON.parse(content) as unknown) : {};
  } catch {
    throw new OrganizationEmailError(
      "unconfirmed",
      "The email service returned an unexpected response. Check the provider before retrying.",
    );
  }
}

function brevo(
  path: string,
  apiKey: string,
  method = "GET",
  body?: unknown,
  fetcher = fetch,
) {
  return providerJson(
    `https://api.brevo.com/v3${path}`,
    {
      method,
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    fetcher,
  );
}

export async function inspectDomain(
  apiKey: string,
  senderEmail: string,
  options: { create?: boolean; verify?: boolean } = {},
  fetcher = fetch,
) {
  const domain = mailboxSchema.parse(senderEmail).split("@")[1];
  const path = `/senders/domains/${encodeURIComponent(domain)}`;
  let raw: unknown;
  try {
    raw = await brevo(path, apiKey, "GET", undefined, fetcher);
  } catch (error) {
    if (!(
      error instanceof ApiError &&
      error.statusCode === 404 &&
      options.create
    ))
      throw error;
    await brevo("/senders/domains", apiKey, "POST", { name: domain }, fetcher);
    raw = await brevo(path, apiKey, "GET", undefined, fetcher);
  }
  if (options.verify) {
    try {
      await brevo(`${path}/authenticate`, apiKey, "PUT", undefined, fetcher);
      raw = await brevo(path, apiKey, "GET", undefined, fetcher);
    } catch (error) {
      // DNS may still be propagating; expose the individual records, not provider errors.
      if (!(
        error instanceof OrganizationEmailError &&
        error.reason === "verification"
      ))
        throw error;
    }
  }
  const configuration = domainConfigurationSchema.parse(raw);
  if (configuration.domain.toLowerCase() !== domain)
    throw new OrganizationEmailError(
      "verification",
      "The provider returned a different domain. Reconnect the sender.",
    );
  return configuration;
}

export async function verifiedDomainSender(
  apiKey: string,
  sender: SenderIdentity,
  create = false,
  fetcher = fetch,
) {
  const domain = sender.senderEmail.split("@")[1];
  const path = `/senders?domain=${encodeURIComponent(domain)}`;
  const list = () =>
    brevo(path, apiKey, "GET", undefined, fetcher).then(
      (value) => senderListSchema.parse(value).senders,
    );
  let senders = await list();
  if (!senders.some((item) => item.email === sender.senderEmail) && create) {
    await brevo(
      "/senders",
      apiKey,
      "POST",
      { name: sender.senderName, email: sender.senderEmail },
      fetcher,
    );
    senders = await list();
  }
  return senders.some(
    (item) => item.email === sender.senderEmail && item.active,
  );
}

export function googleEmailClient() {
  if (!env.GOOGLE_EMAIL_CONFIGURED)
    throw new ApiError(
      503,
      "Gmail connection is not enabled yet. Ask the platform operator to configure Google email authorization.",
    );
  return new OAuth2Client({
    clientId: env.GOOGLE_EMAIL_CLIENT_ID,
    clientSecret: env.GOOGLE_EMAIL_CLIENT_SECRET,
    redirectUri: env.GOOGLE_EMAIL_REDIRECT_URI,
    transporterOptions: { timeout: 15_000, retry: false },
  });
}

export async function googleAuthorization(state: string, nonce: string) {
  const client = googleEmailClient();
  const { codeVerifier, codeChallenge } =
    await client.generateCodeVerifierAsync();
  return {
    codeVerifier,
    url: client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent select_account",
      include_granted_scopes: false,
      scope: GMAIL_SCOPES,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    }),
  };
}

export async function exchangeGoogleCode(
  code: string,
  codeVerifier: string,
  nonce: string,
) {
  const client = googleEmailClient();
  let tokenToRevoke: string | undefined;
  try {
    const { tokens } = await client.getToken({ code, codeVerifier });
    tokenToRevoke = tokens.refresh_token || tokens.access_token || undefined;
    if (
      !tokens.id_token ||
      !tokens.refresh_token ||
      !hasOnlySendScopes(tokens.scope || "")
    ) {
      throw new Error("Missing or excessive permissions");
    }
    const identity = (
      await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: env.GOOGLE_EMAIL_CLIENT_ID,
      })
    ).getPayload();
    if (
      !identity ||
      identity.email_verified !== true ||
      (identity as { nonce?: string }).nonce !== nonce
    )
      throw new Error("Invalid identity");
    return {
      senderEmail: mailboxSchema.parse(identity.email),
      refreshToken: tokens.refresh_token,
      googleSubject: identity.sub,
    };
  } catch {
    if (tokenToRevoke) await revokeGoogleToken(tokenToRevoke);
    throw new OrganizationEmailError(
      "connection",
      "Google authorization could not be completed. Connect again and approve send-only access. Use a dedicated Google OAuth project with no broader permissions.",
    );
  }
}

export async function revokeGoogleToken(refreshToken: string) {
  try {
    const response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    await response.body?.cancel();
    return response.ok || response.status === 400;
  } catch {
    return false;
  }
}

export function validateOrganizationMail(mail: OrganizationMail) {
  mailboxSchema.parse(mail.to);
  z.string()
    .min(1)
    .max(200)
    .regex(/^[^\r\n\x00-\x1f]+$/)
    .parse(mail.subject);
  if (
    mail.text.length + mail.html.length > 1_000_000 ||
    (mail.attachments || []).reduce((sum, a) => sum + a.content.length, 0) >
      8_000_000
  ) {
    throw new ApiError(422, "The email is too large to send.");
  }
  for (const attachment of mail.attachments || []) {
    if (
      !Buffer.isBuffer(attachment.content) ||
      !/^[\w. -]{1,160}\.pdf$/i.test(attachment.filename) ||
      attachment.contentType !== "application/pdf"
    ) {
      throw new ApiError(422, "Only generated PDF attachments are supported.");
    }
  }
}

export async function sendDomainMail(
  apiKey: string,
  sender: SenderIdentity,
  mail: OrganizationMail,
  fetcher = fetch,
) {
  validateOrganizationMail(mail);
  const result = await brevo(
    "/smtp/email",
    apiKey,
    "POST",
    {
      sender: { name: sender.senderName, email: sender.senderEmail },
      to: [{ email: mail.to }],
      replyTo: { email: sender.senderEmail, name: sender.senderName },
      subject: mail.subject,
      textContent: mail.text,
      htmlContent: mail.html,
      ...(mail.attachments?.length
        ? {
            attachment: mail.attachments.map((item) => ({
              name: item.filename,
              content: item.content.toString("base64"),
            })),
          }
        : {}),
    },
    fetcher,
  );
  return z.object({ messageId: z.string().min(1).max(512) }).parse(result)
    .messageId;
}

export async function sendGmailMail(
  refreshToken: string,
  sender: SenderIdentity,
  mail: OrganizationMail,
  beforeSend: () => Promise<void>,
) {
  validateOrganizationMail(mail);
  const client = googleEmailClient();
  client.setCredentials({ refresh_token: refreshToken });
  let token: string;
  try {
    const result = await client.getAccessToken();
    if (!result.token) throw new Error("No access token");
    token = result.token;
  } catch {
    throw new OrganizationEmailError(
      "connection",
      "Gmail authorization could not be refreshed. Reconnect Gmail in Company Profile.",
    );
  }
  const raw = await new MailComposer({
    from: { name: sender.senderName, address: sender.senderEmail },
    replyTo: { name: sender.senderName, address: sender.senderEmail },
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments: mail.attachments,
    disableFileAccess: true,
    disableUrlAccess: true,
  })
    .compile()
    .build();
  await beforeSend();
  const result = await providerJson(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: raw.toString("base64url") }),
    },
  );
  return z.object({ id: z.string().min(1).max(512) }).parse(result).id;
}
