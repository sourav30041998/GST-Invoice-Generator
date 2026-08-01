import { z } from "zod";
<<<<<<< HEAD
export const invoiceWorkflowStatusSchema = z.enum(["draft", "checkedIn", "checkedOut"]);
export const invoiceWorkflowQueryStatusSchema = z.enum(["", "draft", "checkedIn", "checkedOut", "cancelled"]);
=======
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
>>>>>>> codex/backend-api-data

export const presetSchema = z.object({
  business_name: z.string().trim().min(1).max(120),
  tagline: z.string().trim().max(160).optional().default(""),
  gstin: z.string().trim().max(32).optional().default(""),
  address_line1: z.string().trim().max(180).optional().default(""),
  address_line2: z.string().trim().max(180).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  fax: z.string().trim().max(80).optional().default(""),
  upi: z.string().trim().max(120).optional().default(""),
  website: z.string().trim().max(120).optional().default(""),
  email: z.string().trim().email().or(z.literal("")).optional().default(""),
  bank_acc_name: z.string().trim().max(160).optional().default(""),
  invoice_prefix: z
    .string()
    .trim()
    .min(2)
    .max(8)
    .regex(/^[A-Z0-9]+$/i, "Use only letters and numbers")
    .transform((value) => value.toUpperCase()),
  bank_name: z.string().trim().max(160).optional().default(""),
  bank_account: z.string().trim().max(40).optional().default(""),
  bank_ifsc: z.string().trim().max(20).optional().default(""),
<<<<<<< HEAD
  terms: z.string().trim().max(700).optional().default("")
=======
  terms: z.string().trim().max(700).optional().default(""),
>>>>>>> codex/backend-api-data
});

export const lineItemSchema = z.object({
  presetKey: z.string().trim().max(80).optional().default("Custom"),
  description: z.string().trim().max(240).optional().default(""),
  hsn: z.string().trim().max(16).optional().default(""),
  date: z.string().trim().max(20).optional().default(""),
  units: z.coerce.number().min(0).max(100000),
  rate: z.coerce.number().min(0).max(100000000),
  cgstRate: z.coerce.number().min(0).max(100).optional().default(0),
  sgstRate: z.coerce.number().min(0).max(100).optional().default(0),
  igstRate: z.coerce.number().min(0).max(100).optional().default(0),
<<<<<<< HEAD
  taxInclusive: z.coerce.boolean().optional().default(false)
=======
  taxInclusive: z.coerce.boolean().optional().default(false),
>>>>>>> codex/backend-api-data
});

export const adjustmentSchema = z.object({
  desc: z.string().trim().max(180).optional().default(""),
  amount: z.coerce.number().min(0).max(100000000),
<<<<<<< HEAD
  type: z.enum(["add", "deduct"]).optional().default("add")
=======
  type: z.enum(["add", "deduct"]).optional().default("add"),
>>>>>>> codex/backend-api-data
});

export const invoicePayloadSchema = z.object({
  invDate: z.string().trim().min(1).max(20),
  checkinDate: z.string().trim().min(1, "Arrival is required").max(20),
  checkoutDate: z.string().trim().min(1, "Departure is required").max(20),
  confirmNo: z.string().trim().max(80).optional().default(""),
  partyName: z.string().trim().min(1, "Payee name is required").max(160),
  partyGSTIN: z.string().trim().max(32).optional().default(""),
  partyAddress: z.string().trim().min(1, "Address is required").max(500),
  partyState: z.string().trim().min(1, "State is required").max(120),
  groupName: z.string().trim().max(160).optional().default(""),
  roomNo: z.string().trim().min(1, "Room no. is required").max(80),
  workflowStatus: invoiceWorkflowStatusSchema.optional().default("checkedOut"),
  lineItems: z.array(lineItemSchema).min(1),
<<<<<<< HEAD
  adjustments: z.array(adjustmentSchema).optional().default([])
=======
  adjustments: z.array(adjustmentSchema).optional().default([]),
>>>>>>> codex/backend-api-data
});

export const invoiceQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  gst: z.enum(["", "yes", "no"]).optional().default(""),
  status: z.enum(["", "active", "cancelled"]).optional().default(""),
  workflowStatus: invoiceWorkflowQueryStatusSchema.optional().default(""),
<<<<<<< HEAD
  search: z.string().trim().optional().default("")
=======
  search: z.string().trim().optional().default(""),
});

export const invoiceWorkbenchQuerySchema = z.object({
  status: invoiceWorkbenchStatusSchema.optional().default("all"),
>>>>>>> codex/backend-api-data
});

export const logoSchema = z.object({
  dataUrl: z
    .string()
    .min(20)
    .max(5_000_000)
<<<<<<< HEAD
    .regex(/^data:image\/(png|jpe?g|webp);base64,/i, "Logo must be a PNG, JPG, or WebP data URL")
=======
    .regex(
      /^data:image\/(png|jpe?g|webp);base64,/i,
      "Logo must be a PNG, JPG, or WebP data URL",
    ),
>>>>>>> codex/backend-api-data
});

export type InvoicePayload = z.infer<typeof invoicePayloadSchema>;
export type InvoiceQuery = z.infer<typeof invoiceQuerySchema>;
<<<<<<< HEAD
=======
export type InvoiceWorkbenchQuery = z.infer<typeof invoiceWorkbenchQuerySchema>;
>>>>>>> codex/backend-api-data
export type PresetPayload = z.infer<typeof presetSchema>;
