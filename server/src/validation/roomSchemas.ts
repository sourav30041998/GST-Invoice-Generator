import { z } from "zod";
import {
  isValidStayRange,
  normalizeRoomNumber,
  ROOM_NUMBER_PATTERN,
} from "../utils/roomRules.js";

const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format");

export const roomIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{24}$/i, "Room not found");

const optionalRoomText = (max: number) =>
  z.string().trim().max(max).optional().default("");

export const roomNumberSchema = z
  .string()
  .trim()
  .min(1, "Room name is required")
  .max(40)
  .regex(
    ROOM_NUMBER_PATTERN,
    "Use letters, numbers, spaces, hyphens, and slashes only",
  )
  .transform((value) => value.replace(/\s+/g, " "));

const roomFieldsSchema = z.object({
  roomNumber: roomNumberSchema,
  roomType: optionalRoomText(80),
  floor: optionalRoomText(40),
  wing: optionalRoomText(40),
  capacity: z.coerce.number().int().min(1).max(50).optional().default(1),
});

export const createRoomSchema = roomFieldsSchema.strict();

export const updateRoomSchema = roomFieldsSchema
  .partial()
  .extend({
    isActive: z.boolean().optional(),
    version: z.coerce.number().int().min(0),
  })
  .strict();

export const roomListQuerySchema = z
  .object({
    status: z.enum(["active", "inactive", "all"]).optional().default("all"),
    search: z.string().trim().max(80).optional().default(""),
  })
  .strict();

export const roomAvailabilityQuerySchema = z
  .object({
    checkinDate: isoDateSchema,
    checkoutDate: isoDateSchema,
    excludeInvoiceId: roomIdSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!isValidStayRange(value.checkinDate, value.checkoutDate)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checkoutDate"],
        message: "Departure must be after arrival",
      });
    }
  });

export const roomBookingBoardQuerySchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!isValidStayRange(value.from, value.to)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "End date must be after start date",
      });
      return;
    }

    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    const days =
      (Date.parse(`${value.to}T00:00:00.000Z`) -
        Date.parse(`${value.from}T00:00:00.000Z`)) /
      millisecondsPerDay;
    if (!Number.isFinite(days) || days > 31) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "Booking board range cannot exceed 31 days",
      });
    }
  });

export const roomAllocationHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  })
  .strict();

export const selectedRoomSchema = z.object({ roomId: roomIdSchema }).strict();

export function normalizedRoomNumber(value: string) {
  return normalizeRoomNumber(value);
}

export type CreateRoomPayload = z.infer<typeof createRoomSchema>;
export type UpdateRoomPayload = z.infer<typeof updateRoomSchema>;
export type RoomListQuery = z.infer<typeof roomListQuerySchema>;
export type RoomAvailabilityQuery = z.infer<typeof roomAvailabilityQuerySchema>;
export type RoomBookingBoardQuery = z.infer<typeof roomBookingBoardQuerySchema>;
export type RoomAllocationHistoryQuery = z.infer<
  typeof roomAllocationHistoryQuerySchema
>;
