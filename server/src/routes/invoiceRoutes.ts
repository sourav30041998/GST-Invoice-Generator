import { Router } from "express";
import {
  cancelInvoiceRecord,
  createInvoiceRecord,
  exportInvoiceRecords,
  getInvoiceRecord,
  listInvoiceRecords,
  nextInvoiceNumber,
  updateInvoiceRecord
} from "../controllers/invoiceController.js";

const router = Router();

router.get("/", listInvoiceRecords);
router.get("/next-number", nextInvoiceNumber);
router.get("/export.csv", exportInvoiceRecords);
router.post("/", createInvoiceRecord);
router.get("/:invNo", getInvoiceRecord);
router.put("/:invNo", updateInvoiceRecord);
router.patch("/:invNo/cancel", cancelInvoiceRecord);

export default router;
