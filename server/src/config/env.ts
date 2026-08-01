import dotenv from "dotenv";
<<<<<<< HEAD
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5050),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/gst_invoice_generator"),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173")
=======
import path from "node:path";
import { z } from "zod";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(5050),
  MONGODB_URI: z
    .string()
    .min(1)
    .default("mongodb://127.0.0.1:27017/gst_invoice_generator"),
  MONGODB_DB_NAME: z.string().trim().min(1).default("gst_invoice_generator"),
  MONGODB_IP_FAMILY: z.coerce
    .number()
    .int()
    .refine((value) => value === 4 || value === 6)
    .optional(),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
>>>>>>> codex/backend-api-data
});

export const env = envSchema.parse(process.env);
