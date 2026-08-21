import type { RequestHandler, Response } from "express";
import { getAuthContext } from "../middleware/auth.js";
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
  type TenantContext,
  updateInvoice,
  updateInvoiceDraft,
} from "../services/invoiceService.js";
import { getPreset } from "../services/settingsService.js";
import {
  draftIdParamSchema,
  draftInvoicePayloadSchema,
  invoiceNumberParamSchema,
  invoicePayloadSchema,
  invoiceQuerySchema,
  invoiceUpdatePayloadSchema,
  invoiceWorkbenchQuerySchema,
  nextInvoiceNumberQuerySchema,
  revisionSchema,
} from "../validation/invoiceSchemas.js";

function tenantContext(res: Response): TenantContext {
  const context = getAuthContext(res);
  return {
    organizationId: context.organizationId,
    userId: context.userId,
    userEmail: context.email,
  };
}

export const nextInvoiceNumber: RequestHandler = async (req, res, next) => {
  try {
    const tenant = tenantContext(res);
    const preset = await getPreset(tenant.organizationId);
    const query = nextInvoiceNumberQuerySchema.parse(req.query);
    const prefix = query.prefix || preset.invoice_prefix || "INV";
    res.json({
      invNo: await peekInvoiceNumber(tenant, prefix, query.invoiceDate),
    });
  } catch (error) {
    next(error);
  }
};

export const createInvoiceRecord: RequestHandler = async (req, res, next) => {
  try {
    const payload = invoicePayloadSchema.parse(req.body);
    res.status(201).json(await createInvoice(tenantContext(res), payload));
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
    const payload = draftInvoicePayloadSchema.parse(req.body);
    res.status(201).json(await createInvoiceDraft(tenantContext(res), payload));
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
    const payload = invoiceUpdatePayloadSchema.parse(req.body);
    res.json(await updateInvoiceDraft(tenantContext(res), draftId, payload));
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
    res.json(await listInvoiceDrafts(tenantContext(res)));
  } catch (error) {
    next(error);
  }
};

export const getInvoiceDraftRecord: RequestHandler = async (req, res, next) => {
  try {
    const { draftId } = draftIdParamSchema.parse(req.params);
    res.json(await getInvoiceDraft(tenantContext(res), draftId));
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
    const { version } = revisionSchema.parse(req.body);
    await deleteInvoiceDraft(tenantContext(res), draftId, version);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const updateInvoiceRecord: RequestHandler = async (req, res, next) => {
  try {
    const { invNo } = invoiceNumberParamSchema.parse(req.params);
    const payload = invoiceUpdatePayloadSchema.parse(req.body);
    res.json(await updateInvoice(tenantContext(res), invNo, payload));
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
    res.json(await listInvoiceWorkbench(tenantContext(res), query));
  } catch (error) {
    next(error);
  }
};

export const listInvoiceRecords: RequestHandler = async (req, res, next) => {
  try {
    const query = invoiceQuerySchema.parse(req.query);
    res.json(await listInvoices(tenantContext(res), query));
  } catch (error) {
    next(error);
  }
};

export const getInvoiceRecord: RequestHandler = async (req, res, next) => {
  try {
    const { invNo } = invoiceNumberParamSchema.parse(req.params);
    res.json(await getInvoice(tenantContext(res), invNo));
  } catch (error) {
    next(error);
  }
};

export const cancelInvoiceRecord: RequestHandler = async (req, res, next) => {
  try {
    const { invNo } = invoiceNumberParamSchema.parse(req.params);
    const { version } = revisionSchema.parse(req.body);
    res.json(await cancelInvoice(tenantContext(res), invNo, version));
  } catch (error) {
    next(error);
  }
};

export const exportInvoiceRecords: RequestHandler = async (req, res, next) => {
  try {
    const query = invoiceQuerySchema.parse(req.query);
    const csv = await exportInvoicesCsv(tenantContext(res), query);
    res.header("Content-Type", "text/csv; charset=utf-8");
    res.attachment(
      `gst_invoices_export_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    res.send(csv);
  } catch (error) {
    next(error);
  }
};
