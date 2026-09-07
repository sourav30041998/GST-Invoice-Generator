import { z } from "zod";
import { normalizeCustomerPhone } from "../utils/customerRules.js";

function isValidPhone(value: string) {
  try {
    normalizeCustomerPhone(value);
    return true;
  } catch {
    return false;
  }
}

export const customerIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{24}$/i, "Customer not found");

export const customerPhoneSchema = z
  .string()
  .trim()
  .min(8)
  .max(24)
  .refine(
    isValidPhone,
    "Enter a valid phone number with country code, or a 10-digit Indian mobile number",
  )
  .transform(normalizeCustomerPhone);

const customerFieldsSchema = z.object({
  name: z.string().trim().min(2, "Customer name is required").max(160),
  phone: customerPhoneSchema,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address")
    .max(254)
    .or(z.literal(""))
    .optional()
    .default(""),
  address: z.string().trim().max(500).optional().default(""),
  state: z.string().trim().max(120).optional().default(""),
  notes: z.string().trim().max(1000).optional().default(""),
  whatsappOptIn: z.boolean().optional().default(false),
});

export const createCustomerSchema = customerFieldsSchema.strict();

export const updateCustomerSchema = customerFieldsSchema
  .partial()
  .extend({
    version: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== "version"),
    "Provide at least one customer field to update",
  );

export const customerListQuerySchema = z
  .object({
    search: z.string().trim().max(80).optional().default(""),
    status: z.enum(["active", "inactive", "all"]).optional().default("active"),
    page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
  })
  .strict();

export const customerLookupQuerySchema = z
  .object({ phone: customerPhoneSchema })
  .strict();

export const customerRevisionSchema = z
  .object({
    version: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export type CreateCustomerPayload = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerPayload = z.infer<typeof updateCustomerSchema>;
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
