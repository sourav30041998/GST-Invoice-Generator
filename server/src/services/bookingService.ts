import crypto from "node:crypto";
import mongoose, { type ClientSession, Types } from "mongoose";
import { env } from "../config/env.js";
import { ApiError } from "../middleware/errorHandler.js";
import { AuditLogModel } from "../models/AuditLog.js";
import { BookingModel } from "../models/Booking.js";
import { BookingNotificationModel } from "../models/BookingNotification.js";
import { BookingPaymentModel } from "../models/BookingPayment.js";
import { CounterModel } from "../models/Counter.js";
import { CustomerModel } from "../models/Customer.js";
import { RoomAllocationModel } from "../models/RoomAllocation.js";
import {
  minorUnitsToRupees,
  rupeesToMinorUnits,
} from "../utils/bookingRules.js";
import { ROOM_ALLOCATION_LOCK_STATUSES } from "../utils/roomRules.js";
import type {
  BookingListQuery,
  CreateBookingPayload,
  CreateBookingPaymentPayload,
  UpdateBookingPayload,
} from "../validation/bookingSchemas.js";
import {
  protectBookingData,
  protectPaymentData,
  revealBookingRecord,
  revealCustomerRecord,
  revealPaymentRecord,
} from "./customerProtectionService.js";
import type { TenantContext } from "./invoiceService.js";
import {
  releaseRoomNightLocks,
  replaceRoomNightLocks,
} from "./roomNightLockService.js";
import { resolveRoomSnapshots, type RoomSnapshot } from "./roomService.js";
import { getSettings } from "./settingsService.js";

type BookingStatus =
  "enquiry" | "pendingAdvance" | "confirmed" | "cancelled" | "completed";

const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  enquiry: ["enquiry", "pendingAdvance", "confirmed", "cancelled"],
  pendingAdvance: ["pendingAdvance", "confirmed", "cancelled"],
  confirmed: ["confirmed", "cancelled", "completed"],
  cancelled: ["cancelled"],
  completed: ["completed"],
};
const MAX_PAYMENT_ENTRIES_PER_BOOKING = 500;

type BookingDelivery = {
  emailSentAt: string | null;
  whatsappSentAt: string | null;
};

const EMPTY_BOOKING_DELIVERY: BookingDelivery = {
  emailSentAt: null,
  whatsappSentAt: null,
};

function monthPeriod(value = new Date()) {
  return `${String(value.getUTCFullYear()).slice(-2)}${String(
    value.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
}

async function consumeReferenceNumber(
  tenant: TenantContext,
  prefix: "BKG" | "REC",
  session: ClientSession,
) {
  const period = monthPeriod();
  const scope = `${tenant.organizationId}:${prefix}-${period}`;
  const row = await CounterModel.findOneAndUpdate(
    { organizationId: tenant.organizationId, scope },
    {
      $setOnInsert: {
        organizationId: tenant.organizationId,
        scope,
        prefix,
        period,
      },
      $inc: { sequence: 1 },
    },
    { upsert: true, new: true, session },
  ).lean();
  return `${prefix}-${period}-${String(row.sequence).padStart(4, "0")}`;
}

function idempotencyHash(organizationId: string, idempotencyKey: string) {
  return crypto
    .createHmac("sha256", env.DATA_ENCRYPTION_KEY_BYTES)
    .update(`booking-payment:v1:${organizationId}:${idempotencyKey}`)
    .digest("base64url");
}

function bookingIdempotencyHash(
  organizationId: string,
  idempotencyKey: string,
) {
  return crypto
    .createHmac("sha256", env.DATA_ENCRYPTION_KEY_BYTES)
    .update(`booking-create:v1:${organizationId}:${idempotencyKey}`)
    .digest("base64url");
}

async function writeBookingAudit(
  tenant: TenantContext,
  entityType: "booking" | "booking_payment",
  entityId: unknown,
  action: string,
  after: Record<string, unknown>,
  session: ClientSession,
) {
  await AuditLogModel.create(
    [
      {
        organizationId: tenant.organizationId,
        actorUserId: tenant.userId,
        entityType,
        entityId: String(entityId),
        action,
        before: null,
        after,
        createdBy: `user:${tenant.userId}`,
      },
    ],
    { session },
  );
}

function bookingResponse(
  record: Record<string, any>,
  organizationId: string,
  advanceReceivedMinor = 0,
  delivery: BookingDelivery = EMPTY_BOOKING_DELIVERY,
  includePrivateFields = true,
) {
  const revealed = revealBookingRecord(record, organizationId);
  const {
    organizationId: _organizationId,
    idempotencyKeyHash: _idempotencyKeyHash,
    estimatedTotalMinor: _estimatedTotalMinor,
    advanceBalanceMinor: _advanceBalanceMinor,
    protectedData: _protectedData,
    createdByUserId: _createdByUserId,
    updatedByUserId: _updatedByUserId,
    notes: _notes,
    termsSnapshot: _termsSnapshot,
    ...clientRecord
  } = revealed;
  return {
    ...clientRecord,
    _id: String(clientRecord._id),
    customerId: String(clientRecord.customerId),
    invoiceId: clientRecord.invoiceId ? String(clientRecord.invoiceId) : null,
    estimatedTotal: minorUnitsToRupees(_estimatedTotalMinor || 0),
    advanceReceived: minorUnitsToRupees(advanceReceivedMinor),
    requestedRooms: clientRecord.requestedRooms || [],
    delivery,
    ...(includePrivateFields
      ? { notes: _notes || "", termsSnapshot: _termsSnapshot || "" }
      : {}),
  };
}

async function bookingDeliveryById(
  organizationId: string,
  bookingIds: Types.ObjectId[],
) {
  if (!bookingIds.length) return new Map<string, BookingDelivery>();
  const rows = await BookingNotificationModel.aggregate<{
    _id: { bookingId: Types.ObjectId; channel: "email" | "whatsapp" };
    sentAt: Date;
  }>([
    {
      $match: {
        organizationId: new Types.ObjectId(organizationId),
        bookingId: { $in: bookingIds },
        status: "sent",
        kind: { $in: ["confirmation", "advanceReceipt"] },
      },
    },
    { $sort: { sentAt: -1, _id: -1 } },
    {
      $group: {
        _id: { bookingId: "$bookingId", channel: "$channel" },
        sentAt: { $first: "$sentAt" },
      },
    },
  ]);
  const deliveries = new Map<string, BookingDelivery>();
  for (const row of rows) {
    const bookingId = String(row._id.bookingId);
    const current = deliveries.get(bookingId) || { ...EMPTY_BOOKING_DELIVERY };
    if (row._id.channel === "email") {
      current.emailSentAt = row.sentAt.toISOString();
    } else {
      current.whatsappSentAt = row.sentAt.toISOString();
    }
    deliveries.set(bookingId, current);
  }
  return deliveries;
}

async function findBookingCreationByKey(
  tenant: TenantContext,
  keyHash: string,
  customerId: string,
) {
  const booking = await BookingModel.findOne({
    organizationId: tenant.organizationId,
    idempotencyKeyHash: keyHash,
  })
    .select("+protectedData")
    .lean();
  if (!booking) return null;
  if (String(booking.customerId) !== customerId) {
    throw new ApiError(409, "This booking request was already used");
  }
  const payment = await BookingPaymentModel.findOne({
    organizationId: tenant.organizationId,
    bookingId: booking._id,
  })
    .select("+protectedData")
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  return {
    booking: bookingResponse(
      booking,
      tenant.organizationId,
      booking.advanceBalanceMinor || 0,
    ),
    payment: payment ? paymentResponse(payment, tenant.organizationId) : null,
  };
}

function paymentResponse(record: Record<string, any>, organizationId: string) {
  const revealed = revealPaymentRecord(record, organizationId);
  const {
    organizationId: _organizationId,
    idempotencyKeyHash: _idempotencyKeyHash,
    amountMinor: _amountMinor,
    protectedData: _protectedData,
    createdByUserId: _createdByUserId,
    ...clientRecord
  } = revealed;
  return {
    ...clientRecord,
    _id: String(clientRecord._id),
    bookingId: String(clientRecord.bookingId),
    customerId: String(clientRecord.customerId),
    amount: minorUnitsToRupees(_amountMinor),
  };
}

async function netPaymentsByBooking(
  organizationId: string,
  bookingIds: Types.ObjectId[],
  session?: ClientSession,
) {
  if (!bookingIds.length) return new Map<string, number>();
  const aggregate = BookingPaymentModel.aggregate<{
    _id: Types.ObjectId;
    total: number;
  }>([
    {
      $match: {
        organizationId: new Types.ObjectId(organizationId),
        bookingId: { $in: bookingIds },
        status: "recorded",
      },
    },
    {
      $group: {
        _id: "$bookingId",
        total: {
          $sum: {
            $cond: [
              { $eq: ["$type", "refund"] },
              { $multiply: ["$amountMinor", -1] },
              "$amountMinor",
            ],
          },
        },
      },
    },
  ]);
  if (session) aggregate.session(session);
  const totals = await aggregate;
  return new Map(totals.map((item) => [String(item._id), item.total]));
}

async function bookingAdvanceBalance(
  organizationId: string,
  booking: { _id: Types.ObjectId; advanceBalanceMinor?: number },
  session: ClientSession,
) {
  if (Number.isSafeInteger(booking.advanceBalanceMinor)) {
    return booking.advanceBalanceMinor || 0;
  }
  const totals = await netPaymentsByBooking(
    organizationId,
    [booking._id],
    session,
  );
  return totals.get(String(booking._id)) || 0;
}

async function assertCustomerActive(
  tenant: TenantContext,
  customerId: string,
  session?: ClientSession,
) {
  const query = CustomerModel.exists({
    _id: customerId,
    organizationId: tenant.organizationId,
    status: "active",
  });
  if (session) query.session(session);
  if (!(await query)) {
    throw new ApiError(422, "Select an active customer from this organization");
  }
}

async function assertLegacyAllocationAvailability(
  tenant: TenantContext,
  roomIds: string[],
  checkinDate: string,
  checkoutDate: string,
  session: ClientSession,
  excludeInvoiceId?: string,
) {
  if (!roomIds.length) return;
  const conflict = await RoomAllocationModel.findOne({
    organizationId: tenant.organizationId,
    roomId: { $in: roomIds },
    status: { $in: ROOM_ALLOCATION_LOCK_STATUSES },
    checkinDate: { $lt: checkoutDate },
    checkoutDate: { $gt: checkinDate },
    ...(excludeInvoiceId ? { invoiceId: { $ne: excludeInvoiceId } } : {}),
  })
    .select("roomNumberSnapshot checkinDate checkoutDate")
    .session(session)
    .lean();
  if (conflict) {
    throw new ApiError(
      409,
      `${conflict.roomNumberSnapshot} is already assigned from ${conflict.checkinDate} to ${conflict.checkoutDate}.`,
    );
  }
}

async function createPaymentDocument(
  tenant: TenantContext,
  input: {
    bookingId: Types.ObjectId;
    customerId: Types.ObjectId;
    type: "advance" | "refund";
    amount: number;
    method: "cash" | "card" | "upi" | "bankTransfer" | "other";
    reference: string;
    notes: string;
    receivedAt?: string;
    idempotencyKey: string;
  },
  session: ClientSession,
) {
  const receiptNumber = await consumeReferenceNumber(tenant, "REC", session);
  const [payment] = await BookingPaymentModel.create(
    [
      {
        organizationId: tenant.organizationId,
        bookingId: input.bookingId,
        customerId: input.customerId,
        receiptNumber,
        type: input.type,
        amountMinor: rupeesToMinorUnits(input.amount),
        method: input.method,
        receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
        idempotencyKeyHash: idempotencyHash(
          tenant.organizationId,
          input.idempotencyKey,
        ),
        protectedData: protectPaymentData(tenant.organizationId, {
          reference: input.reference,
          notes: input.notes,
        }),
        createdByUserId: tenant.userId,
      },
    ],
    { session },
  );
  await writeBookingAudit(
    tenant,
    "booking_payment",
    payment._id,
    "record",
    {
      bookingId: String(input.bookingId),
      receiptNumber,
      type: input.type,
      method: input.method,
    },
    session,
  );
  return payment;
}

export async function createBooking(
  tenant: TenantContext,
  payload: CreateBookingPayload,
) {
  const keyHash = bookingIdempotencyHash(
    tenant.organizationId,
    payload.idempotencyKey,
  );
  const existing = await findBookingCreationByKey(
    tenant,
    keyHash,
    payload.customerId,
  );
  if (existing) return existing;

  const session = await mongoose.startSession();
  try {
    let response: unknown;
    await session.withTransaction(async () => {
      await assertCustomerActive(tenant, payload.customerId, session);
      const bookingStatus =
        payload.status === "enquiry" && payload.initialPayment
          ? "pendingAdvance"
          : payload.status;
      const rooms = payload.roomIds.length
        ? await resolveRoomSnapshots(tenant, payload.roomIds, session)
        : [];
      if (payload.status === "confirmed") {
        await assertLegacyAllocationAvailability(
          tenant,
          payload.roomIds,
          payload.checkinDate,
          payload.checkoutDate,
          session,
        );
      }
      const confirmationNumber = await consumeReferenceNumber(
        tenant,
        "BKG",
        session,
      );
      const [booking] = await BookingModel.create(
        [
          {
            organizationId: tenant.organizationId,
            customerId: payload.customerId,
            confirmationNumber,
            idempotencyKeyHash: keyHash,
            checkinDate: payload.checkinDate,
            checkoutDate: payload.checkoutDate,
            rooms,
            guestCount: payload.guestCount,
            estimatedTotalMinor: rupeesToMinorUnits(payload.estimatedTotal),
            advanceBalanceMinor: payload.initialPayment
              ? rupeesToMinorUnits(payload.initialPayment.amount)
              : 0,
            status: bookingStatus,
            protectedData: protectBookingData(tenant.organizationId, {
              notes: payload.notes,
              termsSnapshot: payload.terms,
              requestedRooms: payload.requestedRooms,
            }),
            createdByUserId: tenant.userId,
            updatedByUserId: tenant.userId,
          },
        ],
        { session },
      );

      await replaceRoomNightLocks(
        {
          organizationId: tenant.organizationId,
          sourceType: "booking",
          sourceId: String(booking._id),
          sourceLabel: confirmationNumber,
          roomIds: rooms.map((room) => room.roomId),
          checkinDate: payload.checkinDate,
          checkoutDate: payload.checkoutDate,
          active: bookingStatus === "confirmed",
        },
        session,
      );

      let payment = null;
      if (payload.initialPayment) {
        payment = await createPaymentDocument(
          tenant,
          {
            bookingId: booking._id,
            customerId: booking.customerId,
            type: "advance",
            ...payload.initialPayment,
          },
          session,
        );
      }
      await writeBookingAudit(
        tenant,
        "booking",
        booking._id,
        "create",
        {
          customerId: payload.customerId,
          confirmationNumber,
          status: bookingStatus,
          roomCount: rooms.length,
        },
        session,
      );
      const plainBooking = {
        ...booking.toObject(),
        protectedData: booking.protectedData,
      };
      response = {
        booking: bookingResponse(
          plainBooking,
          tenant.organizationId,
          payment?.amountMinor || 0,
        ),
        payment: payment
          ? paymentResponse(
              { ...payment.toObject(), protectedData: payment.protectedData },
              tenant.organizationId,
            )
          : null,
      };
    });
    if (!response) throw new ApiError(500, "Booking creation did not complete");
    return response;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const duplicate = await findBookingCreationByKey(
        tenant,
        keyHash,
        payload.customerId,
      );
      if (duplicate) return duplicate;
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function listBookings(
  tenant: TenantContext,
  query: BookingListQuery,
) {
  const filter: Record<string, unknown> = {
    organizationId: tenant.organizationId,
  };
  if (query.customerId) filter.customerId = query.customerId;
  if (query.status) filter.status = query.status;
  const summaryFilter: Record<string, unknown> = {
    organizationId: tenant.organizationId,
    ...(query.customerId ? { customerId: query.customerId } : {}),
  };
  const [totalItems, summaryTotal, openItems, confirmedItems] =
    await Promise.all([
      BookingModel.countDocuments(filter),
      BookingModel.countDocuments(summaryFilter),
      BookingModel.countDocuments({
        ...summaryFilter,
        status: { $in: ["enquiry", "pendingAdvance", "confirmed"] },
      }),
      BookingModel.countDocuments({ ...summaryFilter, status: "confirmed" }),
    ]);
  const totalPages = Math.max(1, Math.ceil(totalItems / query.pageSize));
  const page = Math.min(query.page, totalPages);
  const bookings = await BookingModel.find(filter)
    .select("+protectedData")
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * query.pageSize)
    .limit(query.pageSize)
    .lean();
  const bookingIds = bookings.map((booking) => booking._id);
  const [totals, deliveries] = await Promise.all([
    netPaymentsByBooking(tenant.organizationId, bookingIds),
    bookingDeliveryById(tenant.organizationId, bookingIds),
  ]);
  return {
    items: bookings.map((booking) =>
      bookingResponse(
        booking,
        tenant.organizationId,
        totals.get(String(booking._id)) || 0,
        deliveries.get(String(booking._id)),
        false,
      ),
    ),
    pagination: {
      page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
    summary: {
      total: summaryTotal,
      open: openItems,
      confirmed: confirmedItems,
    },
  };
}

export async function getBooking(tenant: TenantContext, bookingId: string) {
  const booking = await BookingModel.findOne({
    _id: bookingId,
    organizationId: tenant.organizationId,
  })
    .select("+protectedData")
    .lean();
  if (!booking) throw new ApiError(404, "Booking not found");
  const [totals, deliveries] = await Promise.all([
    netPaymentsByBooking(tenant.organizationId, [booking._id]),
    bookingDeliveryById(tenant.organizationId, [booking._id]),
  ]);
  return bookingResponse(
    booking,
    tenant.organizationId,
    totals.get(String(booking._id)) || 0,
    deliveries.get(String(booking._id)),
  );
}

export async function updateBooking(
  tenant: TenantContext,
  bookingId: string,
  payload: UpdateBookingPayload,
) {
  const session = await mongoose.startSession();
  try {
    let response: unknown;
    await session.withTransaction(async () => {
      const booking = await BookingModel.findOne({
        _id: bookingId,
        organizationId: tenant.organizationId,
      })
        .select("+protectedData")
        .session(session);
      if (!booking) throw new ApiError(404, "Booking not found");
      if (booking.version !== payload.version) {
        throw new ApiError(
          409,
          "This booking changed elsewhere. Reload it before saving again.",
        );
      }
      if (booking.invoiceId) {
        throw new ApiError(
          409,
          "This booking is linked to an invoice and must be managed from the invoice.",
        );
      }
      const currentStatus = booking.status as BookingStatus;
      if (!BOOKING_TRANSITIONS[currentStatus].includes(payload.status)) {
        throw new ApiError(
          422,
          `Booking cannot move from ${currentStatus} to ${payload.status}.`,
        );
      }
      const rooms = payload.roomIds.length
        ? await resolveRoomSnapshots(tenant, payload.roomIds, session)
        : [];
      const advanceReceivedMinor = await bookingAdvanceBalance(
        tenant.organizationId,
        booking,
        session,
      );
      const estimatedTotalMinor = rupeesToMinorUnits(payload.estimatedTotal);
      if (
        estimatedTotalMinor > 0 &&
        advanceReceivedMinor > estimatedTotalMinor
      ) {
        throw new ApiError(
          422,
          "Estimated booking total cannot be lower than the recorded advance",
        );
      }
      if (payload.status === "confirmed") {
        if (advanceReceivedMinor <= 0) {
          throw new ApiError(
            422,
            "Record an advance payment before confirming this booking",
          );
        }
        await assertLegacyAllocationAvailability(
          tenant,
          payload.roomIds,
          payload.checkinDate,
          payload.checkoutDate,
          session,
        );
      }

      booking.checkinDate = payload.checkinDate;
      booking.checkoutDate = payload.checkoutDate;
      booking.rooms = rooms.map((room) => ({
        roomId: new Types.ObjectId(room.roomId),
        roomNumber: room.roomNumber,
        roomType: room.roomType,
      })) as typeof booking.rooms;
      booking.guestCount = payload.guestCount;
      booking.estimatedTotalMinor = estimatedTotalMinor;
      booking.advanceBalanceMinor = advanceReceivedMinor;
      booking.status = payload.status;
      booking.protectedData = protectBookingData(tenant.organizationId, {
        notes: payload.notes,
        termsSnapshot: payload.terms,
        requestedRooms: payload.requestedRooms,
      });
      booking.updatedByUserId = new Types.ObjectId(tenant.userId);
      await booking.save({ session });
      await replaceRoomNightLocks(
        {
          organizationId: tenant.organizationId,
          sourceType: "booking",
          sourceId: String(booking._id),
          sourceLabel: booking.confirmationNumber,
          roomIds: payload.roomIds,
          checkinDate: payload.checkinDate,
          checkoutDate: payload.checkoutDate,
          active: payload.status === "confirmed",
        },
        session,
      );
      await writeBookingAudit(
        tenant,
        "booking",
        booking._id,
        "update",
        { status: booking.status, roomCount: rooms.length },
        session,
      );
      response = bookingResponse(
        { ...booking.toObject(), protectedData: booking.protectedData },
        tenant.organizationId,
        advanceReceivedMinor,
      );
    });
    if (!response) throw new ApiError(500, "Booking update did not complete");
    return response;
  } finally {
    await session.endSession();
  }
}

export async function recordBookingPayment(
  tenant: TenantContext,
  bookingId: string,
  payload: CreateBookingPaymentPayload,
) {
  const hash = idempotencyHash(tenant.organizationId, payload.idempotencyKey);
  const existing = await BookingPaymentModel.findOne({
    organizationId: tenant.organizationId,
    idempotencyKeyHash: hash,
  })
    .select("+protectedData")
    .lean();
  if (existing) {
    if (String(existing.bookingId) !== bookingId) {
      throw new ApiError(409, "This payment request was already used");
    }
    return paymentResponse(existing, tenant.organizationId);
  }

  const session = await mongoose.startSession();
  try {
    let response: unknown;
    await session.withTransaction(async () => {
      const booking = await BookingModel.findOne({
        _id: bookingId,
        organizationId: tenant.organizationId,
      }).session(session);
      if (!booking) throw new ApiError(404, "Booking not found");
      if (["cancelled", "completed"].includes(booking.status)) {
        throw new ApiError(409, "Payments cannot be added to a closed booking");
      }
      const paymentEntryCount = await BookingPaymentModel.countDocuments({
        organizationId: tenant.organizationId,
        bookingId: booking._id,
      }).session(session);
      if (paymentEntryCount >= MAX_PAYMENT_ENTRIES_PER_BOOKING) {
        throw new ApiError(
          422,
          "This booking has reached the payment-ledger entry limit",
        );
      }
      const previousStatus = booking.status;
      const currentAdvance = await bookingAdvanceBalance(
        tenant.organizationId,
        booking,
        session,
      );
      const amountMinor = rupeesToMinorUnits(payload.amount);
      const nextAdvance =
        currentAdvance +
        (payload.type === "refund" ? -amountMinor : amountMinor);
      if (nextAdvance < 0) {
        throw new ApiError(422, "Refund cannot exceed the recorded advance");
      }
      if (
        booking.estimatedTotalMinor > 0 &&
        nextAdvance > booking.estimatedTotalMinor
      ) {
        throw new ApiError(
          422,
          "Recorded advance cannot exceed the estimated booking total",
        );
      }
      if (payload.confirmBooking) {
        if (payload.type !== "advance") {
          throw new ApiError(422, "A refund cannot confirm a booking");
        }
        await assertLegacyAllocationAvailability(
          tenant,
          booking.rooms.map((room) => String(room.roomId)),
          booking.checkinDate,
          booking.checkoutDate,
          session,
        );
        booking.status = "confirmed";
        await replaceRoomNightLocks(
          {
            organizationId: tenant.organizationId,
            sourceType: "booking",
            sourceId: String(booking._id),
            sourceLabel: booking.confirmationNumber,
            roomIds: booking.rooms.map((room) => String(room.roomId)),
            checkinDate: booking.checkinDate,
            checkoutDate: booking.checkoutDate,
            active: true,
          },
          session,
        );
      }
      if (
        !payload.confirmBooking &&
        payload.type === "advance" &&
        booking.status === "enquiry"
      ) {
        booking.status = "pendingAdvance";
      }
      booking.advanceBalanceMinor = nextAdvance;
      booking.updatedByUserId = new Types.ObjectId(tenant.userId);
      await booking.save({ session });
      const payment = await createPaymentDocument(
        tenant,
        {
          bookingId: booking._id,
          customerId: booking.customerId,
          ...payload,
        },
        session,
      );
      if (booking.status !== previousStatus) {
        await writeBookingAudit(
          tenant,
          "booking",
          booking._id,
          "payment_status_transition",
          {
            from: previousStatus,
            to: booking.status,
            paymentId: String(payment._id),
          },
          session,
        );
      }
      response = paymentResponse(
        { ...payment.toObject(), protectedData: payment.protectedData },
        tenant.organizationId,
      );
    });
    if (!response)
      throw new ApiError(500, "Payment recording did not complete");
    return response;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const duplicate = await BookingPaymentModel.findOne({
        organizationId: tenant.organizationId,
        idempotencyKeyHash: hash,
      })
        .select("+protectedData")
        .lean();
      if (duplicate && String(duplicate.bookingId) === bookingId) {
        return paymentResponse(duplicate, tenant.organizationId);
      }
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function listBookingPayments(
  tenant: TenantContext,
  bookingId: string,
) {
  const booking = await BookingModel.exists({
    _id: bookingId,
    organizationId: tenant.organizationId,
  });
  if (!booking) throw new ApiError(404, "Booking not found");
  const payments = await BookingPaymentModel.find({
    organizationId: tenant.organizationId,
    bookingId,
  })
    .select("+protectedData")
    .sort({ receivedAt: -1, _id: -1 })
    .limit(MAX_PAYMENT_ENTRIES_PER_BOOKING)
    .lean();
  return payments.map((payment) =>
    paymentResponse(payment, tenant.organizationId),
  );
}

export async function getBookingReceipt(
  tenant: TenantContext,
  bookingId: string,
  paymentId: string,
) {
  const [booking, payment] = await Promise.all([
    getBooking(tenant, bookingId),
    BookingPaymentModel.findOne({
      _id: paymentId,
      organizationId: tenant.organizationId,
      bookingId,
    })
      .select("+protectedData")
      .lean(),
  ]);
  if (!payment) throw new ApiError(404, "Payment receipt not found");
  const customer = await CustomerModel.findOne({
    _id: booking.customerId,
    organizationId: tenant.organizationId,
  })
    .select("+protectedData")
    .lean();
  if (!customer) throw new ApiError(404, "Customer not found");
  const revealedCustomer = revealCustomerRecord(
    customer,
    tenant.organizationId,
  );
  const settings = await getSettings(tenant.organizationId);
  return {
    booking,
    payment: paymentResponse(payment, tenant.organizationId),
    customer: {
      _id: String(customer._id),
      name: revealedCustomer.name,
      phone: revealedCustomer.phone,
      email: revealedCustomer.email,
    },
    business: settings.preset,
    logoDataUrl: settings.logoDataUrl,
  };
}

export async function prepareBookingForInvoice(
  tenant: TenantContext,
  input: {
    bookingId: string;
    customerId: string;
    checkinDate: string;
    checkoutDate: string;
    rooms: RoomSnapshot[];
  },
  session: ClientSession,
) {
  const booking = await BookingModel.findOne({
    _id: input.bookingId,
    organizationId: tenant.organizationId,
  }).session(session);
  if (!booking) throw new ApiError(422, "Selected booking was not found");
  if (String(booking.customerId) !== input.customerId) {
    throw new ApiError(
      422,
      "Selected booking does not belong to this customer",
    );
  }
  if (booking.status !== "confirmed") {
    throw new ApiError(
      422,
      "Only a confirmed booking can be linked to an invoice",
    );
  }
  if (booking.invoiceId) {
    throw new ApiError(409, "This booking is already linked to an invoice");
  }
  if (
    booking.checkinDate !== input.checkinDate ||
    booking.checkoutDate !== input.checkoutDate
  ) {
    throw new ApiError(
      422,
      "Invoice stay dates must match the selected booking",
    );
  }
  const bookingRoomIds = booking.rooms
    .map((room) => String(room.roomId))
    .sort();
  const invoiceRoomIds = input.rooms.map((room) => room.roomId).sort();
  if (
    bookingRoomIds.length > 0 &&
    bookingRoomIds.join(",") !== invoiceRoomIds.join(",")
  ) {
    throw new ApiError(422, "Invoice rooms must match the selected booking");
  }
  if (!bookingRoomIds.length) {
    booking.rooms = input.rooms.map((room) => ({
      roomId: new Types.ObjectId(room.roomId),
      roomNumber: room.roomNumber,
      roomType: room.roomType,
    })) as typeof booking.rooms;
    booking.updatedByUserId = new Types.ObjectId(tenant.userId);
    await booking.save({ session });
  }
  await releaseRoomNightLocks(
    tenant.organizationId,
    "booking",
    input.bookingId,
    session,
  );
  return booking;
}

export async function linkBookingToInvoice(
  tenant: TenantContext,
  bookingId: string,
  invoiceId: string,
  invoiceNumber: string,
  workflowStatus: "reserved" | "checkedIn" | "checkedOut",
  session: ClientSession,
) {
  await BookingModel.updateOne(
    { _id: bookingId, organizationId: tenant.organizationId },
    {
      $set: {
        invoiceId,
        invoiceNumber,
        status: workflowStatus === "checkedOut" ? "completed" : "confirmed",
        updatedByUserId: tenant.userId,
      },
    },
    { session },
  );
}

export async function syncLinkedBookingStatus(
  tenant: TenantContext,
  bookingId: string | undefined,
  workflowStatus: "reserved" | "checkedIn" | "checkedOut" | "cancelled",
  session: ClientSession,
) {
  if (!bookingId) return;
  await BookingModel.updateOne(
    { _id: bookingId, organizationId: tenant.organizationId },
    {
      $set: {
        status:
          workflowStatus === "checkedOut"
            ? "completed"
            : workflowStatus === "cancelled"
              ? "cancelled"
              : "confirmed",
        updatedByUserId: tenant.userId,
      },
    },
    { session },
  );
}
