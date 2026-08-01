import type { InvoiceFormHeaderState, InvoiceWorkflowStatus } from "../types";
import type { ViewName } from "./Sidebar";

type TopBarProps = {
  activeView: ViewName;
  presetName: string;
  formHeader?: InvoiceFormHeaderState | null;
};

const viewMeta: Record<ViewName, { title: string; sub: string }> = {
  create: {
    title: "Create Invoice",
    sub: "Fill in the details to generate a GST-compliant hotel invoice"
  },
  history: {
    title: "Invoice History",
    sub: "Browse, filter, update, cancel, and re-download past invoices"
  },
  settings: {
    title: "Load Preset JSON",
    sub: "Configure business details, logo, and database tools"
  },
  about: {
    title: "About & Help",
    sub: "GST preset reference and system notes"
  }
};

const workflowStatusLabels: Record<InvoiceWorkflowStatus, string> = {
  draft: "Draft",
  checkedIn: "Checked In",
  checkedOut: "Checked Out",
  cancelled: "Cancelled"
};

function invoiceSubtitle(invoiceNumber: string) {
  if (!invoiceNumber || invoiceNumber.toLowerCase().includes("not generated")) {
    return "Invoice number not generated yet";
  }

  return `Invoice ${invoiceNumber}`;
}

export function TopBar({ activeView, presetName, formHeader }: TopBarProps) {
  const meta = viewMeta[activeView];
  const title = formHeader ? `${workflowStatusLabels[formHeader.workflowStatus]} Invoice` : meta.title;
  const sub = formHeader ? invoiceSubtitle(formHeader.invoiceNumber) : meta.sub;
  const saveLabel = formHeader?.saveState === "unsaved" ? "Unsaved *" : "Saved";

  return (
    <header className="topbar">
      <div className="topbar-copy">
        <div className="page-title-row">
          <h1 className="page-title">{title}</h1>
          {formHeader ? <span className={`save-indicator ${formHeader.saveState}`}>{saveLabel}</span> : null}
        </div>
        <p className="page-sub">{sub}</p>
      </div>
      <span className="preset-badge">{presetName || "No preset loaded"}</span>
    </header>
  );
}