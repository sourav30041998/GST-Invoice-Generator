import { Types } from "mongoose";
import { ApiError } from "../middleware/errorHandler.js";
import { AuditLogModel } from "../models/AuditLog.js";
import { CounterModel } from "../models/Counter.js";
import { InvoiceModel } from "../models/Invoice.js";
import { InvoiceDraftModel } from "../models/InvoiceDraft.js";
import { calculateInvoiceTotals } from "../utils/calculateInvoice.js";
import { toCsv } from "../utils/csv.js";
import { todayLocalIso, toInvoiceMonth } from "../utils/date.js";
import type {
  InvoicePayload,
  InvoiceQuery,
  InvoiceWorkbenchQuery,
} from "../validation/invoiceSchemas.js";
import { getBusinessProfileSnapshot } from "./settingsService.js";

export type TenantContext = {
  organizationId: string;
  userId: string;
  userEmail: string;
};

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

function counterScope(organizationId: string, prefix: string, month: string) {
  return `${organizationId}:${prefix}-${month}`;
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
  tenant: TenantContext,
  entityType: string,
  entityId: unknown,
  action: string,
  before: unknown,
  after: unknown,
) {
  await AuditLogModel.create({
    organizationId: tenant.organizationId,
    actorUserId: tenant.userId,
    entityType,
    entityId: String(entityId),
    action,
    before,
    after,
    createdBy: tenant.userEmail,
  }).catch(() => undefined);
}

export async function peekInvoiceNumber(
  tenant: TenantContext,
  prefix: string,
  invoiceDate?: string,
) {
  const safePrefix = prefix.toUpperCase();
  const month = toInvoiceMonth(invoiceDate);
  const row = await CounterModel.findOne({
    organizationId: tenant.organizationId,
    scope: counterScope(tenant.organizationId, safePrefix, month),
  }).lean();
  return buildInvoiceNo(safePrefix, month, (row?.sequence || 0) + 1);
}

async function consumeInvoiceNumber(
  tenant: TenantContext,
  prefix: string,
  invoiceDate?: string,
) {
  const safePrefix = prefix.toUpperCase();
  const month = toInvoiceMonth(invoiceDate);
  const scope = counterScope(tenant.organizationId, safePrefix, month);
  const row = await CounterModel.findOneAndUpdate(
    { organizationId: tenant.organizationId, scope },
    {
      $setOnInsert: {
        organizationId: tenant.organizationId,
        scope,
        prefix: safePrefix,
        period: month,
      },
      $inc: { sequence: 1 },
    },
    { upsert: true, new: true },
  ).lean();

  return {
    invNo: buildInvoiceNo(safePrefix, month, row.sequence),
    invoicePrefix: safePrefix,
    invoiceMonth: month,
    sequenceNo: row.sequence,
  };
}

async function resolveSnapshots(
  tenant: TenantContext,
  source?: SnapshotSource,
): Promise<ResolvedSnapshots> {
  if (source?.presetSnapshot && source.businessSnapshot) {
    return {
      businessProfileId: source.businessProfileId,
      presetSnapshot: source.presetSnapshot,
      businessSnapshot: source.businessSnapshot,
    };
  }

  return getBusinessProfileSnapshot(tenant.organizationId);
}

function buildInvoiceDocument(
  tenant: TenantContext,
  payload: InvoicePayload,
  snapshots: ResolvedSnapshots,
) {
  const totals = calculateInvoiceTotals(payload.lineItems, payload.adjustments);
  return {
    ...payload,
    ...totals,
    organizationId: tenant.organizationId,
    businessProfileId: snapshots.businessProfileId,
    presetSnapshot: snapshots.presetSnapshot,
    businessSnapshot: snapshots.businessSnapshot,
    createdBy: tenant.userEmail,
    createdByUserId: tenant.userId,
  };
}

export async function createInvoice(
  tenant: TenantContext,
  payload: InvoicePayload,
) {
  if (payload.workflowStatus === "draft") {
    throw new ApiError(422, "Use the draft endpoint to save draft invoices");
  }

  const snapshots = await getBusinessProfileSnapshot(tenant.organizationId);
  const invDate = payload.invDate || todayLocalIso();
  const numbering = await consumeInvoiceNumber(
    tenant,
    String(snapshots.presetSnapshot.invoice_prefix || "INV"),
    invDate,
  );
  const document = buildInvoiceDocument(
    tenant,
    { ...payload, invDate },
    snapshots,
  );
  const invoice = await InvoiceModel.create({
    ...document,
    ...numbering,
    status: "active",
    recordStatus: "active",
  });
  await writeAuditLog(
    tenant,
    "invoice",
    invoice._id,
    "create",
    null,
    toPlainDocument(invoice),
  );
  return invoice;
}

export async function createInvoiceDraft(
  tenant: TenantContext,
  payload: InvoicePayload,
) {
  const snapshots = await getBusinessProfileSnapshot(tenant.organizationId);
  const invDate = payload.invDate || todayLocalIso();
  const document = buildInvoiceDocument(
    tenant,
    { ...payload, invDate, workflowStatus: "draft" },
    snapshots,
  );
  const draft = await InvoiceDraftModel.create(document);
  await writeAuditLog(
    tenant,
    "invoice_draft",
    draft._id,
    "create",
    null,
    toPlainDocument(draft),
  );
  return draft;
}

export async function updateInvoiceDraft(
  tenant: TenantContext,
  draftId: string,
  payload: InvoicePayload,
) {
  ensureObjectId(draftId);
  const draft = await InvoiceDraftModel.findOne({
    _id: draftId,
    organizationId: tenant.organizationId,
  });
  if (!draft) {
    throw new ApiError(404, "Draft not found");
  }

  const before = toPlainDocument(draft);
  const snapshots = await resolveSnapshots(tenant, draft as SnapshotSource);
  const invDate = payload.invDate || draft.invDate || todayLocalIso();

  if (payload.workflowStatus === "draft") {
    const document = buildInvoiceDocument(
      tenant,
      { ...payload, invDate, workflowStatus: "draft" },
      snapshots,
    );
    Object.assign(draft, document);
    await draft.save();
    await writeAuditLog(
      tenant,
      "invoice_draft",
      draft._id,
      "update",
      before,
      toPlainDocument(draft),
    );
    return draft;
  }

  const numbering = await consumeInvoiceNumber(
    tenant,
    String(snapshots.presetSnapshot.invoice_prefix || "INV"),
    invDate,
  );
  const document = buildInvoiceDocument(
    tenant,
    { ...payload, invDate },
    snapshots,
  );
  const invoice = await InvoiceModel.create({
    ...document,
    ...numbering,
    sourceDraftId: draft._id,
    status: "active",
    recordStatus: "active",
  });
  await InvoiceDraftModel.deleteOne({
    _id: draft._id,
    organizationId: tenant.organizationId,
  });
  await writeAuditLog(
    tenant,
    "invoice",
    invoice._id,
    "convert_draft",
    before,
    toPlainDocument(invoice),
  );
  return invoice;
}

export async function listInvoiceDrafts(tenant: TenantContext) {
  const drafts = await InvoiceDraftModel.find({
    organizationId: tenant.organizationId,
  })
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

export async function getInvoiceDraft(tenant: TenantContext, draftId: string) {
  ensureObjectId(draftId);
  const draft = await InvoiceDraftModel.findOne({
    _id: draftId,
    organizationId: tenant.organizationId,
  }).lean();
  if (!draft) {
    throw new ApiError(404, "Draft not found");
  }
  return draft;
}

export async function deleteInvoiceDraft(
  tenant: TenantContext,
  draftId: string,
) {
  ensureObjectId(draftId);
  const draft = await InvoiceDraftModel.findOne({
    _id: draftId,
    organizationId: tenant.organizationId,
  });
  if (!draft) {
    throw new ApiError(404, "Draft not found");
  }

  await InvoiceDraftModel.deleteOne({
    _id: draft._id,
    organizationId: tenant.organizationId,
  });
  await writeAuditLog(
    tenant,
    "invoice_draft",
    draftId,
    "delete",
    toPlainDocument(draft),
    null,
  );
}

export async function updateInvoice(
  tenant: TenantContext,
  invNo: string,
  payload: InvoicePayload,
) {
  const invoice = await InvoiceModel.findOne({
    organizationId: tenant.organizationId,
    invNo,
  });
  if (!invoice) {
    throw new ApiError(404, "Invoice not found");
  }
  if (invoice.status === "cancelled") {
    throw new ApiError(409, "Cancelled invoices cannot be edited");
  }

  const before = toPlainDocument(invoice);
  const snapshots = await resolveSnapshots(tenant, invoice as SnapshotSource);
  const document = buildInvoiceDocument(
    tenant,
    { ...payload, invDate: invoice.invDate },
    snapshots,
  );
  Object.assign(invoice, { ...document, recordStatus: invoice.status });
  await invoice.save();
  await writeAuditLog(
    tenant,
    "invoice",
    invoice._id,
    "update",
    before,
    toPlainDocument(invoice),
  );
  return invoice;
}

function invoiceFilters(tenant: TenantContext, query: InvoiceQuery) {
  const filters: Record<string, unknown> = {
    organizationId: tenant.organizationId,
  };
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

export async function listInvoices(tenant: TenantContext, query: InvoiceQuery) {
  const invoices = await InvoiceModel.find(invoiceFilters(tenant, query))
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

export async function listInvoiceWorkbench(
  tenant: TenantContext,
  query: InvoiceWorkbenchQuery,
) {
  const [drafts, invoices] = await Promise.all([
    InvoiceDraftModel.find({ organizationId: tenant.organizationId })
      .sort({ createdAt: -1 })
      .lean(),
    InvoiceModel.find({ organizationId: tenant.organizationId })
      .sort({ createdAt: -1 })
      .lean(),
  ]);
  const rows = [
    ...drafts.map(draftWorkbenchRow),
    ...invoices.map(invoiceWorkbenchRow),
  ].sort((left, right) => {
    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    return rightTime - leftTime;
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

export async function getInvoice(tenant: TenantContext, invNo: string) {
  const invoice = await InvoiceModel.findOne({
    organizationId: tenant.organizationId,
    invNo,
  }).lean();
  if (!invoice) {
    throw new ApiError(404, "Invoice not found");
  }
  return {
    ...invoice,
    workflowStatus: defaultWorkflowStatus(invoice),
    recordStatus: invoice.recordStatus || invoice.status,
  };
}

export async function cancelInvoice(tenant: TenantContext, invNo: string) {
  const invoice = await InvoiceModel.findOne({
    organizationId: tenant.organizationId,
    invNo,
  });
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
    tenant,
    "invoice",
    invoice._id,
    "cancel",
    before,
    toPlainDocument(invoice),
  );
  return invoice;
}

export async function exportInvoicesCsv(
  tenant: TenantContext,
  query: InvoiceQuery,
) {
  const invoices = await InvoiceModel.find(
    invoiceFilters(tenant, { ...query, status: query.status || "active" }),
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

export async function clearCompanyData(tenant: TenantContext) {
  await Promise.all([
    InvoiceModel.deleteMany({ organizationId: tenant.organizationId }),
    InvoiceDraftModel.deleteMany({ organizationId: tenant.organizationId }),
    CounterModel.deleteMany({ organizationId: tenant.organizationId }),
    AuditLogModel.deleteMany({ organizationId: tenant.organizationId }),
  ]);
  await writeAuditLog(
    tenant,
    "organization",
    tenant.organizationId,
    "clear_company_data",
    null,
    { clearedAt: new Date().toISOString() },
  );
}
