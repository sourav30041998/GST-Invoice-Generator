import type { RequestHandler, Response } from "express";
import { getAuthContext } from "../middleware/auth.js";
import {
  createBooking,
  getBooking,
  getBookingReceipt,
  listBookingPayments,
  listBookings,
  recordBookingPayment,
  updateBooking,
} from "../services/bookingService.js";
import { sendBookingNotifications } from "../services/bookingNotificationService.js";
import type { TenantContext } from "../services/invoiceService.js";
import {
  bookingIdSchema,
  bookingListQuerySchema,
  bookingNotificationSchema,
  createBookingPaymentSchema,
  createBookingSchema,
  paymentIdSchema,
  updateBookingSchema,
} from "../validation/bookingSchemas.js";

function tenantContext(res: Response): TenantContext {
  const context = getAuthContext(res);
  return {
    organizationId: context.organizationId,
    userId: context.userId,
    userEmail: context.email,
  };
}

export const listBookingRecords: RequestHandler = async (req, res, next) => {
  try {
    res.json(
      await listBookings(
        tenantContext(res),
        bookingListQuerySchema.parse(req.query),
      ),
    );
  } catch (error) {
    next(error);
  }
};

export const getBookingRecord: RequestHandler = async (req, res, next) => {
  try {
    res.json(
      await getBooking(
        tenantContext(res),
        bookingIdSchema.parse(req.params.bookingId),
      ),
    );
  } catch (error) {
    next(error);
  }
};

export const createBookingRecord: RequestHandler = async (req, res, next) => {
  try {
    res
      .status(201)
      .json(
        await createBooking(
          tenantContext(res),
          createBookingSchema.parse(req.body),
        ),
      );
  } catch (error) {
    next(error);
  }
};

export const updateBookingRecord: RequestHandler = async (req, res, next) => {
  try {
    res.json(
      await updateBooking(
        tenantContext(res),
        bookingIdSchema.parse(req.params.bookingId),
        updateBookingSchema.parse(req.body),
      ),
    );
  } catch (error) {
    next(error);
  }
};

export const listBookingPaymentRecords: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    res.json(
      await listBookingPayments(
        tenantContext(res),
        bookingIdSchema.parse(req.params.bookingId),
      ),
    );
  } catch (error) {
    next(error);
  }
};

export const createBookingPaymentRecord: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    res
      .status(201)
      .json(
        await recordBookingPayment(
          tenantContext(res),
          bookingIdSchema.parse(req.params.bookingId),
          createBookingPaymentSchema.parse(req.body),
        ),
      );
  } catch (error) {
    next(error);
  }
};

export const getBookingReceiptRecord: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    res.json(
      await getBookingReceipt(
        tenantContext(res),
        bookingIdSchema.parse(req.params.bookingId),
        paymentIdSchema.parse(req.params.paymentId),
      ),
    );
  } catch (error) {
    next(error);
  }
};

export const sendBookingNotificationRecords: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    res.json(
      await sendBookingNotifications(
        tenantContext(res),
        bookingIdSchema.parse(req.params.bookingId),
        bookingNotificationSchema.parse(req.body),
      ),
    );
  } catch (error) {
    next(error);
  }
};
