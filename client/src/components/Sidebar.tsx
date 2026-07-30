import { Clock, FilePlus2, HelpCircle, Settings, UploadCloud } from "lucide-react";

export type ViewName = "create" | "history" | "settings" | "about";

type SidebarProps = {
  activeView: ViewName;
  onViewChange: (view: ViewName) => void;
  dbReady: boolean;
};

const navItems = [
  { view: "create" as const, label: "New Invoice", icon: FilePlus2, section: "Invoices" },
  { view: "history" as const, label: "Invoice History", icon: Clock, section: "Invoices" },
  { view: "settings" as const, label: "Load Preset JSON", icon: UploadCloud, section: "Setup" },
  { view: "about" as const, label: "About & Help", icon: HelpCircle, section: "Setup" }
];

export function Sidebar({ activeView, onViewChange, dbReady }: SidebarProps) {
  let section = "";

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-name">GST Invoice</div>
        <div className="sidebar-sub">Pro Generator</div>
        <div className="db-badge">{dbReady ? "MongoDB Online" : "Connecting"}</div>
      </div>

      <div className="db-status">{dbReady ? "Database ready" : "Checking database"}</div>

      <nav className="nav-list">
        {navItems.map((item) => {
          const Icon = item.icon;
          const sectionChanged = section !== item.section;
          section = item.section;

          return (
            <div key={item.view}>
              {sectionChanged ? <span className="sidebar-section">{item.section}</span> : null}
              <button
                className={`nav-button ${activeView === item.view ? "active" : ""}`}
                onClick={() => onViewChange(item.view)}
                type="button"
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            </div>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        GST Compliant - India
        <br />
        Data stored in MongoDB
        <br />
        v6.0
      </div>
    </aside>
  );
}
