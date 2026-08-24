import {
  escapeEmailHtml,
  formatIndiaTime,
  sendApplicationEmail,
} from "./emailTransportService.js";

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

export async function sendPasswordRecoveryCodeEmail({
  recipientEmail,
  recipientName,
  organizationName,
  otp,
  expiresAt,
}: RecoveryCodeEmailInput) {
  const safeName = escapeEmailHtml(recipientName);
  const safeOrganization = escapeEmailHtml(organizationName);
  const safeOtp = escapeEmailHtml(otp);
  const expiry = formatIndiaTime(expiresAt);

  await sendApplicationEmail({
    to: recipientEmail,
    subject: "Your GST Invoice Generator password reset code",
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
      <p>This code expires on <strong>${escapeEmailHtml(expiry)} IST</strong>.</p>
      <p>If you did not request this reset, ignore this email. Your password has not been changed.</p>
      <p>Never share this code with anyone.</p>
    `,
  });
}

export async function sendPasswordChangedEmail({
  recipientEmail,
  recipientName,
  organizationName,
  changedAt,
}: PasswordChangedEmailInput) {
  const safeName = escapeEmailHtml(recipientName);
  const safeOrganization = escapeEmailHtml(organizationName);
  const changedAtText = formatIndiaTime(changedAt);

  await sendApplicationEmail({
    to: recipientEmail,
    subject: "Your GST Invoice Generator password was reset",
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
      <p>The password for your <strong>${safeOrganization}</strong> workspace was reset successfully on <strong>${escapeEmailHtml(changedAtText)} IST</strong>.</p>
      <p>All existing sign-in sessions have been closed.</p>
      <p>If you did not make this change, contact your platform administrator immediately.</p>
      <p>This email never contains your password.</p>
    `,
  });
}
