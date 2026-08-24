import { env } from "../config/env.js";
import {
  escapeEmailHtml,
  formatIndiaTime,
  sendApplicationEmail,
} from "./emailTransportService.js";

type InvitationEmailInput = {
  recipientEmail: string;
  recipientName: string;
  organizationName: string;
  token: string;
  expiresAt: Date;
};

export async function sendOrganizationInvitationEmail({
  recipientEmail,
  recipientName,
  organizationName,
  token,
  expiresAt,
}: InvitationEmailInput) {
  const invitationUrl = `${env.COMPANY_APP_ORIGIN}/#invite=${encodeURIComponent(token)}`;
  const expiry = formatIndiaTime(expiresAt);
  const subjectOrganization = organizationName.replace(/[\r\n]+/g, " ");
  const safeName = escapeEmailHtml(recipientName);
  const safeOrganization = escapeEmailHtml(organizationName);
  const safeInvitationUrl = escapeEmailHtml(invitationUrl);

  await sendApplicationEmail({
    to: recipientEmail,
    subject: `Invitation to ${subjectOrganization} on GST Invoice Generator`,
    text: [
      `Hello ${recipientName},`,
      "",
      `You have been invited to register the ${organizationName} workspace on GST Invoice Generator.`,
      `Complete registration before ${expiry} IST:`,
      invitationUrl,
      "",
      "This invitation is single-use. If you were not expecting it, do not open the link.",
    ].join("\n"),
    html: `
      <p>Hello ${safeName},</p>
      <p>You have been invited to register the <strong>${safeOrganization}</strong> workspace on GST Invoice Generator.</p>
      <p>Complete registration before <strong>${escapeEmailHtml(expiry)} IST</strong>.</p>
      <p><a href="${safeInvitationUrl}" rel="noreferrer">Complete organization registration</a></p>
      <p>This invitation is single-use. If you were not expecting it, do not open the link.</p>
    `,
  });
}
