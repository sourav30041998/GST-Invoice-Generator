import { z } from "zod";

export const accountEmailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());

export const newPasswordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be no more than 128 characters")
  .refine(
    (value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value),
    "Password must include upper-case, lower-case, and numeric characters",
  );

const recoveryTokenSchema = z
  .string()
  .trim()
  .min(40)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid recovery token");

export const requestPasswordRecoverySchema = z
  .object({
    email: accountEmailSchema,
  })
  .strict();

export const verifyPasswordRecoveryOtpSchema = z
  .object({
    challengeToken: recoveryTokenSchema,
    otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit verification code"),
  })
  .strict();

export const completePasswordRecoverySchema = z
  .object({
    challengeToken: recoveryTokenSchema,
    resetToken: recoveryTokenSchema,
    newPassword: newPasswordSchema,
    confirmPassword: z.string().max(128),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.newPassword !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
  });

