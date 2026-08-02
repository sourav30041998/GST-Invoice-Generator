import { Router } from "express";
import {
  cancelInvoiceRecord,
  createInvoiceDraftRecord,
  createInvoiceRecord,
  deleteInvoiceDraftRecord,
  exportInvoiceRecords,
  getInvoiceDraftRecord,
  getInvoiceRecord,
  listInvoiceDraftRecords,
  listInvoiceRecords,
  listInvoiceWorkbenchRecords,
  nextInvoiceNumber,
  updateInvoiceDraftRecord,
  updateInvoiceRecord,
} from "../controllers/invoiceController.js";

const router = Router();

router.get("/", listInvoiceRecords);
router.get("/next-number", nextInvoiceNumber);
router.get("/export.csv", exportInvoiceRecords);
router.get("/workbench", listInvoiceWorkbenchRecords);
router.get("/drafts", listInvoiceDraftRecords);
router.post("/drafts", createInvoiceDraftRecord);
router.get("/drafts/:draftId", getInvoiceDraftRecord);
router.put("/drafts/:draftId", updateInvoiceDraftRecord);
router.delete("/drafts/:draftId", deleteInvoiceDraftRecord);
router.post("/", createInvoiceRecord);
router.get("/:invNo", getInvoiceRecord);
router.put("/:invNo", updateInvoiceRecord);
router.patch("/:invNo/cancel", cancelInvoiceRecord);

export default router;
