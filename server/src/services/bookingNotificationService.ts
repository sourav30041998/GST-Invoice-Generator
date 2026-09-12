import crypto from "node:crypto";
import { env } from "../config/env.js";
import { ApiError } from "../middleware/errorHandler.js";
import { BookingModel } from "../models/Booking.js";
import { BookingNotificationModel } from "../models/BookingNotification.js";
import { BookingPaymentModel } from "../models/BookingPayment.js";
import { CustomerModel } from "../models/Customer.js";
import type { BookingNotificationPayload } from "../validation/bookingSchemas.js";
import {
  revealBookingRecord,
  revealCustomerRecord,
  revealPaymentRecord,
} from "./customerProtectionService.js";
import { encryptProtectedJson } from "./dataProtectionService.js";
import {
  escapeEmailHtml,
} from "./emailTransportService.js";
import { sendOrganizationEmail } from "./organizationEmailService.js";
import { OrganizationEmailError } from "./organizationEmailProvider.js";
import {
  bookingReceiptFilename,
  bookingSlipFilename,
  buildBookingReceiptPdf,
  buildBookingSlipPdf,
} from "./bookingReceiptPdfService.js";
import type { TenantContext } from "./invoiceService.js";
import { getSettings } from "./settingsService.js";
import {
  sendWhatsAppTemplate,
  WhatsAppDeliveryError,
} from "./whatsAppDeliveryService.js";

const CUSTOMER_ROOM_ASSIGNMENT_NOTICE = "Managed internally by the property";

function recipientHash(
  organizationId: string,
  channel: "email" | "whatsapp",
  value: string,
) {
  return crypto
    .createHmac("sha256", env.DATA_ENCRYPTION_KEY_BYTES)
    .update(`notification-recipient:v1:${organizationId}:${channel}:${value}`)
    .digest("base64url");
}

function notificationIdempotencyHash(
  organizationId: string,
  idempotencyKey: string,
  channel: "email" | "whatsapp",
) {
  return crypto
    .createHmac("sha256", env.DATA_ENCRYPTION_KEY_BYTES)
    .update(
      `booking-notification:v1:${organizationId}:${idempotencyKey}:${channel}`,
    )
    .digest("base64url");
}

function formatMoney(valueMinor: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(valueMinor / 100);
}

function safeSubject(value: string) {
  return value.replace(/[\r\n]+/g, " ").slice(0, 160);
}

function requestedRoomSummary(
  requests: Array<{
    roomType: string;
    bedsPerRoom: number;
    quantity: number;
  }> = [],
) {
  const summary = requests
    .map(
      (request) =>
        `${request.quantity} x ${request.bedsPerRoom}-bed${request.roomType ? ` ${request.roomType}` : ""} room${request.quantity === 1 ? "" : "s"}`,
    )
    .join(", ");
  return summary || "Not recorded";
}

async function contextForNotification(
  tenant: TenantContext,
  bookingId: string,
  paymentId?: string,
) {
  const booking = await BookingModel.findOne({
    _id: bookingId,
    organizationId: tenant.organizationId,
  })
    .select("+protectedData")
    .lean();
  if (!booking) throw new ApiError(404, "Booking not found");
  const customer = await CustomerModel.findOne({
    _id: booking.customerId,
    organizationId: tenant.organizationId,
    status: "active",
  })
    .select("+protectedData")
    .lean();
  if (!customer) throw new ApiError(404, "Customer not found");
  const payment = paymentId
    ? await BookingPaymentModel.findOne({
        _id: paymentId,
        organizationId: tenant.organizationId,
        bookingId,
      })
        .select("+protectedData")
        .lean()
    : null;
  if (paymentId && !payment) {
    throw new ApiError(404, "Payment receipt not found");
  }
  const settings = await getSettings(tenant.organizationId);
  return {
    booking: revealBookingRecord(booking, tenant.organizationId),
    customer: revealCustomerRecord(customer, tenant.organizationId),
    payment: payment
      ? revealPaymentRecord(payment, tenant.organizationId)
      : null,
    business: settings.preset,
    logoDataUrl: settings.logoDataUrl,
  };
}

export function buildBookingEmailContent(
  kind: BookingNotificationPayload["kind"],
  context: Awaited<ReturnType<typeof contextForNotification>>,
) {
  const roomRequest = requestedRoomSummary(context.booking.requestedRooms);
  const receipt = context.payment
    ? `<p><strong>Receipt:</strong> ${escapeEmailHtml(context.payment.receiptNumber)}<br><strong>Advance received:</strong> ${escapeEmailHtml(formatMoney(context.payment.amountMinor))}<br><strong>Payment method:</strong> ${escapeEmailHtml(context.payment.method)}</p>`
    : "";
  const heading =
    kind === "cancellation"
      ? "Booking cancellation"
      : kind === "advanceReceipt"
        ? "Advance payment receipt"
        : "Booking confirmation";
  const subject = `${heading} - ${context.booking.confirmationNumber}`;
  const text = [
    `Hello ${context.customer.name},`,
    "",
    `${heading} from ${context.business.business_name}.`,
    "",
    "We are pleased to confirm your booking with us. Please find your reservation details below:",
    "",
    "Booking Details",
    "",
    `Confirmation: ${context.booking.confirmationNumber}`,
    `Arrival: ${context.booking.checkinDate}`,
    `Departure: ${context.booking.checkoutDate}`,
    `Expected occupancy: ${context.booking.guestCount}`,
    `Room request: ${roomRequest}`,
    ...(context.payment
      ? [
          `Receipt: ${context.payment.receiptNumber}`,
          `Advance received: ${formatMoney(context.payment.amountMinor)}`,
          `Payment method: ${context.payment.method}`,
        ]
      : []),
    "",
    "Your booking has been successfully confirmed based on the details provided above.",
    "", 
    "Terms and conditions:",
    context.booking.termsSnapshot,
    "",
    "We look forward to welcoming you and hope you have a pleasant stay with us.",
    "",
    `For any assistance or further information regarding your reservation, please feel free to contact us at ${context.business.phone}.`,
    "",
    "Warm regards,",
    `${context.business.business_name}`,
    "Reservations Team"
  ].join("\n");
  const html = `
    <p>Hello ${escapeEmailHtml(context.customer.name)},</p>
    <p>${escapeEmailHtml(heading)} from <strong>${escapeEmailHtml(context.business.business_name)}</strong>.</p>
    <p>We are pleased to confirm your booking with us. Please find your reservation details below:</p>
    <h3>Booking Details</h3>
    <p><strong>Confirmation:</strong> ${escapeEmailHtml(context.booking.confirmationNumber)}<br>
    <strong>Arrival:</strong> ${escapeEmailHtml(context.booking.checkinDate)}<br>
    <strong>Departure:</strong> ${escapeEmailHtml(context.booking.checkoutDate)}<br>
    <strong>Expected occupancy:</strong> ${escapeEmailHtml(String(context.booking.guestCount))}<br>
    <strong>Room request:</strong> ${escapeEmailHtml(roomRequest)}</p>
    ${receipt}
    <p>Your booking has been successfully confirmed based on the details provided above.</p>
    <p><strong>Terms and conditions</strong><br>${escapeEmailHtml(context.booking.termsSnapshot).replace(/\n/g, "<br>")}</p>
    <p>We look forward to welcoming you and hope you have a pleasant stay with us.</p>
    <p>For any assistance or further information regarding your reservation, please feel free to contact us at <strong>${escapeEmailHtml(context.business.phone)}</strong>.</p>
    <p><strong>Warm regards,</strong><br>${escapeEmailHtml(context.business.business_name)}<br>Reservations Team</p>
  `;
  return { subject, text, html };
}

export function buildBookingWhatsAppParameters(
  context: Awaited<ReturnType<typeof contextForNotification>>,
) {
  return [
    context.customer.name,
    context.booking.confirmationNumber,
    context.payment?.receiptNumber || "-",
    context.booking.checkinDate,
    context.booking.checkoutDate,
    CUSTOMER_ROOM_ASSIGNMENT_NOTICE,
    context.payment ? formatMoney(context.payment.amountMinor) : formatMoney(0),
    context.booking.termsSnapshot,
  ];
}

export async function sendBookingNotifications(
  tenant: TenantContext,
  bookingId: string,
  payload: BookingNotificationPayload,
) {
  const context = await contextForNotification(
    tenant,
    bookingId,
    payload.paymentId,
  );
  if (
    payload.kind === "confirmation" &&
    context.booking.status !== "confirmed"
  ) {
    throw new ApiError(409, "Only a confirmed booking can send a confirmation");
  }
  if (
    payload.kind === "cancellation" &&
    context.booking.status !== "cancelled"
  ) {
    throw new ApiError(
      409,
      "Only a cancelled booking can send a cancellation notice",
    );
  }
  const content = buildBookingEmailContent(payload.kind, context);
  const results: Array<{
    channel: "email" | "whatsapp";
    status: "sent" | "failed" | "skipped";
    message: string;
  }> = [];

  for (const channel of payload.channels) {
    const recipient =
      channel === "email" ? context.customer.email : context.customer.phone;
    const idempotencyKeyHash = notificationIdempotencyHash(
      tenant.organizationId,
      payload.idempotencyKey,
      channel,
    );
    const previouslyProcessed = await BookingNotificationModel.findOne({
      organizationId: tenant.organizationId,
      idempotencyKeyHash,
    }).lean();
    if (previouslyProcessed) {
      if (
        String(previouslyProcessed.bookingId) !== bookingId ||
        previouslyProcessed.kind !== payload.kind ||
        String(previouslyProcessed.paymentId || "") !==
          (payload.paymentId || "")
      ) {
        throw new ApiError(409, "This notification request was already used");
      }
      results.push({
        channel,
        status:
          previouslyProcessed.status === "sent"
            ? "sent"
            : previouslyProcessed.status === "failed"
              ? "failed"
              : "skipped",
        message:
          previouslyProcessed.status === "pending"
            ? "This notification is already being processed."
            : "This notification request was already processed.",
      });
      continue;
    }
    const previousDelivery = await BookingNotificationModel.exists({
      organizationId: tenant.organizationId,
      bookingId,
      channel,
      kind: payload.kind,
      status: "sent",
      ...(payload.kind === "advanceReceipt" && payload.paymentId
        ? { paymentId: payload.paymentId }
        : {}),
    });
    if (previousDelivery && !payload.allowResend) {
      throw new ApiError(
        409,
        `${channel === "email" ? "Email" : "WhatsApp"} was already sent. Confirm the resend before sending another copy.`,
      );
    }
    let notification;
    try {
      notification = await BookingNotificationModel.create({
        organizationId: tenant.organizationId,
        bookingId,
        customerId: context.booking.customerId,
        paymentId: payload.paymentId,
        channel,
        kind: payload.kind,
        idempotencyKeyHash,
        recipientHash: recipientHash(
          tenant.organizationId,
          channel,
          recipient || "missing",
        ),
        status: "pending",
        createdByUserId: tenant.userId,
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const existing = await BookingNotificationModel.findOne({
        organizationId: tenant.organizationId,
        idempotencyKeyHash,
      }).lean();
      if (!existing) throw error;
      if (
        String(existing.bookingId) !== bookingId ||
        existing.kind !== payload.kind ||
        String(existing.paymentId || "") !== (payload.paymentId || "")
      ) {
        throw new ApiError(409, "This notification request was already used");
      }
      results.push({
        channel,
        status:
          existing.status === "sent"
            ? "sent"
            : existing.status === "failed"
              ? "failed"
              : "skipped",
        message:
          existing.status === "pending"
            ? "This notification is already being processed."
            : "This notification request was already processed.",
      });
      continue;
    }
    let status: "sent" | "failed" | "skipped" = "sent";
    let errorCode = "";
    let providerReference = "";
    let message = `${channel === "email" ? "Email" : "WhatsApp"} sent.`;
    try {
      if (!recipient) {
        status = "skipped";
        errorCode = `MISSING_${channel.toUpperCase()}`;
        message = `Customer does not have a ${channel === "email" ? "saved email address" : "saved phone number"}.`;
      } else if (channel === "whatsapp" && !context.customer.whatsappOptIn) {
        status = "skipped";
        errorCode = "WHATSAPP_CONSENT_REQUIRED";
        message = "WhatsApp consent is not recorded for this customer.";
      } else if (channel === "email") {
          const receiptInput = context.payment
            ? {
                businessName: context.business.business_name,
                businessTagline: context.business.tagline || "",
                businessLogoDataUrl: context.logoDataUrl,
                businessAddressLines: [
                  context.business.address_line1 || "",
                  context.business.address_line2 || "",
                ],
                businessPhone: context.business.phone || "",
                businessEmail: context.business.email || "",
                businessWebsite: context.business.website || "",
                customerName: context.customer.name,
                confirmationNumber: context.booking.confirmationNumber,
                receiptNumber: context.payment.receiptNumber,
                checkinDate: context.booking.checkinDate,
                checkoutDate: context.booking.checkoutDate,
                checkinTime: context.business.checkin_time,
                checkoutTime: context.business.checkout_time,
                guestCount: context.booking.guestCount,
                requestedRooms: context.booking.requestedRooms || [],
                amountMinor: context.payment.amountMinor,
                estimatedTotalMinor: context.booking.estimatedTotalMinor || 0,
                advanceBalanceMinor: context.booking.advanceBalanceMinor || 0,
                paymentMethod: context.payment.method,
                receivedAt: context.payment.receivedAt,
                terms: context.booking.termsSnapshot,
              }
            : null;
          const receiptAttachments =
            context.payment && receiptInput
              ? [
                  {
                    filename: bookingReceiptFilename(
                      context.payment.receiptNumber,
                    ),
                    content: buildBookingReceiptPdf(receiptInput),
                    contentType: "application/pdf",
                  },
                  // {
                  //   filename: bookingSlipFilename(
                  //     context.payment.receiptNumber,
                  //   ),
                  //   content: buildBookingSlipPdf(receiptInput),
                  //   contentType: "application/pdf",
                  // },
                ]
              : undefined;
          providerReference = await sendOrganizationEmail(tenant.organizationId, {
            to: recipient,
            subject: safeSubject(content.subject),
            text: content.text,
            html: content.html,
            attachments: receiptAttachments,
          });
      } else {
        providerReference = await sendWhatsAppTemplate({
          kind: payload.kind,
          recipientPhone: recipient,
          parameters: buildBookingWhatsAppParameters(context),
        });
      }
    } catch (error) {
      if (channel === "email" && (error instanceof OrganizationEmailError || error instanceof ApiError)) {
        status = "failed";
        errorCode = "EMAIL_CONNECTION_OR_DELIVERY_FAILED";
        message = error.message;
      } else if (
        error instanceof WhatsAppDeliveryError &&
        error.code === "NOT_CONFIGURED"
      ) {
        status = "skipped";
        errorCode = "WHATSAPP_NOT_CONFIGURED";
        message = "WhatsApp delivery is not configured.";
      } else {
        status = "failed";
        errorCode =
          error instanceof WhatsAppDeliveryError
            ? `WHATSAPP_${error.code}`
            : "EMAIL_DELIVERY_FAILED";
        message = `${channel === "email" ? "Email" : "WhatsApp"} could not be delivered.`;
      }
    }

    await BookingNotificationModel.updateOne(
      {
        _id: notification._id,
        organizationId: tenant.organizationId,
        status: "pending",
      },
      {
        $set: {
          status,
          errorCode,
          ...(providerReference ||
          (channel === "whatsapp" && context.customer.whatsappOptInRecordedAt)
            ? {
                protectedData: encryptProtectedJson(
                  "booking-notification",
                  tenant.organizationId,
                  {
                    providerReference,
                    whatsappConsentRecordedAt:
                      channel === "whatsapp"
                        ? context.customer.whatsappOptInRecordedAt || ""
                        : "",
                  },
                ),
              }
            : {}),
          ...(status === "sent" ? { sentAt: new Date() } : {}),
        },
      },
    );
    results.push({ channel, status, message });
  }
  return { results };
}
