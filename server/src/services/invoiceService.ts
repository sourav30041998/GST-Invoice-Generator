import mongoose, { Types, type ClientSession } from "mongoose";
import { ApiError } from "../middleware/errorHandler.js";
import { AuditLogModel } from "../models/AuditLog.js";
import { CounterModel } from "../models/Counter.js";
import { InvoiceModel } from "../models/Invoice.js";
import { InvoiceDraftModel } from "../models/InvoiceDraft.js";
import { RoomAllocationModel } from "../models/RoomAllocation.js";
import { calculateInvoiceTotals } from "../utils/calculateInvoice.js";
import { toCsv } from "../utils/csv.js";
import { todayLocalIso, toInvoiceMonth } from "../utils/date.js";
import {
  assertExpectedVersion,
  assertInvoiceWorkflowTransition,
} from "../utils/invoiceRules.js";
import type {
  InvoicePayload,
  InvoiceQuery,
  InvoiceUpdatePayload,
  InvoiceWorkbenchQuery,
} from "../validation/invoiceSchemas.js";
import { getBusinessProfileSnapshot } from "./settingsService.js";
import {
  protectInvoiceRecord,
  revealInvoiceRecord,
} from "./protectedRecordService.js";
import {
  resolveRoomSnapshots,
  syncRoomAllocations,
  type RoomSnapshot,
} from "./roomService.js";

export type TenantContext = {
  organizationId: string;
  userId: string;
  userEmail: string;
};

type PersistedWorkflowStatus =
  "draft" | "reserved" | "checkedIn" | "checkedOut" | "cancelled";
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
  __v?: number;
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
    invoice.workflowStatus === "reserved" ||
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

function documentVersion(document: unknown) {
  const source = document as { __v?: unknown } | null | undefined;
  return typeof source?.__v === "number" ? source.__v : 0;
}

function toResponseDocument(
  document: AuditDocument | null | undefined,
  scope: "invoice" | "invoice-draft",
  organizationId: string,
) {
  const plain = toPlainDocument(document) as Record<string, unknown> | null;
  if (!plain) {
    return plain;
  }

  const revealed = revealInvoiceRecord(scope, plain, organizationId);
  const {
    organizationId: _organizationId,
    businessProfileId: _businessProfileId,
    businessSnapshot: _businessSnapshot,
    sourceDraftId: _sourceDraftId,
    createdBy: _createdBy,
    createdByUserId: _createdByUserId,
    protectedData: _protectedData,
    __v: _documentVersion,
    ...clientRecord
  } = revealed;
  return {
    ...clientRecord,
    version: typeof plain.__v === "number" ? plain.__v : 0,
  };
}

async function writeAuditLog(
  tenant: TenantContext,
  entityType: string,
  entityId: unknown,
  action: string,
  before: unknown,
  after: unknown,
  session?: ClientSession,
) {
  const entry = {
    organizationId: tenant.organizationId,
    actorUserId: tenant.userId,
    entityType,
    entityId: String(entityId),
    action,
    before,
    after,
    createdBy: `user:${tenant.userId}`,
  };

  if (session) {
    await AuditLogModel.create([entry], { session });
    return;
  }

  await AuditLogModel.create(entry);
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
  session?: ClientSession,
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
    { upsert: true, new: true, ...(session ? { session } : {}) },
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
  rooms: RoomSnapshot[],
) {
  const totals = calculateInvoiceTotals(payload.lineItems, payload.adjustments);
  const { rooms: _selectedRooms, ...invoicePayload } = payload;
  return {
    ...invoicePayload,
    rooms,
    roomNo: rooms.map((room) => room.roomNumber).join(", "),
    ...totals,
    organizationId: tenant.organizationId,
    businessProfileId: snapshots.businessProfileId,
    presetSnapshot: snapshots.presetSnapshot,
    businessSnapshot: snapshots.businessSnapshot,
    createdBy: `user:${tenant.userId}`,
    createdByUserId: tenant.userId,
  };
}

async function runInvoiceTransaction<T>(
  operation: (session: ClientSession) => Promise<T>,
) {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    if (result === undefined) {
      throw new ApiError(500, "Could not complete invoice update");
    }
    return result;
  } finally {
    await session.endSession();
  }
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
  const invoice = await runInvoiceTransaction(async (session) => {
    const rooms = await resolveRoomSnapshots(
      tenant,
      payload.rooms.map((room) => room.roomId),
      session,
    );
    const numbering = await consumeInvoiceNumber(
      tenant,
      String(snapshots.presetSnapshot.invoice_prefix || "INV"),
      invDate,
      session,
    );
    const document = buildInvoiceDocument(
      tenant,
      { ...payload, invDate },
      snapshots,
      rooms,
    );
    const createdInvoice = new InvoiceModel({
      ...protectInvoiceRecord("invoice", document, tenant.organizationId),
      ...numbering,
      status: "active",
      recordStatus: "active",
    });
    await createdInvoice.save({ session });
    await syncRoomAllocations(
      tenant,
      {
        invoiceId: String(createdInvoice._id),
        invoiceNumber: createdInvoice.invNo,
        rooms,
        checkinDate: createdInvoice.checkinDate,
        checkoutDate: createdInvoice.checkoutDate,
        workflowStatus: createdInvoice.workflowStatus as
          "reserved" | "checkedIn" | "checkedOut",
      },
      session,
    );
    await writeAuditLog(
      tenant,
      "invoice",
      createdInvoice._id,
      "create",
      null,
      toPlainDocument(createdInvoice),
      session,
    );
    return toResponseDocument(createdInvoice, "invoice", tenant.organizationId);
  });
  return invoice;
}

export async function createInvoiceDraft(
  tenant: TenantContext,
  payload: InvoicePayload,
) {
  if (payload.workflowStatus !== "draft") {
    throw new ApiError(422, "Draft invoices must use the draft status");
  }

  const snapshots = await getBusinessProfileSnapshot(tenant.organizationId);
  const invDate = payload.invDate || todayLocalIso();
  return runInvoiceTransaction(async (session) => {
    const rooms = await resolveRoomSnapshots(
      tenant,
      payload.rooms.map((room) => room.roomId),
      session,
    );
    const document = buildInvoiceDocument(
      tenant,
      { ...payload, invDate, workflowStatus: "draft" },
      snapshots,
      rooms,
    );
    const draft = new InvoiceDraftModel(
      protectInvoiceRecord("invoice-draft", document, tenant.organizationId),
    );
    await draft.save({ session });
    await writeAuditLog(
      tenant,
      "invoice_draft",
      draft._id,
      "create",
      null,
      toPlainDocument(draft),
      session,
    );
    return toResponseDocument(draft, "invoice-draft", tenant.organizationId);
  });
}

export async function updateInvoiceDraft(
  tenant: TenantContext,
  draftId: string,
  payload: InvoiceUpdatePayload,
) {
  ensureObjectId(draftId);
  const { version, ...invoicePayload } = payload;
  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      const draft = await InvoiceDraftModel.findOne({
        _id: draftId,
        organizationId: tenant.organizationId,
      })
        .select("+protectedData")
        .session(session);
      if (!draft) {
        throw new ApiError(404, "Draft not found");
      }
      assertExpectedVersion(documentVersion(draft), version, "Draft");

      const before = toPlainDocument(draft);
      const revealedDraft = revealInvoiceRecord(
        "invoice-draft",
        toPlainDocument(draft) as Record<string, unknown>,
        tenant.organizationId,
      );
      const snapshots = await resolveSnapshots(
        tenant,
        revealedDraft as SnapshotSource,
      );
      const invDate =
        invoicePayload.invDate || draft.invDate || todayLocalIso();
      const rooms = await resolveRoomSnapshots(
        tenant,
        invoicePayload.rooms.map((room) => room.roomId),
        session,
      );

      if (invoicePayload.workflowStatus === "draft") {
        const document = buildInvoiceDocument(
          tenant,
          { ...invoicePayload, invDate, workflowStatus: "draft" },
          snapshots,
          rooms,
        );
        Object.assign(
          draft,
          protectInvoiceRecord(
            "invoice-draft",
            document,
            tenant.organizationId,
          ),
        );
        await draft.save({ session });
        await writeAuditLog(
          tenant,
          "invoice_draft",
          draft._id,
          "update",
          before,
          toPlainDocument(draft),
          session,
        );
        return toResponseDocument(
          draft,
          "invoice-draft",
          tenant.organizationId,
        );
      }

      const numbering = await consumeInvoiceNumber(
        tenant,
        String(snapshots.presetSnapshot.invoice_prefix || "INV"),
        invDate,
        session,
      );
      const document = buildInvoiceDocument(
        tenant,
        { ...invoicePayload, invDate },
        snapshots,
        rooms,
      );
      const [invoice] = await InvoiceModel.create(
        [
          {
            ...protectInvoiceRecord("invoice", document, tenant.organizationId),
            ...numbering,
            sourceDraftId: draft._id,
            status: "active",
            recordStatus: "active",
          },
        ],
        { session },
      );
      await syncRoomAllocations(
        tenant,
        {
          invoiceId: String(invoice._id),
          invoiceNumber: invoice.invNo,
          rooms,
          checkinDate: invoice.checkinDate,
          checkoutDate: invoice.checkoutDate,
          workflowStatus: invoice.workflowStatus as
            "reserved" | "checkedIn" | "checkedOut",
        },
        session,
      );
      const deleted = await InvoiceDraftModel.deleteOne({
        _id: draft._id,
        organizationId: tenant.organizationId,
        __v: version,
      }).session(session);
      if (deleted.deletedCount !== 1) {
        throw new ApiError(
          409,
          "Draft was changed elsewhere. Reload it before saving your changes.",
        );
      }
      await writeAuditLog(
        tenant,
        "invoice",
        invoice._id,
        "convert_draft",
        before,
        toPlainDocument(invoice),
        session,
      );
      return toResponseDocument(invoice, "invoice", tenant.organizationId);
    });

    if (!result) {
      throw new ApiError(500, "Draft conversion did not complete");
    }
    return result;
  } finally {
    await session.endSession();
  }
}

export async function listInvoiceDrafts(tenant: TenantContext) {
  const drafts = await InvoiceDraftModel.find({
    organizationId: tenant.organizationId,
  })
    .select("+protectedData")
    .sort({ createdAt: -1 })
    .lean();
  return drafts.map((storedDraft) => {
    const draft = revealInvoiceRecord(
      "invoice-draft",
      storedDraft,
      tenant.organizationId,
    );
    return {
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
      version: documentVersion(storedDraft),
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
    };
  });
}

export async function getInvoiceDraft(tenant: TenantContext, draftId: string) {
  ensureObjectId(draftId);
  const draft = await InvoiceDraftModel.findOne({
    _id: draftId,
    organizationId: tenant.organizationId,
  })
    .select("+protectedData")
    .lean();
  if (!draft) {
    throw new ApiError(404, "Draft not found");
  }
  return toResponseDocument(draft, "invoice-draft", tenant.organizationId);
}

export async function deleteInvoiceDraft(
  tenant: TenantContext,
  draftId: string,
  version: number,
) {
  ensureObjectId(draftId);
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const draft = await InvoiceDraftModel.findOne({
        _id: draftId,
        organizationId: tenant.organizationId,
      })
        .select("+protectedData")
        .session(session);
      if (!draft) {
        throw new ApiError(404, "Draft not found");
      }
      assertExpectedVersion(documentVersion(draft), version, "Draft");

      const deleted = await InvoiceDraftModel.deleteOne({
        _id: draft._id,
        organizationId: tenant.organizationId,
        __v: version,
      }).session(session);
      if (deleted.deletedCount !== 1) {
        throw new ApiError(
          409,
          "Draft was changed elsewhere. Reload it before deleting it.",
        );
      }
      await writeAuditLog(
        tenant,
        "invoice_draft",
        draftId,
        "delete",
        toPlainDocument(draft),
        null,
        session,
      );
    });
  } finally {
    await session.endSession();
  }
}

export async function updateInvoice(
  tenant: TenantContext,
  invNo: string,
  payload: InvoiceUpdatePayload,
) {
  const nextWorkflowStatus = payload.workflowStatus;
  if (
    nextWorkflowStatus !== "reserved" &&
    nextWorkflowStatus !== "checkedIn" &&
    nextWorkflowStatus !== "checkedOut"
  ) {
    throw new ApiError(
      422,
      "An issued invoice must be reserved, checked in, or checked out",
    );
  }
  const { version, ...invoicePayload } = payload;
  return runInvoiceTransaction(async (session) => {
    const invoice = await InvoiceModel.findOne({
      organizationId: tenant.organizationId,
      invNo,
    })
      .select("+protectedData")
      .session(session);
    if (!invoice) {
      throw new ApiError(404, "Invoice not found");
    }
    assertExpectedVersion(documentVersion(invoice), version, "Invoice");
    assertInvoiceWorkflowTransition(
      defaultWorkflowStatus(invoice),
      nextWorkflowStatus,
    );

    const before = toPlainDocument(invoice);
    const revealedInvoice = revealInvoiceRecord(
      "invoice",
      toPlainDocument(invoice) as Record<string, unknown>,
      tenant.organizationId,
    );
    const snapshots = await resolveSnapshots(
      tenant,
      revealedInvoice as SnapshotSource,
    );
    const rooms = await resolveRoomSnapshots(
      tenant,
      invoicePayload.rooms.map((room) => room.roomId),
      session,
    );
    const document = buildInvoiceDocument(
      tenant,
      {
        ...invoicePayload,
        workflowStatus: nextWorkflowStatus,
        invDate: invoice.invDate,
      },
      snapshots,
      rooms,
    );
    Object.assign(invoice, {
      ...protectInvoiceRecord("invoice", document, tenant.organizationId),
      recordStatus: invoice.status,
    });
    await invoice.save({ session });
    await syncRoomAllocations(
      tenant,
      {
        invoiceId: String(invoice._id),
        invoiceNumber: invoice.invNo,
        rooms,
        checkinDate: invoice.checkinDate,
        checkoutDate: invoice.checkoutDate,
        workflowStatus: nextWorkflowStatus,
      },
      session,
    );
    await writeAuditLog(
      tenant,
      "invoice",
      invoice._id,
      "update",
      before,
      toPlainDocument(invoice),
      session,
    );
    return toResponseDocument(invoice, "invoice", tenant.organizationId);
  });
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
    .select("+protectedData")
    .sort({ createdAt: -1 })
    .lean();
  return invoices
    .map((invoice) => ({
      stored: invoice,
      revealed: revealInvoiceRecord("invoice", invoice, tenant.organizationId),
    }))
    .filter(({ revealed }) => {
      const search = query.search?.toLowerCase();
      return (
        matchesGstFilter(revealed, query.gst) &&
        (!search ||
          revealed.invNo.toLowerCase().includes(search) ||
          revealed.partyName.toLowerCase().includes(search))
      );
    })
    .map(({ stored: invoice, revealed }) => ({
      invNo: invoice.invNo,
      invDate: invoice.invDate,
      partyName: revealed.partyName,
      netTotal: invoice.netTotal,
      totalCGST: invoice.totalCGST,
      totalSGST: invoice.totalSGST,
      totalIGST: invoice.totalIGST,
      items: invoice.lineItems.length,
      status: invoice.status,
      workflowStatus: defaultWorkflowStatus(invoice),
      version: documentVersion(invoice),
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
    reserved: 0,
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
  })
    .select("+protectedData")
    .lean();
  if (!invoice) {
    throw new ApiError(404, "Invoice not found");
  }
  const revealed = revealInvoiceRecord(
    "invoice",
    invoice,
    tenant.organizationId,
  );
  const {
    organizationId: _organizationId,
    businessProfileId: _businessProfileId,
    businessSnapshot: _businessSnapshot,
    sourceDraftId: _sourceDraftId,
    createdBy: _createdBy,
    createdByUserId: _createdByUserId,
    protectedData: _protectedData,
    __v: _documentVersion,
    ...clientRecord
  } = revealed;
  return {
    ...clientRecord,
    version: documentVersion(invoice),
    workflowStatus: defaultWorkflowStatus(invoice),
    recordStatus: invoice.recordStatus || invoice.status,
  };
}

export async function cancelInvoice(
  tenant: TenantContext,
  invNo: string,
  version: number,
) {
  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      const invoice = await InvoiceModel.findOne({
        organizationId: tenant.organizationId,
        invNo,
      })
        .select("+protectedData")
        .session(session);
      if (!invoice) {
        throw new ApiError(404, "Invoice not found");
      }
      assertExpectedVersion(documentVersion(invoice), version, "Invoice");
      if (invoice.status === "cancelled") {
        throw new ApiError(409, "Invoice is already cancelled");
      }

      const before = toPlainDocument(invoice);
      invoice.status = "cancelled";
      invoice.recordStatus = "cancelled";
      invoice.workflowStatus = "cancelled";
      invoice.cancelledAt = new Date();
      await invoice.save({ session });
      await syncRoomAllocations(
        tenant,
        {
          invoiceId: String(invoice._id),
          invoiceNumber: invoice.invNo,
          rooms: [],
          checkinDate: invoice.checkinDate,
          checkoutDate: invoice.checkoutDate,
          workflowStatus: "cancelled",
        },
        session,
      );
      await writeAuditLog(
        tenant,
        "invoice",
        invoice._id,
        "cancel",
        before,
        toPlainDocument(invoice),
        session,
      );
      return toResponseDocument(invoice, "invoice", tenant.organizationId);
    });

    if (!result) {
      throw new ApiError(500, "Invoice cancellation did not complete");
    }
    return result;
  } finally {
    await session.endSession();
  }
}

export async function exportInvoicesCsv(
  tenant: TenantContext,
  query: InvoiceQuery,
) {
  const invoices = await InvoiceModel.find(
    invoiceFilters(tenant, { ...query, status: query.status || "active" }),
  )
    .select("+protectedData")
    .sort({ invDate: -1 })
    .lean();
  const rows = invoices
    .map((invoice) => ({
      stored: invoice,
      revealed: revealInvoiceRecord("invoice", invoice, tenant.organizationId),
    }))
    .filter(({ revealed }) => {
      const search = query.search?.toLowerCase();
      return (
        matchesGstFilter(revealed, query.gst) &&
        (!search ||
          revealed.invNo.toLowerCase().includes(search) ||
          revealed.partyName.toLowerCase().includes(search))
      );
    })
    .map(({ stored: invoice, revealed }) => [
      invoice.invNo,
      invoice.invDate,
      revealed.partyName,
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
    RoomAllocationModel.deleteMany({ organizationId: tenant.organizationId }),
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
