import { z } from "zod";

const taxRateSchema = z.coerce
  .number()
  .finite()
  .min(0, "Tax rates cannot be negative")
  .max(100, "Tax rates cannot exceed 100%");

export const taxPresetSchema = z
  .object({
    key: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1, "Preset name is required").max(80),
    hsn: z
      .string()
      .trim()
      .max(16)
      .regex(/^[A-Z0-9/-]*$/i, "HSN/SAC contains unsupported characters"),
    cgstRate: taxRateSchema,
    sgstRate: taxRateSchema,
    igstRate: taxRateSchema,
    allowInclusive: z.boolean(),
    note: z.string().trim().max(240),
  })
  .strict()
  .superRefine((preset, context) => {
    const hasCentralOrStateTax = preset.cgstRate > 0 || preset.sgstRate > 0;
    if (hasCentralOrStateTax && preset.cgstRate !== preset.sgstRate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sgstRate"],
        message: "CGST and SGST must be equal",
      });
    }
    if (hasCentralOrStateTax && preset.igstRate > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["igstRate"],
        message: "Use either CGST/SGST or IGST for a preset",
      });
    }
  });

export const taxPresetPreferencesSchema = z
  .array(taxPresetSchema)
  .min(1, "At least one GST preset is required")
  .max(20, "A maximum of 20 GST presets is allowed")
  .superRefine((presets, context) => {
    const keys = new Set<string>();
    presets.forEach((preset, index) => {
      const normalizedKey = preset.key.toLowerCase();
      if (
        normalizedKey === "custom" ||
        preset.label.trim().toLowerCase() === "custom"
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "label"],
          message:
            "Custom is invoice-only and cannot be saved as a company preset",
        });
      }
      if (keys.has(normalizedKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "key"],
          message: "GST preset keys must be unique",
        });
      }
      keys.add(normalizedKey);
    });
  });

export const taxPresetPreferencesPayloadSchema = z
  .object({
    taxPresets: taxPresetPreferencesSchema,
  })
  .strict();

export type TaxPresetPreferences = z.infer<typeof taxPresetPreferencesSchema>;
