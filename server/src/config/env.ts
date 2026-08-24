import dotenv from "dotenv";
import path from "node:path";
import { z } from "zod";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const booleanStringSchema = z.enum(["true", "false"]).optional();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(5050),
  MONGODB_URI: z
    .string()
    .min(1)
    .default("mongodb://127.0.0.1:27017/gst_invoice_generator"),
  MONGODB_DB_NAME: z.string().trim().min(1).default("gst_invoice_generator"),
  MONGODB_IP_FAMILY: z.coerce
    .number()
    .int()
    .refine((value) => value === 4 || value === 6)
    .optional(),
  CLIENT_ORIGIN: z.string().trim().min(1).default("http://localhost:5173"),
  SESSION_SECRET: z.string().optional(),
  INVITATION_TOKEN_SECRET: z.string().min(32),
  PASSWORD_RESET_SECRET: z.string().min(32).optional(),
  ADMIN_INTERNAL_SHARED_SECRET: z.string().min(32),
  SMTP_HOST: z.string().trim().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_USER: z.string().trim().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_FROM: z.string().trim().min(3).max(320).optional(),
  SMTP_SECURE: booleanStringSchema,
  SESSION_TTL_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .max(1440)
    .default(480),
  AUTH_REQUIRED: booleanStringSchema,
  TRUST_PROXY: booleanStringSchema,
  COOKIE_SECURE: booleanStringSchema,
  SESSION_COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).optional(),
  ALLOW_DATABASE_RESET: booleanStringSchema,
  REQUEST_BODY_LIMIT: z
    .string()
    .trim()
    .regex(/^\d+(kb|mb)$/i, "Use values like 512kb or 2mb")
    .default("2mb"),
});

const parsedEnv = envSchema.parse(process.env);
const isProduction = parsedEnv.NODE_ENV === "production";

function toBoolean(value: "true" | "false" | undefined, fallback: boolean) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return fallback;
}

const clientOrigins = parsedEnv.CLIENT_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const authRequired = toBoolean(parsedEnv.AUTH_REQUIRED, true);
const cookieSecure = toBoolean(parsedEnv.COOKIE_SECURE, isProduction);
const sessionCookieSameSite =
  parsedEnv.SESSION_COOKIE_SAMESITE || "lax";
const smtpValues = [
  parsedEnv.SMTP_HOST,
  parsedEnv.SMTP_PORT,
  parsedEnv.SMTP_USER,
  parsedEnv.SMTP_PASSWORD,
  parsedEnv.SMTP_FROM,
];
const smtpConfigured = smtpValues.every(Boolean);
const passwordResetSecret =
  parsedEnv.PASSWORD_RESET_SECRET ||
  (!isProduction ? parsedEnv.INVITATION_TOKEN_SECRET : undefined);
if (!clientOrigins.length) {
  throw new Error("CLIENT_ORIGIN must include at least one trusted origin");
}

if (smtpValues.some(Boolean) && !smtpConfigured) {
  throw new Error(
    "SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM must be configured together",
  );
}

if (!passwordResetSecret) {
  throw new Error(
    "PASSWORD_RESET_SECRET must be a dedicated secret of at least 32 characters",
  );
}

if (isProduction) {
  const insecureOrigins = clientOrigins.filter(
    (origin) => !origin.startsWith("https://"),
  );
  if (insecureOrigins.length) {
    throw new Error("Production CLIENT_ORIGIN values must use HTTPS");
  }

  if (/mongodb:\/\/(localhost|127\.0\.0\.1)/i.test(parsedEnv.MONGODB_URI)) {
    throw new Error("Production MONGODB_URI must not point to localhost");
  }

  if (!authRequired) {
    throw new Error("Production requires AUTH_REQUIRED=true");
  }

  if (!cookieSecure) {
    throw new Error("Production requires COOKIE_SECURE=true");
  }

  if (!parsedEnv.PASSWORD_RESET_SECRET) {
    throw new Error(
      "Production requires a dedicated PASSWORD_RESET_SECRET",
    );
  }

  if (!smtpConfigured) {
    throw new Error("Production requires SMTP email delivery configuration");
  }

}

if (!authRequired) {
  throw new Error("AUTH_REQUIRED must be true for organization isolation");
}

if (!parsedEnv.SESSION_SECRET || parsedEnv.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must be at least 32 characters");
}

if (sessionCookieSameSite === "none" && !cookieSecure) {
  throw new Error("SESSION_COOKIE_SAMESITE=none requires COOKIE_SECURE=true");
}

export const env = {
  ...parsedEnv,
  CLIENT_ORIGINS: clientOrigins,
  AUTH_REQUIRED: authRequired,
  TRUST_PROXY: toBoolean(parsedEnv.TRUST_PROXY, isProduction),
  COOKIE_SECURE: cookieSecure,
  SESSION_COOKIE_SAMESITE: sessionCookieSameSite,
  PASSWORD_RESET_SECRET: passwordResetSecret,
  SMTP_CONFIGURED: smtpConfigured,
  SMTP_SECURE: toBoolean(parsedEnv.SMTP_SECURE, parsedEnv.SMTP_PORT === 465),
  COMPANY_SESSION_COOKIE: isProduction
    ? "__Host-company_session"
    : "qi_company_session",
  ALLOW_DATABASE_RESET: toBoolean(
    parsedEnv.ALLOW_DATABASE_RESET,
    !isProduction,
  ),
};
