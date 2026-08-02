import { Types } from "mongoose";
import { ApiError } from "../middleware/errorHandler.js";
import { AuditLogModel } from "../models/AuditLog.js";
import { BusinessProfileModel } from "../models/BusinessProfile.js";
import { CounterModel } from "../models/Counter.js";
import { InvoiceModel } from "../models/Invoice.js";
import { InvoiceDraftModel } from "../models/InvoiceDraft.js";
import { SettingModel } from "../models/Setting.js";
import { calculateInvoiceTotals } from "../utils/calculateInvoice.js";
import { toCsv } from "../utils/csv.js";
import { todayLocalIso, toInvoiceMonth } from "../utils/date.js";
import type {
  InvoicePayload,
  InvoiceQuery,
  InvoiceWorkbenchQuery,
} from "../validation/invoiceSchemas.js";
import { getBusinessProfileSnapshot } from "./settingsService.js";

type PersistedWorkflowStatus =
  "draft" | "checkedIn" | "checkedOut" | "cancelled";
type InvoiceWorkbenchStatus = "all" | PersistedWorkflowStatus;

type PresetSnapshot = {
  invoice_prefix?: string;
  [key: string]: unknown;
};

type SnapshotSource = {
  businessProfileId?: unknown;
  presetSnapshot?: PresetSnapshot;
  businessSnapshot?: unknown;
};

type ResolvedSnapshots = {
  businessProfileId?: unknown;
  presetSnapshot: PresetSnapshot;
  businessSnapshot: unknown;
};

type WorkbenchDate = string | Date;

type DraftWorkbenchSource = {
  _id: unknown;
  createdAt?: WorkbenchDate;
};

type InvoiceWorkbenchSource = {
  invNo: string;
  invDate: string;
  status?: string;
  workflowStatus?: string;
  createdAt?: WorkbenchDate;
};

type AuditDocument = {
  toObject?: () => unknown;
};

function buildInvoiceNo(prefix: string, month: string, sequence: number) {
  return `${prefix}-${month}-${String(sequence).padStart(4, "0")}`;
}

function counterScope(prefix: string, month: string) {
  return `${prefix}-${month}`;
}

function defaultWorkflowStatus(invoice: {
  status?: string;
  workflowStatus?: string;
}): PersistedWorkflowStatus {
  if (
    invoice.workflowStatus === "draft" ||
    invoice.workflowStatus === "checkedIn" ||
    invoice.workflowStatus === "checkedOut" ||
    invoice.workflowStatus === "cancelled"
  ) {
    return invoice.workflowStatus;
  }

  return invoice.status === "cancelled" ? "cancelled" : "checkedOut";
}

function ensureObjectId(id: string, label = "Draft") {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(404, `${label} not found`);
  }
}

function toPlainDocument(document: AuditDocument | null | undefined) {
  return document?.toObject ? document.toObject() : document;
}

async function writeAuditLog(
  entityType: string,
  entityId: unknown,
  action: string,
  before: unknown,
  after: unknown,
) {
  await AuditLogModel.create({
    entityType,
    entityId: String(entityId),
    action,
    before,
    after,
    createdBy: "system",
  }).catch(() => undefined);
}

export async function peekInvoiceNumber(prefix: string, invoiceDate?: string) {
  const safePrefix = prefix.toUpperCase();
  const month = toInvoiceMonth(invoiceDate);
  const row = await CounterModel.findOne({
    scope: counterScope(safePrefix, month),
  }).lean();
  return buildInvoiceNo(safePrefix, month, (row?.sequence || 0) + 1);
}

async function consumeInvoiceNumber(prefix: string, invoiceDate?: string) {
  const safePrefix = prefix.toUpperCase();
  const month = toInvoiceMonth(invoiceDate);
  const scope = counterScope(safePrefix, month);
  const row = await CounterModel.findOneAndUpdate(
    { scope },
    {
      $setOnInsert: { scope, prefix: safePrefix, period: month },
      $inc: { sequence: 1 },
    },
    { upsert: true, new: true },
  ).lean();
  const sequence = row.sequence;

  return {
    invNo: buildInvoiceNo(safePrefix, month, sequence),
    invoicePrefix: safePrefix,
    invoiceMonth: month,
    sequenceNo: sequence,
  };
}

async function resolveSnapshots(
  source?: SnapshotSource,
): Promise<ResolvedSnapshots> {
  if (source?.presetSnapshot && source.businessSnapshot) {
    return {
      businessProfileId: source.businessProfileId,
      presetSnapshot: source.presetSnapshot,
      businessSnapshot: source.businessSnapshot,
    };
  }

  return getBusinessProfileSnapshot();
}

function buildInvoiceDocument(
  payload: InvoicePayload,
  snapshots: ResolvedSnapshots,
) {
  const totals = calculateInvoiceTotals(payload.lineItems, payload.adjustments);

  return {
    ...payload,
    ...totals,
    businessProfileId: snapshots.businessProfileId,
    presetSnapshot: snapshots.presetSnapshot,
    businessSnapshot: snapshots.businessSnapshot,
  };
}

export async function createInvoice(payload: InvoicePayload) {
  if (payload.workflowStatus === "draft") {
    throw new ApiError(422, "Use the draft endpoint to save draft invoices");
  }

  const snapshots = await getBusinessProfileSnapshot();
  const invDate = payload.invDate || todayLocalIso();
  const numbering = await consumeInvoiceNumber(
    snapshots.presetSnapshot.invoice_prefix || "INV",
    invDate,
  );
  const document = buildInvoiceDocument({ ...payload, invDate }, snapshots);
  const invoice = await InvoiceModel.create({
    ...document,
    ...numbering,
    status: "active",
    recordStatus: "active",
  });
  await writeAuditLog(
    "invoice",
    invoice._id,
    "create",
    null,
    toPlainDocument(invoice),
  );
  return invoice;
}

export async function createInvoiceDraft(payload: InvoicePayload) {
  const snapshots = await getBusinessProfileSnapshot();
  const invDate = payload.invDate || todayLocalIso();
  const document = buildInvoiceDocument(
    { ...payload, invDate, workflowStatus: "draft" },
    snapshots,
  );
  const draft = await InvoiceDraftModel.create(document);
  await writeAuditLog(
    "invoice_draft",
    draft._id,
    "create",
    null,
    toPlainDocument(draft),
  );
  return draft;
}

export async function updateInvoiceDraft(
  draftId: string,
  payload: InvoicePayload,
) {
  ensureObjectId(draftId);
  const draft = await InvoiceDraftModel.findById(draftId);

  if (!draft) {
    throw new ApiError(404, "Draft not found");
  }

  const before = toPlainDocument(draft);
  const snapshots = await resolveSnapshots(draft as SnapshotSource);
  const invDate = payload.invDate || draft.invDate || todayLocalIso();

  if (payload.workflowStatus === "draft") {
    const document = buildInvoiceDocument(
      { ...payload, invDate, workflowStatus: "draft" },
      snapshots,
    );
    Object.assign(draft, document);
    await draft.save();
    await writeAuditLog(
      "invoice_draft",
      draft._id,
      "update",
      before,
      toPlainDocument(draft),
    );
    return draft;
  }

  const numbering = await consumeInvoiceNumber(
    String(snapshots.presetSnapshot.invoice_prefix || "INV"),
    invDate,
  );
  const document = buildInvoiceDocument({ ...payload, invDate }, snapshots);
  const invoice = await InvoiceModel.create({
    ...document,
    ...numbering,
    sourceDraftId: draft._id,
    status: "active",
    recordStatus: "active",
  });
  await InvoiceDraftModel.deleteOne({ _id: draft._id });
  await writeAuditLog(
    "invoice",
    invoice._id,
    "convert_draft",
    before,
    toPlainDocument(invoice),
  );
  return invoice;
}

export async function listInvoiceDrafts() {
  const drafts = await InvoiceDraftModel.find({})
    .sort({ createdAt: -1 })
    .lean();
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
    updatedAt: draft.updatedAt,
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
  const draft = await InvoiceDraftModel.findById(draftId);
  if (!draft) {
    throw new ApiError(404, "Draft not found");
  }

  await InvoiceDraftModel.deleteOne({ _id: draftId });
  await writeAuditLog(
    "invoice_draft",
    draftId,
    "delete",
    toPlainDocument(draft),
    null,
  );
}

export async function updateInvoice(invNo: string, payload: InvoicePayload) {
  const invoice = await InvoiceModel.findOne({ invNo });
  if (!invoice) {
    throw new ApiError(404, "Invoice not found");
  }
  if (invoice.status === "cancelled") {
    throw new ApiError(409, "Cancelled invoices cannot be edited");
  }

  const before = toPlainDocument(invoice);
  const snapshots = await resolveSnapshots(invoice as SnapshotSource);
  const document = buildInvoiceDocument(
    { ...payload, invDate: invoice.invDate },
    snapshots,
  );
  Object.assign(invoice, { ...document, recordStatus: invoice.status });
  await invoice.save();
  await writeAuditLog(
    "invoice",
    invoice._id,
    "update",
    before,
    toPlainDocument(invoice),
  );
  return invoice;
}

function invoiceFilters(query: InvoiceQuery) {
  const filters: Record<string, unknown> = {};
  if (query.from || query.to) {
    filters.invDate = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
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
    filters.$or = [
      { invNo: new RegExp(escaped, "i") },
      { partyName: new RegExp(escaped, "i") },
    ];
  }
  return filters;
}

function matchesGstFilter(
  invoice: { totalCGST?: number; totalSGST?: number; totalIGST?: number },
  gst?: string,
) {
  if (!gst) {
    return true;
  }
  const hasGst =
    (invoice.totalCGST || 0) +
      (invoice.totalSGST || 0) +
      (invoice.totalIGST || 0) >
    0;
  return gst === "yes" ? hasGst : !hasGst;
}

export async function listInvoices(query: InvoiceQuery) {
  const invoices = await InvoiceModel.find(invoiceFilters(query))
    .sort({ createdAt: -1 })
    .lean();
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
      createdAt: invoice.createdAt,
    }));
}

function draftWorkbenchRow(draft: DraftWorkbenchSource) {
  return {
    id: `draft-${draft._id}`,
    invoiceNumber: "Not generated",
    createdAt: draft.createdAt,
    workflowStatus: "draft" as const,
    source: "draft" as const,
    draftId: String(draft._id),
  };
}

function invoiceWorkbenchRow(invoice: InvoiceWorkbenchSource) {
  const workflowStatus = defaultWorkflowStatus(invoice);
  return {
    id: `invoice-${invoice.invNo}`,
    invoiceNumber: invoice.invNo,
    createdAt: invoice.createdAt || invoice.invDate,
    workflowStatus,
    source: "invoice" as const,
    invNo: invoice.invNo,
  };
}

function emptyWorkbenchCounts() {
  return {
    all: 0,
    draft: 0,
    checkedIn: 0,
    checkedOut: 0,
    cancelled: 0,
  } satisfies Record<InvoiceWorkbenchStatus, number>;
}

export async function listInvoiceWorkbench(query: InvoiceWorkbenchQuery) {
  const [drafts, invoices] = await Promise.all([
    InvoiceDraftModel.find({}).sort({ createdAt: -1 }).lean(),
    InvoiceModel.find({}).sort({ createdAt: -1 }).lean(),
  ]);
  const rows = [
    ...drafts.map(draftWorkbenchRow),
    ...invoices.map(invoiceWorkbenchRow),
  ].sort((a, b) => {
    const left = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const right = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return right - left;
  });
  const counts = emptyWorkbenchCounts();

  rows.forEach((row) => {
    counts.all += 1;
    counts[row.workflowStatus] += 1;
  });

  return {
    counts,
    rows:
      query.status === "all"
        ? rows
        : rows.filter((row) => row.workflowStatus === query.status),
  };
}

export async function getInvoice(invNo: string) {
  const invoice = await InvoiceModel.findOne({ invNo }).lean();
  if (!invoice) {
    throw new ApiError(404, "Invoice not found");
  }
  return {
    ...invoice,
    workflowStatus: defaultWorkflowStatus(invoice),
    recordStatus: invoice.recordStatus || invoice.status,
  };
}

export async function cancelInvoice(invNo: string) {
  const invoice = await InvoiceModel.findOne({ invNo });
  if (!invoice) {
    throw new ApiError(404, "Invoice not found");
  }

  const before = toPlainDocument(invoice);
  invoice.status = "cancelled";
  invoice.recordStatus = "cancelled";
  invoice.workflowStatus = "cancelled";
  invoice.cancelledAt = new Date();
  await invoice.save();
  await writeAuditLog(
    "invoice",
    invoice._id,
    "cancel",
    before,
    toPlainDocument(invoice),
  );
  return invoice;
}

export async function exportInvoicesCsv(query: InvoiceQuery) {
  const invoices = await InvoiceModel.find(
    invoiceFilters({ ...query, status: query.status || "active" }),
  )
    .sort({ invDate: -1 })
    .lean();
  const rows = invoices
    .filter((invoice) => matchesGstFilter(invoice, query.gst))
    .map((invoice) => [
      invoice.invNo,
      invoice.invDate,
      invoice.partyName,
      invoice.totalCGST.toFixed(2),
      invoice.totalSGST.toFixed(2),
      invoice.totalIGST.toFixed(2),
      invoice.netTotal.toFixed(2),
      invoice.status,
      defaultWorkflowStatus(invoice),
    ]);

  return toCsv(
    [
      "Invoice No",
      "Date",
      "Payee",
      "CGST",
      "SGST",
      "IGST",
      "Net Amount",
      "Status",
      "Workflow Status",
    ],
    rows,
  );
}

export async function clearDatabase() {
  await Promise.all([
    InvoiceModel.deleteMany({}),
    InvoiceDraftModel.deleteMany({}),
    BusinessProfileModel.deleteMany({}),
    SettingModel.deleteMany({}),
    CounterModel.deleteMany({}),
    AuditLogModel.deleteMany({}),
  ]);
}
