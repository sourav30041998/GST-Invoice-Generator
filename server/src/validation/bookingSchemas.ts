import { z } from "zod";
import { MAX_INVOICE_AMOUNT } from "../utils/calculateInvoice.js";
import { bookingStayDates } from "../utils/bookingRules.js";
import { customerIdSchema } from "./customerSchemas.js";
import { roomIdSchema } from "./roomSchemas.js";

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

const moneySchema = (label: string) =>
  z.coerce
    .number()
    .finite()
    .min(0, `${label} cannot be negative`)
    .max(MAX_INVOICE_AMOUNT, `${label} exceeds the supported limit`)
    .refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8,
      `${label} can have at most two decimal places`,
    );

const paymentMethodSchema = z.enum([
  "cash",
  "card",
  "upi",
  "bankTransfer",
  "other",
]);

const initialPaymentSchema = z
  .object({
    amount: moneySchema("Advance amount").refine(
      (value) => value > 0,
      "Advance amount must be greater than zero",
    ),
    method: paymentMethodSchema,
    reference: z.string().trim().max(160).optional().default(""),
    notes: z.string().trim().max(500).optional().default(""),
    receivedAt: z.string().datetime({ offset: true }).optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

const requestedRoomSchema = z
  .object({
    roomType: z.string().trim().max(80).optional().default(""),
    bedsPerRoom: z.coerce.number().int().min(1).max(50),
    quantity: z.coerce.number().int().min(1).max(20),
  })
  .strict();

export const bookingIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{24}$/i, "Booking not found");

export const paymentIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{24}$/i, "Payment receipt not found");

const bookingFieldsSchema = z.object({
  idempotencyKey: z.string().uuid(),
  customerId: customerIdSchema,
  checkinDate: isoDateSchema,
  checkoutDate: isoDateSchema,
  roomIds: z.array(roomIdSchema).max(20).optional().default([]),
  requestedRooms: z.array(requestedRoomSchema).max(12).optional().default([]),
  guestCount: z.coerce.number().int().min(1).max(100).optional().default(1),
  estimatedTotal: moneySchema("Estimated total").optional().default(0),
  status: z
    .enum(["enquiry", "pendingAdvance", "confirmed"])
    .optional()
    .default("enquiry"),
  notes: z.string().trim().max(1000).optional().default(""),
  terms: z.string().trim().min(1, "Booking terms are required").max(3000),
  initialPayment: initialPaymentSchema.optional(),
});

type BookingValidationShape = {
  checkinDate: string;
  checkoutDate: string;
  roomIds: string[];
  requestedRooms: Array<z.infer<typeof requestedRoomSchema>>;
  guestCount: number;
  estimatedTotal: number;
  status:
    "enquiry" | "pendingAdvance" | "confirmed" | "cancelled" | "completed";
  initialPayment?: z.infer<typeof initialPaymentSchema>;
};

function validateBooking(
  booking: BookingValidationShape,
  context: z.RefinementCtx,
  requireInitialPayment = false,
) {
  try {
    bookingStayDates(booking.checkinDate, booking.checkoutDate);
  } catch (error) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["checkoutDate"],
      message: error instanceof Error ? error.message : "Invalid stay dates",
    });
  }
  if (new Set(booking.roomIds).size !== booking.roomIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["roomIds"],
      message: "A room can only be selected once",
    });
  }
  if (booking.status === "confirmed" && !booking.requestedRooms.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["requestedRooms"],
      message: "Add at least one requested room combination",
    });
  }
  const requestedRoomCount = booking.requestedRooms.reduce(
    (total, request) => total + request.quantity,
    0,
  );
  if (requestedRoomCount > 20) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["requestedRooms"],
      message: "A booking can request at most 20 rooms",
    });
  }
  const requestedCapacity = booking.requestedRooms.reduce(
    (total, request) => total + request.quantity * request.bedsPerRoom,
    0,
  );
  if (booking.requestedRooms.length && requestedCapacity < booking.guestCount) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["requestedRooms"],
      message: "Accommodation capacity must cover the expected occupancy",
    });
  }
  const requestKeys = booking.requestedRooms.map(
    (request) =>
      `${request.roomType.trim().toLowerCase()}:${request.bedsPerRoom}`,
  );
  if (new Set(requestKeys).size !== requestKeys.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["requestedRooms"],
      message: "Combine matching room requests by increasing their quantity",
    });
  }
  if (
    requireInitialPayment &&
    booking.status === "confirmed" &&
    !booking.initialPayment
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["initialPayment"],
      message: "Record an advance payment before confirming this booking",
    });
  }
  if (
    booking.initialPayment &&
    booking.estimatedTotal > 0 &&
    booking.initialPayment.amount > booking.estimatedTotal
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["initialPayment", "amount"],
      message: "Advance amount cannot exceed the estimated booking total",
    });
  }
}

export const createBookingSchema = bookingFieldsSchema
  .strict()
  .superRefine((booking, context) => validateBooking(booking, context, true));

export const updateBookingSchema = z
  .object({
    checkinDate: isoDateSchema,
    checkoutDate: isoDateSchema,
    roomIds: z.array(roomIdSchema).max(20),
    requestedRooms: z.array(requestedRoomSchema).max(12),
    guestCount: z.coerce.number().int().min(1).max(100),
    estimatedTotal: moneySchema("Estimated total"),
    status: z.enum([
      "enquiry",
      "pendingAdvance",
      "confirmed",
      "cancelled",
      "completed",
    ]),
    notes: z.string().trim().max(1000),
    terms: z.string().trim().min(1, "Booking terms are required").max(3000),
    version: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict()
  .superRefine((booking, context) => {
    validateBooking(booking, context);
  });

export const createBookingPaymentSchema = z
  .object({
    type: z.enum(["advance", "refund"]).optional().default("advance"),
    amount: moneySchema("Payment amount").refine(
      (value) => value > 0,
      "Payment amount must be greater than zero",
    ),
    method: paymentMethodSchema,
    reference: z.string().trim().max(160).optional().default(""),
    notes: z.string().trim().max(500).optional().default(""),
    receivedAt: z.string().datetime({ offset: true }).optional(),
    idempotencyKey: z.string().uuid(),
    confirmBooking: z.boolean().optional().default(false),
  })
  .strict();

export const bookingNotificationSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    kind: z.enum(["confirmation", "advanceReceipt", "cancellation"]),
    channels: z
      .array(z.enum(["email", "whatsapp"]))
      .min(1)
      .max(2)
      .refine((channels) => new Set(channels).size === channels.length),
    paymentId: paymentIdSchema.optional(),
    allowResend: z.boolean().optional().default(false),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === "advanceReceipt" && !value.paymentId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paymentId"],
        message: "Select a payment receipt to send",
      });
    }
  });

export const bookingListQuerySchema = z
  .object({
    customerId: customerIdSchema.optional(),
    status: z
      .enum([
        "",
        "enquiry",
        "pendingAdvance",
        "confirmed",
        "cancelled",
        "completed",
      ])
      .optional()
      .default(""),
    page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
  })
  .strict();

export type CreateBookingPayload = z.infer<typeof createBookingSchema>;
export type UpdateBookingPayload = z.infer<typeof updateBookingSchema>;
export type CreateBookingPaymentPayload = z.infer<
  typeof createBookingPaymentSchema
>;
export type BookingNotificationPayload = z.infer<
  typeof bookingNotificationSchema
>;
export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;
