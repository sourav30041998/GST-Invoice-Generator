import { Types } from "mongoose";
import { ApiError } from "../middleware/errorHandler.js";
import { CounterModel } from "../models/Counter.js";
import { InvoiceModel } from "../models/Invoice.js";
import { InvoiceDraftModel } from "../models/InvoiceDraft.js";
import { SettingModel } from "../models/Setting.js";
import { calculateInvoiceTotals } from "../utils/calculateInvoice.js";
import { toCsv } from "../utils/csv.js";
import { todayLocalIso, toInvoiceMonth } from "../utils/date.js";
import type { InvoicePayload, InvoiceQuery } from "../validation/invoiceSchemas.js";
import { getPreset } from "./settingsService.js";

type PersistedWorkflowStatus = "draft" | "checkedIn" | "checkedOut" | "cancelled";

function buildInvoiceNo(prefix: string, month: string, sequence: number) {
  return `${prefix}-${month}-${String(sequence).padStart(4, "0")}`;
}

function counterScope(prefix: string, month: string) {
  return `${prefix}-${month}`;
}

function defaultWorkflowStatus(invoice: { status?: string; workflowStatus?: string }): PersistedWorkflowStatus {
  if (invoice.workflowStatus === "draft" || invoice.workflowStatus === "checkedIn" || invoice.workflowStatus === "checkedOut" || invoice.workflowStatus === "cancelled") {
    return invoice.workflowStatus;
  }

  return invoice.status === "cancelled" ? "cancelled" : "checkedOut";
}

function ensureObjectId(id: string, label = "Draft") {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(404, `${label} not found`);
  }
}

export async function peekInvoiceNumber(prefix: string, invoiceDate?: string) {
  const safePrefix = prefix.toUpperCase();
  const month = toInvoiceMonth(invoiceDate);
  const row = await CounterModel.findOne({ scope: counterScope(safePrefix, month) }).lean();
  return buildInvoiceNo(safePrefix, month, (row?.sequence || 0) + 1);
}

async function consumeInvoiceNumber(prefix: string, invoiceDate?: string) {
  const safePrefix = prefix.toUpperCase();
  const month = toInvoiceMonth(invoiceDate);
  const row = await CounterModel.findOneAndUpdate(
    { scope: counterScope(safePrefix, month) },
    { $inc: { sequence: 1 } },
    { upsert: true, new: true }
  ).lean();
  return buildInvoiceNo(safePrefix, month, row.sequence);
}

function buildInvoiceDocument(payload: InvoicePayload, presetSnapshot: Record<string, unknown>) {
  const totals = calculateInvoiceTotals(payload.lineItems, payload.adjustments);

  return {
    ...payload,
    ...totals,
    presetSnapshot
  };
}

export async function createInvoice(payload: InvoicePayload) {
  if (payload.workflowStatus === "draft") {
    throw new ApiError(422, "Use the draft endpoint to save draft invoices");
  }

  const presetSnapshot = await getPreset();
  const invDate = payload.invDate || todayLocalIso();
  const invNo = await consumeInvoiceNumber(presetSnapshot.invoice_prefix || "INV", invDate);
  const document = buildInvoiceDocument({ ...payload, invDate }, presetSnapshot);
  return InvoiceModel.create({ ...document, invNo, status: "active" });
}

export async function createInvoiceDraft(payload: InvoicePayload) {
  const presetSnapshot = await getPreset();
  const invDate = payload.invDate || todayLocalIso();
  const document = buildInvoiceDocument({ ...payload, invDate, workflowStatus: "draft" }, presetSnapshot);
  return InvoiceDraftModel.create(document);
}

export async function updateInvoiceDraft(draftId: string, payload: InvoicePayload) {
  ensureObjectId(draftId);
  const draft = await InvoiceDraftModel.findById(draftId);

  if (!draft) {
    throw new ApiError(404, "Draft not found");
  }

  const presetSnapshot = draft.presetSnapshot as Record<string, unknown>;
  const invDate = payload.invDate || draft.invDate || todayLocalIso();

  if (payload.workflowStatus === "draft") {
    const document = buildInvoiceDocument({ ...payload, invDate, workflowStatus: "draft" }, presetSnapshot);
    Object.assign(draft, document);
    await draft.save();
    return draft;
  }

  const invNo = await consumeInvoiceNumber(String(presetSnapshot.invoice_prefix || "INV"), invDate);
  const document = buildInvoiceDocument({ ...payload, invDate }, presetSnapshot);
  const invoice = await InvoiceModel.create({ ...document, invNo, status: "active" });
  await InvoiceDraftModel.deleteOne({ _id: draft._id });
  return invoice;
}

export async function listInvoiceDrafts() {
  const drafts = await InvoiceDraftModel.find({}).sort({ createdAt: -1 }).lean();
  return drafts.map((draft) => ({
    _id: draft._id,
    invDate: draft.invDate,
    partyName: draft.partyName,
    netTotal: draft.netTotal,
    totalCGST: draft.totalCGST,
    totalSGST: draft.totalSGST,
    totalIGST: draft.totalIGST,
    items: draft.lineItems.length,
    status: "active",
    workflowStatus: "draft" as const,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt
  }));
}

export async function getInvoiceDraft(draftId: string) {
  ensureObjectId(draftId);
  const draft = await InvoiceDraftModel.findById(draftId).lean();
  if (!draft) {
    throw new ApiError(404, "Draft not found");
  }
  return draft;
}

export async function deleteInvoiceDraft(draftId: string) {
  ensureObjectId(draftId);
  const result = await InvoiceDraftModel.deleteOne({ _id: draftId });
  if (!result.deletedCount) {
    throw new ApiError(404, "Draft not found");
  }
}

export async function updateInvoice(invNo: string, payload: InvoicePayload) {
  const invoice = await InvoiceModel.findOne({ invNo });
  if (!invoice) {
    throw new ApiError(404, "Invoice not found");
  }
  if (invoice.status === "cancelled") {
    throw new ApiError(409, "Cancelled invoices cannot be edited");
  }

  const document = buildInvoiceDocument(
    { ...payload, invDate: invoice.invDate },
    invoice.presetSnapshot as Record<string, unknown>
  );
  Object.assign(invoice, document);
  await invoice.save();
  return invoice;
}

function invoiceFilters(query: InvoiceQuery) {
  const filters: Record<string, unknown> = {};
  if (query.from || query.to) {
    filters.invDate = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {})
    };
  }
  if (query.status) {
    filters.status = query.status;
  }
  if (query.workflowStatus) {
    filters.workflowStatus = query.workflowStatus;
  }
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filters.$or = [{ invNo: new RegExp(escaped, "i") }, { partyName: new RegExp(escaped, "i") }];
  }
  return filters;
}

function matchesGstFilter(invoice: { totalCGST?: number; totalSGST?: number; totalIGST?: number }, gst?: string) {
  if (!gst) {
    return true;
  }
  const hasGst = (invoice.totalCGST || 0) + (invoice.totalSGST || 0) + (invoice.totalIGST || 0) > 0;
  return gst === "yes" ? hasGst : !hasGst;
}

export async function listInvoices(query: InvoiceQuery) {
  const invoices = await InvoiceModel.find(invoiceFilters(query)).sort({ createdAt: -1 }).lean();
  return invoices
    .filter((invoice) => matchesGstFilter(invoice, query.gst))
    .map((invoice) => ({
      invNo: invoice.invNo,
      invDate: invoice.invDate,
      partyName: invoice.partyName,
      netTotal: invoice.netTotal,
      totalCGST: invoice.totalCGST,
      totalSGST: invoice.totalSGST,
      totalIGST: invoice.totalIGST,
      items: invoice.lineItems.length,
      status: invoice.status,
      workflowStatus: defaultWorkflowStatus(invoice),
      createdAt: invoice.createdAt
    }));
}

export async function getInvoice(invNo: string) {
  const invoice = await InvoiceModel.findOne({ invNo }).lean();
  if (!invoice) {
    throw new ApiError(404, "Invoice not found");
  }
  return { ...invoice, workflowStatus: defaultWorkflowStatus(invoice) };
}

export async function cancelInvoice(invNo: string) {
  const invoice = await InvoiceModel.findOneAndUpdate(
    { invNo },
    { status: "cancelled", workflowStatus: "cancelled", cancelledAt: new Date() },
    { new: true }
  );
  if (!invoice) {
    throw new ApiError(404, "Invoice not found");
  }
  return invoice;
}

export async function exportInvoicesCsv(query: InvoiceQuery) {
  const invoices = await InvoiceModel.find(invoiceFilters({ ...query, status: query.status || "active" }))
    .sort({ invDate: -1 })
    .lean();
  const rows = invoices.filter((invoice) => matchesGstFilter(invoice, query.gst)).map((invoice) => [
    invoice.invNo,
    invoice.invDate,
    invoice.partyName,
    invoice.totalCGST.toFixed(2),
    invoice.totalSGST.toFixed(2),
    invoice.totalIGST.toFixed(2),
    invoice.netTotal.toFixed(2),
    invoice.status,
    defaultWorkflowStatus(invoice)
  ]);

  return toCsv(["Invoice No", "Date", "Payee", "CGST", "SGST", "IGST", "Net Amount", "Status", "Workflow Status"], rows);
}

export async function clearDatabase() {
  await Promise.all([InvoiceModel.deleteMany({}), InvoiceDraftModel.deleteMany({}), SettingModel.deleteMany({}), CounterModel.deleteMany({})]);
}