import type { RequestHandler } from "express";
import {
  cancelInvoice,
  createInvoice,
  createInvoiceDraft,
  deleteInvoiceDraft,
  exportInvoicesCsv,
  getInvoice,
  getInvoiceDraft,
  listInvoiceDrafts,
  listInvoices,
  listInvoiceWorkbench,
  peekInvoiceNumber,
  updateInvoice,
  updateInvoiceDraft,
} from "../services/invoiceService.js";
import { getPreset } from "../services/settingsService.js";
import {
  draftIdParamSchema,
  invoiceNumberParamSchema,
  invoicePayloadSchema,
  invoiceQuerySchema,
  invoiceWorkbenchQuerySchema,
  nextInvoiceNumberQuerySchema,
} from "../validation/invoiceSchemas.js";

export const nextInvoiceNumber: RequestHandler = async (req, res, next) => {
  try {
    const preset = await getPreset();
    const query = nextInvoiceNumberQuerySchema.parse(req.query);
    const prefix = query.prefix || preset.invoice_prefix || "INV";
    res.json({ invNo: await peekInvoiceNumber(prefix, query.invoiceDate) });
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

export const createInvoiceDraftRecord: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const payload = invoicePayloadSchema.parse(req.body);
    const draft = await createInvoiceDraft(payload);
    res.status(201).json(draft);
  } catch (error) {
    next(error);
  }
};

export const updateInvoiceDraftRecord: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const { draftId } = draftIdParamSchema.parse(req.params);
    const payload = invoicePayloadSchema.parse(req.body);
    res.json(await updateInvoiceDraft(draftId, payload));
  } catch (error) {
    next(error);
  }
};

export const listInvoiceDraftRecords: RequestHandler = async (
  _req,
  res,
  next,
) => {
  try {
    res.json(await listInvoiceDrafts());
  } catch (error) {
    next(error);
  }
};

export const getInvoiceDraftRecord: RequestHandler = async (req, res, next) => {
  try {
    const { draftId } = draftIdParamSchema.parse(req.params);
    res.json(await getInvoiceDraft(draftId));
  } catch (error) {
    next(error);
  }
};

export const deleteInvoiceDraftRecord: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const { draftId } = draftIdParamSchema.parse(req.params);
    await deleteInvoiceDraft(draftId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const updateInvoiceRecord: RequestHandler = async (req, res, next) => {
  try {
    const { invNo } = invoiceNumberParamSchema.parse(req.params);
    const payload = invoicePayloadSchema.parse(req.body);
    res.json(await updateInvoice(invNo, payload));
  } catch (error) {
    next(error);
  }
};

export const listInvoiceWorkbenchRecords: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const query = invoiceWorkbenchQuerySchema.parse(req.query);
    res.json(await listInvoiceWorkbench(query));
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
    const { invNo } = invoiceNumberParamSchema.parse(req.params);
    res.json(await getInvoice(invNo));
  } catch (error) {
    next(error);
  }
};

export const cancelInvoiceRecord: RequestHandler = async (req, res, next) => {
  try {
    const { invNo } = invoiceNumberParamSchema.parse(req.params);
    res.json(await cancelInvoice(invNo));
  } catch (error) {
    next(error);
  }
};

export const exportInvoiceRecords: RequestHandler = async (req, res, next) => {
  try {
    const query = invoiceQuerySchema.parse(req.query);
    const csv = await exportInvoicesCsv(query);
    res.header("Content-Type", "text/csv; charset=utf-8");
    res.attachment(
      `gst_invoices_export_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    res.send(csv);
  } catch (error) {
    next(error);
  }
};