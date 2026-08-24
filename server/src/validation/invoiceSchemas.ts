import { z } from "zod";
import { isValidStayRange } from "../utils/roomRules.js";
import { selectedRoomSchema } from "./roomSchemas.js";
import {
  calculateInvoiceTotals,
  MAX_INVOICE_AMOUNT,
} from "../utils/calculateInvoice.js";

function isCalendarDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
  .refine(isCalendarDate, "Use a valid calendar date");

const optionalIsoDateSchema = z
  .string()
  .trim()
  .max(20)
  .refine(
    (value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value),
    "Use YYYY-MM-DD format",
  )
  .refine(
    (value) => !value || isCalendarDate(value),
    "Use a valid calendar date",
  )
  .default("");

const shortText = (max: number) => z.string().trim().max(max);
const optionalText = (max: number, fallback = "") =>
  shortText(max).optional().default(fallback);

const decimalLiteral = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function decimalInput(
  label: string,
  options: {
    min: number;
    max: number;
    decimalPlaces: number;
    maxMessage?: string;
  },
) {
  return z
    .union([
      z.number().finite(),
      z
        .string()
        .trim()
        .regex(decimalLiteral, `${label} must be a valid number`)
        .transform(Number),
    ])
    .transform(Number)
    .refine(Number.isFinite, `${label} must be a finite number`)
    .refine(
      (value) => value >= options.min,
      `${label} must be at least ${options.min}`,
    )
    .refine(
      (value) => value <= options.max,
      `${label} must not exceed ${options.maxMessage || options.max}`,
    )
    .refine(
      (value) =>
        Math.abs(
          value -
            Math.round(value * 10 ** options.decimalPlaces) /
              10 ** options.decimalPlaces,
        ) < 1e-8,
      `${label} can have at most ${options.decimalPlaces} decimal places`,
    );
}

const nonNegativeMoney = (label: string, max = MAX_INVOICE_AMOUNT) =>
  decimalInput(label, {
    min: 0,
    max,
    decimalPlaces: 2,
    maxMessage: `Rs. ${MAX_INVOICE_AMOUNT.toLocaleString("en-US")}.00`,
  });
const positiveMoney = (label: string, max = MAX_INVOICE_AMOUNT) =>
  decimalInput(label, {
    min: 0.01,
    max,
    decimalPlaces: 2,
    maxMessage: `Rs. ${MAX_INVOICE_AMOUNT.toLocaleString("en-US")}.00`,
  });
const positiveQuantity = (label: string) =>
  decimalInput(label, { min: 0.001, max: 999, decimalPlaces: 3 });
const taxRate = (label: string) =>
  decimalInput(label, { min: 0, max: 100, decimalPlaces: 2 });

export const invoiceWorkflowStatusSchema = z.enum([
  "draft",
  "reserved",
  "checkedIn",
  "checkedOut",
]);
export const invoiceWorkflowQueryStatusSchema = z.enum([
  "",
  "draft",
  "reserved",
  "checkedIn",
  "checkedOut",
  "cancelled",
]);
export const invoiceWorkbenchStatusSchema = z.enum([
  "all",
  "draft",
  "reserved",
  "checkedIn",
  "checkedOut",
  "cancelled",
]);
export const nextInvoiceNumberQuerySchema = z
  .object({
    prefix: z
      .string()
      .trim()
      .min(2)
      .max(8)
      .regex(/^[A-Z0-9]+$/i, "Use only letters and numbers")
      .optional(),
    invoiceDate: isoDateSchema.optional(),
  })
  .strict();

export const invoiceNumberParamSchema = z
  .object({
    invNo: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[A-Z0-9-]+$/i, "Invalid invoice number"),
  })
  .strict();

export const draftIdParamSchema = z
  .object({
    draftId: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{24}$/i, "Draft not found"),
  })
  .strict();

export const revisionSchema = z
  .object({
    version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export const presetSchema = z
  .object({
    business_name: shortText(120).min(1),
    tagline: optionalText(160),
    gstin: optionalText(32),
    address_line1: optionalText(180),
    address_line2: optionalText(180),
    phone: optionalText(40),
    fax: optionalText(80),
    upi: optionalText(120),
    website: optionalText(120),
    email: z.string().trim().email().or(z.literal("")).optional().default(""),
    bank_acc_name: optionalText(160),
    invoice_prefix: z
      .string()
      .trim()
      .min(2)
      .max(8)
      .regex(/^[A-Z0-9]+$/i, "Use only letters and numbers")
      .transform((value) => value.toUpperCase()),
    bank_name: optionalText(160),
    bank_account: optionalText(40),
    bank_ifsc: optionalText(20),
    terms: optionalText(700),
  })
  .strict();

export const lineItemSchema = z
  .object({
    presetKey: optionalText(80, "Custom"),
    description: optionalText(240),
    hsn: z
      .string()
      .trim()
      .max(6, "HSN/SAC cannot exceed 6 digits")
      .refine(
        (value) => !value || /^\d{4}(?:\d{2})?$/.test(value),
        "HSN/SAC must contain 4 or 6 digits",
      )
      .optional()
      .default(""),
    date: optionalIsoDateSchema,
    units: positiveQuantity("Units"),
    rate: positiveMoney("Rate"),
    cgstRate: taxRate("CGST rate").optional().default(0),
    sgstRate: taxRate("SGST rate").optional().default(0),
    igstRate: taxRate("IGST rate").optional().default(0),
    taxInclusive: z.boolean().optional().default(false),
  })
  .strict()
  .superRefine((item, context) => {
    const hasCgst = item.cgstRate > 0;
    const hasSgst = item.sgstRate > 0;
    const hasIgst = item.igstRate > 0;

    if (hasIgst && (hasCgst || hasSgst)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["igstRate"],
        message: "Use either IGST or the CGST/SGST pair, not both",
      });
    }

    if (hasCgst !== hasSgst || (hasCgst && item.cgstRate !== item.sgstRate)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cgstRate"],
        message: "CGST and SGST must be applied together at equal rates",
      });
    }

    if (item.cgstRate + item.sgstRate + item.igstRate > 100) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["igstRate"],
        message: "The combined GST rate cannot exceed 100%",
      });
    }
  });

export const adjustmentSchema = z
  .object({
    desc: shortText(180).min(1, "Adjustment description is required"),
    amount: positiveMoney("Adjustment amount"),
    type: z.enum(["add", "deduct"]).optional().default("add"),
  })
  .strict();

const invoicePayloadBaseSchema = z
  .object({
    invDate: isoDateSchema,
    checkinDate: isoDateSchema,
    checkoutDate: isoDateSchema,
    confirmNo: optionalText(80),
    partyName: shortText(160).min(1, "Payee name is required"),
    partyGSTIN: z
      .string()
      .trim()
      .max(32)
      .transform((value) => value.toUpperCase())
      .refine(
        (value) =>
          !value ||
          /^(?:0[1-9]|[12]\d|3[0-7])[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(
            value,
          ),
        "GSTIN must be a valid 15-character Indian GSTIN",
      )
      .optional()
      .default(""),
    partyAddress: shortText(500).min(1, "Address is required"),
    partyState: shortText(120).min(1, "State is required"),
    groupName: optionalText(160),
    rooms: z
      .array(selectedRoomSchema)
      .min(1, "Select at least one room")
      .max(20),
    workflowStatus: invoiceWorkflowStatusSchema
      .optional()
      .default("checkedOut"),
    lineItems: z.array(lineItemSchema).min(1).max(100),
    adjustments: z.array(adjustmentSchema).max(50).optional().default([]),
  })
  .strict();

type InvoicePayloadBase = z.infer<typeof invoicePayloadBaseSchema>;

function validateInvoiceComposition(
  invoice: InvoicePayloadBase,
  context: z.RefinementCtx,
) {
  if (!isValidStayRange(invoice.checkinDate, invoice.checkoutDate)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["checkoutDate"],
      message: "Departure must be after arrival",
    });
  }

  const totals = calculateInvoiceTotals(invoice.lineItems, invoice.adjustments);
  if (totals.netTotal <= 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["adjustments"],
      message:
        "Deductions cannot reduce the invoice payable amount to zero or below",
    });
  }
}

export const invoicePayloadSchema = invoicePayloadBaseSchema.superRefine(
  validateInvoiceComposition,
);

export const draftInvoicePayloadSchema = invoicePayloadBaseSchema
  .extend({ workflowStatus: z.literal("draft") })
  .superRefine(validateInvoiceComposition);

export const invoiceUpdatePayloadSchema = invoicePayloadBaseSchema
  .extend({ version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) })
  .superRefine(validateInvoiceComposition);

export const invoiceQuerySchema = z
  .object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    gst: z.enum(["", "yes", "no"]).optional().default(""),
    status: z.enum(["", "active", "cancelled"]).optional().default(""),
    workflowStatus: invoiceWorkflowQueryStatusSchema.optional().default(""),
    search: z.string().trim().max(120).optional().default(""),
  })
  .strict()
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    path: ["to"],
    message: "To date cannot be earlier than from date",
  });

export const invoiceWorkbenchQuerySchema = z
  .object({
    status: invoiceWorkbenchStatusSchema.optional().default("all"),
  })
  .strict();

export const logoSchema = z
  .object({
    dataUrl: z
      .string()
      .min(20)
      .max(1_500_000)
      .regex(
        /^data:image\/(png|jpe?g|webp);base64,/i,
        "Logo must be a PNG, JPG, or WebP data URL",
      ),
  })
  .strict();

export type InvoicePayload = z.infer<typeof invoicePayloadSchema>;
export type InvoiceUpdatePayload = z.infer<typeof invoiceUpdatePayloadSchema>;
export type InvoiceQuery = z.infer<typeof invoiceQuerySchema>;
export type InvoiceWorkbenchQuery = z.infer<typeof invoiceWorkbenchQuerySchema>;
export type NextInvoiceNumberQuery = z.infer<
  typeof nextInvoiceNumberQuerySchema
>;
export type PresetPayload = z.infer<typeof presetSchema>;
