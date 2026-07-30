import { ApiError } from "../middleware/errorHandler.js";
import { CounterModel } from "../models/Counter.js";
import { InvoiceModel } from "../models/Invoice.js";
import { SettingModel } from "../models/Setting.js";
import { calculateInvoiceTotals } from "../utils/calculateInvoice.js";
import { toCsv } from "../utils/csv.js";
import { todayLocalIso, toInvoiceMonth } from "../utils/date.js";
import type { InvoicePayload, InvoiceQuery } from "../validation/invoiceSchemas.js";
import { getPreset } from "./settingsService.js";

function buildInvoiceNo(prefix: string, month: string, sequence: number) {
  return `${prefix}-${month}-${String(sequence).padStart(4, "0")}`;
}

function counterScope(prefix: string, month: string) {
  return `${prefix}-${month}`;
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
  const presetSnapshot = await getPreset();
  const invDate = payload.invDate || todayLocalIso();
  const invNo = await consumeInvoiceNumber(presetSnapshot.invoice_prefix || "INV", invDate);
  const document = buildInvoiceDocument({ ...payload, invDate }, presetSnapshot);
  return InvoiceModel.create({ ...document, invNo, status: "active" });
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
      createdAt: invoice.createdAt
    }));
}

export async function getInvoice(invNo: string) {
  const invoice = await InvoiceModel.findOne({ invNo }).lean();
  if (!invoice) {
    throw new ApiError(404, "Invoice not found");
  }
  return invoice;
}

export async function cancelInvoice(invNo: string) {
  const invoice = await InvoiceModel.findOneAndUpdate(
    { invNo },
    { status: "cancelled", cancelledAt: new Date() },
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
    invoice.status
  ]);

  return toCsv(["Invoice No", "Date", "Payee", "CGST", "SGST", "IGST", "Net Amount", "Status"], rows);
}

export async function clearDatabase() {
  await Promise.all([InvoiceModel.deleteMany({}), SettingModel.deleteMany({}), CounterModel.deleteMany({})]);
}
