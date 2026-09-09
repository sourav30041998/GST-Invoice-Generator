import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  createBookingPaymentRecord,
  createBookingRecord,
  getBookingReceiptRecord,
  getBookingRecord,
  listBookingPaymentRecords,
  listBookingRecords,
  sendBookingNotificationRecords,
  updateBookingRecord,
} from "../controllers/bookingController.js";

const router = Router();
const notificationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many notification requests. Try again later." },
});

router.get("/", listBookingRecords);
router.post("/", createBookingRecord);
router.get("/:bookingId", getBookingRecord);
router.patch("/:bookingId", updateBookingRecord);
router.get("/:bookingId/payments", listBookingPaymentRecords);
router.post("/:bookingId/payments", createBookingPaymentRecord);
router.get(
  "/:bookingId/payments/:paymentId/receipt",
  getBookingReceiptRecord,
);
router.post(
  "/:bookingId/notifications",
  notificationRateLimit,
  sendBookingNotificationRecords,
);

export default router;
