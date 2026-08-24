import nodemailer from "nodemailer";
import { env } from "../config/env.js";

type RecoveryCodeEmailInput = {
  recipientEmail: string;
  recipientName: string;
  organizationName: string;
  otp: string;
  expiresAt: Date;
};

type PasswordChangedEmailInput = {
  recipientEmail: string;
  recipientName: string;
  organizationName: string;
  changedAt: Date;
};

let transporter: nodemailer.Transporter | undefined;

function escapeHtml(value: string) {
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

function formatIndiaTime(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(value);
}

function getTransporter() {
  if (!env.SMTP_CONFIGURED) {
    throw new Error("SMTP email delivery is not configured");
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
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

const commonHeaders = {
  "X-Auto-Response-Suppress": "All",
};

export async function sendPasswordRecoveryCodeEmail({
  recipientEmail,
  recipientName,
  organizationName,
  otp,
  expiresAt,
}: RecoveryCodeEmailInput) {
  const safeName = escapeHtml(recipientName);
  const safeOrganization = escapeHtml(organizationName);
  const safeOtp = escapeHtml(otp);
  const expiry = formatIndiaTime(expiresAt);

  await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to: recipientEmail,
    subject: "Your GST Invoice Generator password reset code",
    headers: commonHeaders,
    text: [
      `Hello ${recipientName},`,
      "",
      `A password reset was requested for your ${organizationName} workspace.`,
      `Your verification code is: ${otp}`,
      "",
      `This single-use code expires on ${expiry} IST.`,
      "If you did not request this reset, ignore this email. Your password has not been changed.",
      "Never share this code with anyone.",
    ].join("\n"),
    html: `
      <p>Hello ${safeName},</p>
      <p>A password reset was requested for your <strong>${safeOrganization}</strong> workspace.</p>
      <p>Your single-use verification code is:</p>
      <p style="font-size: 28px; font-weight: 700;">${safeOtp}</p>
      <p>This code expires on <strong>${escapeHtml(expiry)} IST</strong>.</p>
      <p>If you did not request this reset, ignore this email. Your password has not been changed.</p>
      <p>Never share this code with anyone.</p>
    `,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

export async function sendPasswordChangedEmail({
  recipientEmail,
  recipientName,
  organizationName,
  changedAt,
}: PasswordChangedEmailInput) {
  const safeName = escapeHtml(recipientName);
  const safeOrganization = escapeHtml(organizationName);
  const changedAtText = formatIndiaTime(changedAt);

  await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to: recipientEmail,
    subject: "Your GST Invoice Generator password was reset",
    headers: commonHeaders,
    text: [
      `Hello ${recipientName},`,
      "",
      `The password for your ${organizationName} workspace was reset successfully on ${changedAtText} IST.`,
      "All existing sign-in sessions have been closed.",
      "",
      "If you did not make this change, contact your platform administrator immediately.",
      "This email never contains your password.",
    ].join("\n"),
    html: `
      <p>Hello ${safeName},</p>
      <p>The password for your <strong>${safeOrganization}</strong> workspace was reset successfully on <strong>${escapeHtml(changedAtText)} IST</strong>.</p>
      <p>All existing sign-in sessions have been closed.</p>
      <p>If you did not make this change, contact your platform administrator immediately.</p>
      <p>This email never contains your password.</p>
    `,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

