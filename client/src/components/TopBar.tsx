import { LogOut } from "lucide-react";
import type {
  AuthStatus,
  InvoiceFormHeaderState,
  InvoiceWorkflowStatus,
} from "../types";
import type { ViewName } from "./Sidebar";

type TopBarProps = {
  activeView: ViewName;
  presetName: string;
  formHeader?: InvoiceFormHeaderState | null;
  authStatus?: AuthStatus | null;
  onLogout?: () => void;
};

const viewMeta: Record<ViewName, { title: string; sub: string }> = {
  create: {
    title: "Create Invoice",
    sub: "Fill in the details to generate a GST-compliant hotel invoice",
  },
  history: {
    title: "Invoice History",
    sub: "Browse, filter, update, cancel, and re-download past invoices",
  },
  customers: {
    title: "Customer Desk",
    sub: "Manage enquiries, confirmed stays, advances, and customer receipts",
  },
  rooms: {
    title: "Room Directory",
    sub: "Manage rooms available to this organization’s invoices",
  },
  settings: {
    title: "Company Profile",
    sub: "Manage the business details used by this company’s invoices",
  },
  about: {
    title: "About & Help",
    sub: "System notes and invoice guidance",
  },
};

const workflowStatusLabels: Record<InvoiceWorkflowStatus, string> = {
  draft: "Draft",
  reserved: "Reserved",
  checkedIn: "Checked In",
  checkedOut: "Checked Out",
  cancelled: "Cancelled",
};

function invoiceSubtitle(invoiceNumber: string) {
  if (!invoiceNumber || invoiceNumber.toLowerCase().includes("not generated")) {
    return "Invoice number not generated yet";
  }

  return `Invoice ${invoiceNumber}`;
}

export function TopBar({
  activeView,
  presetName,
  formHeader,
  authStatus,
  onLogout,
}: TopBarProps) {
  const meta = viewMeta[activeView];
  const title = formHeader
    ? `${workflowStatusLabels[formHeader.workflowStatus]} Invoice`
    : meta.title;
  const sub = formHeader ? invoiceSubtitle(formHeader.invoiceNumber) : meta.sub;
  const saveLabel = formHeader?.saveState === "unsaved" ? "Unsaved *" : "Saved";

  return (
    <header className="topbar">
      <div className="topbar-copy">
        <div className="page-title-row">
          <h1 className="page-title">{title}</h1>
          {formHeader ? (
            <span className={`save-indicator ${formHeader.saveState}`}>
              {saveLabel}
            </span>
          ) : null}
        </div>
        <p className="page-sub">{sub}</p>
      </div>
      <div className="topbar-actions">
        {authStatus?.authRequired && authStatus.authenticated ? (
          <>
            <span className="security-badge">Secure Session</span>
            <span className="organization-badge">
              {authStatus.organization?.name || presetName}
            </span>
            <button
              className="icon-button"
              type="button"
              onClick={onLogout}
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </>
        ) : null}
        <span className="preset-badge">{presetName || "No preset loaded"}</span>
      </div>
    </header>
  );
}
