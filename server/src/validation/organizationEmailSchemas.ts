import { z } from "zod";

const singleLine = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[^\r\n\x00-\x1f]+$/);
export const mailboxSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email()
  .regex(
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+$/,
    "Enter a single email address, without a display name.",
  );
export const emailReauthSchema = z
  .object({ password: z.string().min(1).max(256) })
  .strict();
export const gmailConnectSchema = emailReauthSchema.extend({
  senderName: singleLine,
});
export const gmailCompleteSchema = z
  .object({
    state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    code: z.string().min(1).max(4096),
  })
  .strict();
export const domainConnectSchema = emailReauthSchema
  .extend({
    senderName: singleLine,
    senderEmail: mailboxSchema,
    apiKey: z
      .string()
      .trim()
      .min(20)
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/, "Enter a valid Brevo API key."),
  })
  .superRefine((value, ctx) => {
    const domain = value.senderEmail.split("@")[1];
    if (
      !domain ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
        domain,
      ) ||
      [
        "gmail.com",
        "googlemail.com",
        "outlook.com",
        "hotmail.com",
        "yahoo.com",
        "icloud.com",
      ].includes(domain)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["senderEmail"],
        message:
          "Use a domain your company owns. For Gmail, choose Connect Gmail.",
      });
    }
  });

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GMAIL_SCOPES = ["openid", "email", GMAIL_SEND_SCOPE];
export function hasOnlySendScopes(scope: string) {
  const values = new Set(scope.split(/\s+/).filter(Boolean));
  const allowed = new Set([
    ...GMAIL_SCOPES,
    "https://www.googleapis.com/auth/userinfo.email",
  ]);
  return (
    values.has(GMAIL_SEND_SCOPE) &&
    [...values].every((value) => allowed.has(value))
  );
}

export const domainConfigurationSchema = z.object({
  domain: z.string(),
  verified: z.boolean(),
  authenticated: z.boolean(),
  dns_records: z
    .record(
      z.object({
        host_name: z.string().max(512),
        type: z.enum(["TXT", "CNAME", "MX"]),
        value: z.string().max(4096),
        status: z.boolean(),
      }),
    )
    .default({}),
});
export const senderListSchema = z.object({
  senders: z
    .array(
      z.object({
        id: z.number().int().positive(),
        email: mailboxSchema,
        active: z.boolean(),
      }),
    )
    .default([]),
});
