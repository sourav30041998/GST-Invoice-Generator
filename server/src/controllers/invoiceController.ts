import type { RequestHandler } from "express";
import {
  cancelInvoice,
  createInvoice,
  exportInvoicesCsv,
  getInvoice,
  listInvoices,
  peekInvoiceNumber,
  updateInvoice
} from "../services/invoiceService.js";
import { getPreset } from "../services/settingsService.js";
import { invoicePayloadSchema, invoiceQuerySchema } from "../validation/invoiceSchemas.js";

export const nextInvoiceNumber: RequestHandler = async (req, res, next) => {
  try {
    const preset = await getPreset();
    const prefix = String(req.query.prefix || preset.invoice_prefix || "INV");
    const invoiceDate = typeof req.query.invoiceDate === "string" ? req.query.invoiceDate : undefined;
    res.json({ invNo: await peekInvoiceNumber(prefix, invoiceDate) });
  } catch (error) {
    next(error);
  }
};

export const createInvoiceRecord: RequestHandler = async (req, res, next) => {
  try {
    const payload = invoicePayloadSchema.parse(req.body);
    const invoice = await createInvoice(payload);
    res.status(201).json(invoice);
  } catch (error) {
    next(error);
  }
};

export const updateInvoiceRecord: RequestHandler = async (req, res, next) => {
  try {
    const payload = invoicePayloadSchema.parse(req.body);
    res.json(await updateInvoice(req.params.invNo, payload));
  } catch (error) {
    next(error);
  }
};

export const listInvoiceRecords: RequestHandler = async (req, res, next) => {
  try {
    const query = invoiceQuerySchema.parse(req.query);
    res.json(await listInvoices(query));
  } catch (error) {
    next(error);
  }
};

export const getInvoiceRecord: RequestHandler = async (req, res, next) => {
  try {
    res.json(await getInvoice(req.params.invNo));
  } catch (error) {
    next(error);
  }
};

export const cancelInvoiceRecord: RequestHandler = async (req, res, next) => {
  try {
    res.json(await cancelInvoice(req.params.invNo));
  } catch (error) {
    next(error);
  }
};

export const exportInvoiceRecords: RequestHandler = async (req, res, next) => {
  try {
    const query = invoiceQuerySchema.parse(req.query);
    const csv = await exportInvoicesCsv(query);
    res.header("Content-Type", "text/csv; charset=utf-8");
    res.attachment(`gst_invoices_export_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
};
