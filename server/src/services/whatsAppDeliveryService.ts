import { env } from "../config/env.js";

type WhatsAppTemplateKind =
  | "confirmation"
  | "advanceReceipt"
  | "cancellation";

const templateByKind = {
  confirmation: () => env.WHATSAPP_TEMPLATE_CONFIRMATION,
  advanceReceipt: () => env.WHATSAPP_TEMPLATE_RECEIPT,
  cancellation: () => env.WHATSAPP_TEMPLATE_CANCELLATION,
} satisfies Record<WhatsAppTemplateKind, () => string | undefined>;

export class WhatsAppDeliveryError extends Error {
  code: "NOT_CONFIGURED" | "PROVIDER_REJECTED" | "PROVIDER_UNAVAILABLE";

  constructor(
    code: WhatsAppDeliveryError["code"],
    message = "WhatsApp delivery failed",
  ) {
    super(message);
    this.name = "WhatsAppDeliveryError";
    this.code = code;
  }
}

export async function sendWhatsAppTemplate(input: {
  kind: WhatsAppTemplateKind;
  recipientPhone: string;
  parameters: string[];
}) {
  if (!env.WHATSAPP_CONFIGURED) {
    throw new WhatsAppDeliveryError("NOT_CONFIGURED");
  }
  const templateName = templateByKind[input.kind]();
  if (!templateName) {
    throw new WhatsAppDeliveryError("NOT_CONFIGURED");
  }

  let response: Response;
  try {
    response = await fetch(
      `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: input.recipientPhone.replace(/^\+/, ""),
          type: "template",
          template: {
            name: templateName,
            language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE },
            components: [
              {
                type: "body",
                parameters: input.parameters.map((text) => ({
                  type: "text",
                  text: String(text).slice(0, 1024),
                })),
              },
            ],
          },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    throw new WhatsAppDeliveryError("PROVIDER_UNAVAILABLE");
  }
  if (!response.ok) {
    throw new WhatsAppDeliveryError("PROVIDER_REJECTED");
  }
  const body = (await response.json().catch(() => null)) as {
    messages?: Array<{ id?: string }>;
  } | null;
  return body?.messages?.[0]?.id || "accepted";
}
