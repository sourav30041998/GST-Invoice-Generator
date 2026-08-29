import dotenv from "dotenv";
import crypto from "node:crypto";
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
  COMPANY_APP_ORIGIN: z.string().trim().min(1).optional(),
  SESSION_SECRET: z.string().optional(),
  DATA_ENCRYPTION_KEY: z.string().trim().optional(),
  INVITATION_TOKEN_SECRET: z.string().min(32),
  PASSWORD_RESET_SECRET: z.string().min(32).optional(),
  ADMIN_INTERNAL_SHARED_SECRET: z.string().min(32),
  SMTP_HOST: z.string().trim().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_USER: z.string().trim().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_FROM: z
    .string()
    .trim()
    .min(3)
    .max(320)
    .refine(
      (value) => !/[\r\n]/.test(value),
      "SMTP_FROM cannot contain new lines",
    )
    .optional(),
  SMTP_SECURE: booleanStringSchema,
  SESSION_TTL_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .max(1440)
    .default(480),
  SESSION_IDLE_TTL_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .max(480)
    .default(60),
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
const companyAppOrigin = parsedEnv.COMPANY_APP_ORIGIN || clientOrigins[0];

const authRequired = toBoolean(parsedEnv.AUTH_REQUIRED, true);
const cookieSecure = toBoolean(parsedEnv.COOKIE_SECURE, isProduction);
const sessionCookieSameSite = parsedEnv.SESSION_COOKIE_SAMESITE || "lax";
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

function decodeEncryptionKey(value: string | undefined) {
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    return undefined;
  }
  try {
    const key = Buffer.from(value, "base64url");
    return key.length === 32 ? key : undefined;
  } catch {
    return undefined;
  }
}

const configuredEncryptionKey = decodeEncryptionKey(
  parsedEnv.DATA_ENCRYPTION_KEY,
);
if (!clientOrigins.length) {
  throw new Error("CLIENT_ORIGIN must include at least one trusted origin");
}

function validateExactOrigin(value: string, variableName: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} contains an invalid URL origin`);
  }
  if (
    url.origin !== value ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(`${variableName} values must be exact HTTP(S) origins`);
  }
}

clientOrigins.forEach((origin) => validateExactOrigin(origin, "CLIENT_ORIGIN"));
validateExactOrigin(companyAppOrigin, "COMPANY_APP_ORIGIN");

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

  if (!parsedEnv.COMPANY_APP_ORIGIN) {
    throw new Error("Production requires COMPANY_APP_ORIGIN");
  }
  if (!companyAppOrigin.startsWith("https://")) {
    throw new Error("Production COMPANY_APP_ORIGIN must use HTTPS");
  }
  if (!clientOrigins.includes(companyAppOrigin)) {
    throw new Error(
      "Production COMPANY_APP_ORIGIN must also appear in CLIENT_ORIGIN",
    );
  }

  if (!parsedEnv.MONGODB_URI.startsWith("mongodb+srv://")) {
    throw new Error("Production MongoDB must use a TLS-enabled Atlas SRV URI");
  }

  if (!authRequired) {
    throw new Error("Production requires AUTH_REQUIRED=true");
  }

  if (!cookieSecure) {
    throw new Error("Production requires COOKIE_SECURE=true");
  }

  if (!parsedEnv.PASSWORD_RESET_SECRET) {
    throw new Error("Production requires a dedicated PASSWORD_RESET_SECRET");
  }

  if (!configuredEncryptionKey) {
    throw new Error(
      "Production DATA_ENCRYPTION_KEY must be a Base64URL-encoded 32-byte key",
    );
  }

  if (!smtpConfigured) {
    throw new Error("Production requires SMTP email delivery configuration");
  }

  const productionSecrets = [
    parsedEnv.SESSION_SECRET,
    parsedEnv.INVITATION_TOKEN_SECRET,
    parsedEnv.PASSWORD_RESET_SECRET,
    parsedEnv.ADMIN_INTERNAL_SHARED_SECRET,
    parsedEnv.DATA_ENCRYPTION_KEY,
  ].filter((value): value is string => Boolean(value));
  if (
    productionSecrets.some((value) =>
      /(replace|change[-_ ]?me|example|your[-_ ]|placeholder)/i.test(value),
    )
  ) {
    throw new Error("Production security secrets cannot contain placeholders");
  }
  if (new Set(productionSecrets).size !== productionSecrets.length) {
    throw new Error("Production security secrets must be distinct");
  }
}

if (!authRequired) {
  throw new Error("AUTH_REQUIRED must be true for organization isolation");
}

if (!parsedEnv.SESSION_SECRET || parsedEnv.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must be at least 32 characters");
}

if (parsedEnv.SESSION_IDLE_TTL_MINUTES > parsedEnv.SESSION_TTL_MINUTES) {
  throw new Error("SESSION_IDLE_TTL_MINUTES cannot exceed SESSION_TTL_MINUTES");
}

const dataEncryptionKey =
  configuredEncryptionKey ||
  crypto
    .createHash("sha256")
    .update(`development-only:${parsedEnv.SESSION_SECRET}`)
    .digest();

if (sessionCookieSameSite === "none" && !cookieSecure) {
  throw new Error("SESSION_COOKIE_SAMESITE=none requires COOKIE_SECURE=true");
}

export const env = {
  ...parsedEnv,
  CLIENT_ORIGINS: clientOrigins,
  COMPANY_APP_ORIGIN: companyAppOrigin,
  AUTH_REQUIRED: authRequired,
  TRUST_PROXY: toBoolean(parsedEnv.TRUST_PROXY, isProduction),
  COOKIE_SECURE: cookieSecure,
  SESSION_COOKIE_SAMESITE: sessionCookieSameSite,
  PASSWORD_RESET_SECRET: passwordResetSecret,
  DATA_ENCRYPTION_KEY_BYTES: dataEncryptionKey,
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
