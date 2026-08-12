import { z } from "zod";

const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format");

const shortText = (max: number) => z.string().trim().max(max);
const optionalText = (max: number, fallback = "") =>
  shortText(max).optional().default(fallback);

export const invoiceWorkflowStatusSchema = z.enum([
  "draft",
  "checkedIn",
  "checkedOut",
]);
export const invoiceWorkflowQueryStatusSchema = z.enum([
  "",
  "draft",
  "checkedIn",
  "checkedOut",
  "cancelled",
]);
export const invoiceWorkbenchStatusSchema = z.enum([
  "all",
  "draft",
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
    hsn: optionalText(16),
    date: z.string().trim().max(20).optional().default(""),
    units: z.coerce.number().min(0).max(100000),
    rate: z.coerce.number().min(0).max(100000000),
    cgstRate: z.coerce.number().min(0).max(100).optional().default(0),
    sgstRate: z.coerce.number().min(0).max(100).optional().default(0),
    igstRate: z.coerce.number().min(0).max(100).optional().default(0),
    taxInclusive: z.coerce.boolean().optional().default(false),
  })
  .strict();

export const adjustmentSchema = z
  .object({
    desc: optionalText(180),
    amount: z.coerce.number().min(0).max(100000000),
    type: z.enum(["add", "deduct"]).optional().default("add"),
  })
  .strict();

export const invoicePayloadSchema = z
  .object({
    invDate: isoDateSchema,
    checkinDate: isoDateSchema.refine(Boolean, "Arrival is required"),
    checkoutDate: isoDateSchema.refine(Boolean, "Departure is required"),
    confirmNo: optionalText(80),
    partyName: shortText(160).min(1, "Payee name is required"),
    partyGSTIN: optionalText(32),
    partyAddress: shortText(500).min(1, "Address is required"),
    partyState: shortText(120).min(1, "State is required"),
    groupName: optionalText(160),
    roomNo: shortText(80).min(1, "Room no. is required"),
    workflowStatus: invoiceWorkflowStatusSchema
      .optional()
      .default("checkedOut"),
    lineItems: z.array(lineItemSchema).min(1).max(100),
    adjustments: z.array(adjustmentSchema).max(50).optional().default([]),
  })
  .strict();

export const invoiceQuerySchema = z
  .object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    gst: z.enum(["", "yes", "no"]).optional().default(""),
    status: z.enum(["", "active", "cancelled"]).optional().default(""),
    workflowStatus: invoiceWorkflowQueryStatusSchema.optional().default(""),
    search: z.string().trim().max(120).optional().default(""),
  })
  .strict();

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
export type InvoiceQuery = z.infer<typeof invoiceQuerySchema>;
export type InvoiceWorkbenchQuery = z.infer<typeof invoiceWorkbenchQuerySchema>;
export type NextInvoiceNumberQuery = z.infer<
  typeof nextInvoiceNumberQuerySchema
>;
export type PresetPayload = z.infer<typeof presetSchema>;
