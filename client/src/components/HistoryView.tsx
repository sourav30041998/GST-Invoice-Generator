import {
  Ban,
  Download,
  Edit3,
  FileSpreadsheet,
  RotateCcw,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type {
  Invoice,
  InvoiceFilters,
  InvoiceListItem,
  Settings,
} from "../types";
import { formatCurrency } from "../utils/calculations";
import { formatDate } from "../utils/dates";
import { buildInvoicePdf, resolveLogoDataUrl } from "../utils/pdf";

type HistoryViewProps = {
  settings: Settings;
  refreshKey: number;
  onEdit: (invoice: Invoice) => void;
  showToast: (message: string) => void;
};

const defaultFilters: InvoiceFilters = {
  from: "",
  to: "",
  gst: "",
  status: "",
  search: "",
};

export function HistoryView({
  settings,
  refreshKey,
  onEdit,
  showToast,
}: HistoryViewProps) {
  const [filters, setFilters] = useState<InvoiceFilters>(defaultFilters);
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadInvoices = async (activeFilters = filters) => {
    setLoading(true);
    try {
      setInvoices(await api.listInvoices(activeFilters));
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not load invoices.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const summary = useMemo(() => {
    const activeInvoices = invoices.filter(
      (invoice) => invoice.status !== "cancelled",
    );
    const total = activeInvoices.reduce(
      (sum, invoice) => sum + invoice.netTotal,
      0,
    );
    const gstCount = activeInvoices.filter(
      (invoice) =>
        invoice.totalCGST + invoice.totalSGST + invoice.totalIGST > 0,
    ).length;
    return { count: activeInvoices.length, total, gstCount };
  }, [invoices]);

  const updateFilter = (key: keyof InvoiceFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const redownload = async (invNo: string) => {
    try {
      const invoice = await api.getInvoice(invNo);
      const logoDataUrl = await resolveLogoDataUrl(settings.logoDataUrl);
      buildInvoicePdf(invoice, logoDataUrl);
      showToast(`Re-downloading ${invNo}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Download failed.");
    }
  };

  const edit = async (invNo: string) => {
    try {
      onEdit(await api.getInvoice(invNo));
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not load invoice.",
      );
    }
  };

  const cancel = async (invNo: string, version: number) => {
    if (!window.confirm(`Cancel invoice ${invNo}? This cannot be undone.`)) {
      return;
    }
    try {
      await api.cancelInvoice(invNo, version);
      await loadInvoices();
      showToast(`Invoice ${invNo} cancelled.`);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not cancel invoice.",
      );
    }
  };

  const exportCsv = async () => {
    try {
      await api.downloadCsv(filters);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "CSV export failed.");
    }
  };

  return (
    <div className="view-stack">
      <section className="filter-band">
        <div className="field compact">
          <label>From</label>
          <input
            className="input"
            type="date"
            value={filters.from}
            onChange={(event) => updateFilter("from", event.target.value)}
          />
        </div>
        <div className="field compact">
          <label>To</label>
          <input
            className="input"
            type="date"
            value={filters.to}
            onChange={(event) => updateFilter("to", event.target.value)}
          />
        </div>
        <div className="field compact">
          <label>GST Status</label>
          <select
            className="input"
            value={filters.gst}
            onChange={(event) => updateFilter("gst", event.target.value)}
          >
            <option value="">All</option>
            <option value="yes">GST Applied</option>
            <option value="no">No GST</option>
          </select>
        </div>
        <div className="field compact">
          <label>Invoice Status</label>
          <select
            className="input"
            value={filters.status}
            onChange={(event) => updateFilter("status", event.target.value)}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div className="field search-field">
          <label>Search</label>
          <div className="input-with-icon">
            <Search size={15} />
            <input
              value={filters.search}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Invoice no. or payee"
            />
          </div>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => void loadInvoices()}
        >
          <Search size={16} />
          Search
        </button>
        <button
          className="btn btn-outline"
          type="button"
          onClick={() => {
            setFilters(defaultFilters);
            void loadInvoices(defaultFilters);
          }}
        >
          <RotateCcw size={16} />
          Clear
        </button>
      </section>

      <section className="history-stats">
        <div>
          <span>Active invoices</span>
          <strong>{summary.count}</strong>
        </div>
        <div>
          <span>Filtered value</span>
          <strong>{formatCurrency(summary.total)}</strong>
        </div>
        <div>
          <span>GST invoices</span>
          <strong>{summary.gstCount}</strong>
        </div>
        <button
          className="btn btn-outline"
          type="button"
          onClick={() => void exportCsv()}
        >
          <FileSpreadsheet size={16} />
          Export CSV
        </button>
      </section>

      <section className="history-list">
        {loading ? (
          <div className="empty-state">Loading invoices...</div>
        ) : invoices.length ? (
          invoices.map((invoice) => {
            const hasGst =
              invoice.totalCGST + invoice.totalSGST + invoice.totalIGST > 0;
            return (
              <article
                className={`invoice-item ${invoice.status === "cancelled" ? "cancelled" : ""}`}
                key={invoice.invNo}
              >
                <div className="invoice-left">
                  <div className="invoice-number">
                    {invoice.invNo}
                    {invoice.status === "cancelled" ? (
                      <span className="status-badge danger">Cancelled</span>
                    ) : null}
                  </div>
                  <div className="invoice-party">{invoice.partyName}</div>
                  <div className="invoice-meta">
                    {formatDate(invoice.invDate)} - {invoice.items} items
                  </div>
                </div>
                <div className="invoice-right">
                  <span className={`gst-pill ${hasGst ? "on" : "off"}`}>
                    {hasGst ? "GST" : "No GST"}
                  </span>
                  <div className="invoice-amount">
                    {formatCurrency(invoice.netTotal)}
                  </div>
                  <button
                    className="btn btn-outline btn-small"
                    type="button"
                    onClick={() => redownload(invoice.invNo)}
                  >
                    <Download size={15} />
                    PDF
                  </button>
                  <button
                    className="btn btn-outline btn-small"
                    type="button"
                    onClick={() => edit(invoice.invNo)}
                  >
                    <Edit3 size={15} />
                    {invoice.workflowStatus === "checkedIn" &&
                    invoice.status !== "cancelled"
                      ? "Edit"
                      : "View"}
                  </button>
                  {invoice.status !== "cancelled" ? (
                    <>
                      <button
                        className="icon-button danger"
                        type="button"
                        onClick={() => cancel(invoice.invNo, invoice.version)}
                      >
                        <Ban size={16} />
                      </button>
                    </>
                  ) : null}
                </div>
              </article>
            );
          })
        ) : (
          <div className="empty-state">No invoices found.</div>
        )}
      </section>
    </div>
  );
}
