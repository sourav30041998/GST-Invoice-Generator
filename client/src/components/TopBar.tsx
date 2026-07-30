import type { ViewName } from "./Sidebar";

type TopBarProps = {
  activeView: ViewName;
  presetName: string;
  editingInvoiceNo?: string | null;
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

export function TopBar({ activeView, presetName, editingInvoiceNo }: TopBarProps) {
  const meta = viewMeta[activeView];
  return (
    <header className="topbar">
      <div>
        <h1 className="page-title">{editingInvoiceNo ? `Editing ${editingInvoiceNo}` : meta.title}</h1>
        <p className="page-sub">{meta.sub}</p>
      </div>
      <span className="preset-badge">{presetName || "No preset loaded"}</span>
    </header>
  );
}
