import { Check, ChevronDown, FilePlus2 } from "lucide-react";
import { type FocusEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type {
<<<<<<< HEAD
  InvoiceDraftListItem,
  InvoiceListItem,
=======
  InvoiceWorkbenchRow,
  InvoiceWorkbenchStatus,
>>>>>>> codex/backend-api-data
  InvoiceWorkflowStatus,
} from "../types";
import { formatDateTime } from "../utils/dates";

type NewInvoiceStartProps = {
  refreshKey: number;
  onCreate: () => void;
  onOpenDraft: (draftId: string) => void;
  onOpenInvoice: (invNo: string, workflowStatus: InvoiceWorkflowStatus) => void;
  showToast: (message: string) => void;
};

<<<<<<< HEAD
type InvoiceStatusView = "all" | InvoiceWorkflowStatus;

type StatusView = {
  key: InvoiceStatusView;
  label: string;
};

type InvoiceStatusRow = {
  id: string;
  invoiceNumber: string;
  createdAt?: string;
  workflowStatus: InvoiceWorkflowStatus;
  source: "draft" | "invoice";
  draftId?: string;
  invNo?: string;
};

=======
type StatusView = {
  key: InvoiceWorkbenchStatus;
  label: string;
};

>>>>>>> codex/backend-api-data
const statusViews: StatusView[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "checkedIn", label: "Checked In" },
  { key: "checkedOut", label: "Checked Out" },
  { key: "cancelled", label: "Cancelled" },
];

<<<<<<< HEAD
const defaultInvoiceFilters = {
  from: "",
  to: "",
  gst: "",
  status: "",
  search: "",
} as const;

function invoiceWorkflowStatus(
  invoice: InvoiceListItem,
): InvoiceWorkflowStatus {
  if (invoice.workflowStatus) {
    return invoice.workflowStatus;
  }

  if (invoice.status === "cancelled") {
    return "cancelled";
  }

  if (
    invoice.status === "draft" ||
    invoice.status === "checkedIn" ||
    invoice.status === "checkedOut"
  ) {
    return invoice.status;
  }

  return "checkedOut";
}

function toInvoiceRows(
  invoices: InvoiceListItem[],
  drafts: InvoiceDraftListItem[],
): InvoiceStatusRow[] {
  const draftRows = drafts.map((draft) => ({
    id: `draft-${draft._id}`,
    invoiceNumber: "Not generated",
    createdAt: draft.createdAt,
    workflowStatus: draft.workflowStatus,
    source: "draft" as const,
    draftId: draft._id,
  }));

  const savedRows = invoices.map((invoice) => ({
    id: `invoice-${invoice.invNo}`,
    invoiceNumber: invoice.invNo,
    createdAt: invoice.createdAt || invoice.invDate,
    workflowStatus: invoiceWorkflowStatus(invoice),
    source: "invoice" as const,
    invNo: invoice.invNo,
  }));

  return [...draftRows, ...savedRows];
=======
function emptyStatusCounts() {
  return statusViews.reduce(
    (acc, view) => ({ ...acc, [view.key]: 0 }),
    {} as Record<InvoiceWorkbenchStatus, number>,
  );
>>>>>>> codex/backend-api-data
}

export function NewInvoiceStart({
  refreshKey,
  onCreate,
  onOpenDraft,
  onOpenInvoice,
  showToast,
}: NewInvoiceStartProps) {
<<<<<<< HEAD
  const [activeStatus, setActiveStatus] = useState<InvoiceStatusView>("all");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [rows, setRows] = useState<InvoiceStatusRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const [invoices, drafts] = await Promise.all([
        api.listInvoices(defaultInvoiceFilters),
        api.listInvoiceDrafts(),
      ]);
      setRows(toInvoiceRows(invoices, drafts));
    } catch (error) {
      setRows(toInvoiceRows([], []));
=======
  const [activeStatus, setActiveStatus] =
    useState<InvoiceWorkbenchStatus>("all");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [statusCounts, setStatusCounts] = useState<
    Record<InvoiceWorkbenchStatus, number>
  >(() => emptyStatusCounts());
  const [rows, setRows] = useState<InvoiceWorkbenchRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadInvoices = async (status = activeStatus) => {
    setLoading(true);
    try {
      const workbench = await api.listInvoiceWorkbench(status);
      setRows(workbench.rows);
      setStatusCounts({ ...emptyStatusCounts(), ...workbench.counts });
    } catch (error) {
      setRows([]);
      setStatusCounts(emptyStatusCounts());
>>>>>>> codex/backend-api-data
      showToast(
        error instanceof Error ? error.message : "Could not load invoices.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
<<<<<<< HEAD
    void loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const statusCounts = useMemo(() => {
    const counts = statusViews.reduce(
      (acc, view) => ({ ...acc, [view.key]: 0 }),
      {} as Record<InvoiceStatusView, number>,
    );

    rows.forEach((invoice) => {
      counts.all += 1;
      counts[invoice.workflowStatus] += 1;
    });

    return counts;
  }, [rows]);
=======
    void loadInvoices(activeStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, activeStatus]);
>>>>>>> codex/backend-api-data

  const selectedStatusView =
    statusViews.find((view) => view.key === activeStatus) || statusViews[0];
  const viewTitle =
    activeStatus === "all"
      ? "All Invoices"
      : `${selectedStatusView.label} Invoices`;
<<<<<<< HEAD

  const visibleRows = useMemo(() => {
    if (activeStatus === "all") {
      return rows;
    }

    return rows.filter((invoice) => invoice.workflowStatus === activeStatus);
  }, [activeStatus, rows]);

  const openInvoiceRow = (invoice: InvoiceStatusRow) => {
=======
  const visibleRows = useMemo(() => rows, [rows]);

  const openInvoiceRow = (invoice: InvoiceWorkbenchRow) => {
>>>>>>> codex/backend-api-data
    if (invoice.source === "draft" && invoice.draftId) {
      onOpenDraft(invoice.draftId);
      return;
    }

    if (invoice.source === "invoice" && invoice.invNo) {
      onOpenInvoice(invoice.invNo, invoice.workflowStatus);
    }
  };

<<<<<<< HEAD
  const selectStatus = (status: InvoiceStatusView) => {
=======
  const selectStatus = (status: InvoiceWorkbenchStatus) => {
>>>>>>> codex/backend-api-data
    setActiveStatus(status);
    setStatusMenuOpen(false);
  };

  const closeStatusDropdownOnBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (
      !(nextTarget instanceof Node) ||
      !event.currentTarget.contains(nextTarget)
    ) {
      setStatusMenuOpen(false);
    }
  };

  return (
    <div className="view-stack">
      <section className="panel new-invoice-panel">
        <div className="new-invoice-toolbar">
          <div className="new-invoice-heading">
            <span>Invoices</span>
            <strong>{viewTitle}</strong>
          </div>
          <div className="new-invoice-controls">
            <div className="status-dropdown" onBlur={closeStatusDropdownOnBlur}>
              <button
                className={`status-dropdown-button${statusMenuOpen ? " active" : ""}`}
                type="button"
                aria-haspopup="listbox"
                aria-expanded={statusMenuOpen}
                onClick={() => setStatusMenuOpen((open) => !open)}
              >
                <span>
                  <small>Status</small>
                  <strong>{selectedStatusView.label}</strong>
                </span>
                <em>{statusCounts[selectedStatusView.key]}</em>
                <ChevronDown size={16} />
              </button>
              {statusMenuOpen ? (
                <div
                  className="status-dropdown-menu"
                  role="listbox"
                  aria-label="Invoice status views"
                >
                  {statusViews.map((view) => (
                    <button
                      className={`status-dropdown-option${activeStatus === view.key ? " active" : ""}`}
                      key={view.key}
                      type="button"
                      role="option"
                      aria-selected={activeStatus === view.key}
                      onClick={() => selectStatus(view.key)}
                    >
                      <span>{view.label}</span>
                      <strong>{statusCounts[view.key]}</strong>
                      {activeStatus === view.key ? <Check size={15} /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              className="btn btn-primary btn-large"
              type="button"
              onClick={onCreate}
            >
              <FilePlus2 size={17} />
              New Invoice
            </button>
          </div>
        </div>

        <div className="table-wrap invoice-status-table-wrap">
          <table className="data-table invoice-status-table">
            <thead>
              <tr>
                <th>Invoice Number</th>
                <th>Date / Time of Creation</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="empty-row" colSpan={2}>
                    Loading invoices...
                  </td>
                </tr>
              ) : visibleRows.length ? (
                visibleRows.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="invoice-status-number">
                      <button
                        className="invoice-link-button"
                        type="button"
                        onClick={() => openInvoiceRow(invoice)}
                      >
                        {invoice.invoiceNumber}
                      </button>
                    </td>
                    <td>{formatDateTime(invoice.createdAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="empty-row" colSpan={2}>
                    No invoices in this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
