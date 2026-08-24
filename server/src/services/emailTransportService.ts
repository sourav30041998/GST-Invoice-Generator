import nodemailer, { type SendMailOptions } from "nodemailer";
import { env } from "../config/env.js";

let transporter: nodemailer.Transporter | undefined;

function getTransporter() {
  if (!env.SMTP_CONFIGURED) {
    throw new Error("SMTP email delivery is not configured");
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      requireTLS: env.NODE_ENV === "production" && !env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASSWORD,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      tls: { minVersion: "TLSv1.2" },
    });
  }

  return transporter;
}

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

export function formatIndiaTime(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(value);
}

export async function sendApplicationEmail(options: SendMailOptions) {
  await getTransporter().sendMail({
    ...options,
    from: env.SMTP_FROM,
    headers: {
      "X-Auto-Response-Suppress": "All",
      ...options.headers,
    },
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}
