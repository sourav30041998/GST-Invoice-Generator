import {
  BedDouble,
  Building2,
  Clock,
  FilePlus2,
  HelpCircle,
  UsersRound,
} from "lucide-react";

export type ViewName =
  | "create"
  | "history"
  | "customers"
  | "rooms"
  | "settings"
  | "about";

type SidebarProps = {
  activeView: ViewName;
  onViewChange: (view: ViewName) => void;
  dbReady: boolean;
  organizationName: string;
};

const navItems = [
  {
    view: "create" as const,
    label: "New Invoice",
    icon: FilePlus2,
    section: "Invoices",
  },
  {
    view: "history" as const,
    label: "Invoice History",
    icon: Clock,
    section: "Invoices",
  },
  {
    view: "customers" as const,
    label: "Customers",
    icon: UsersRound,
    section: "Bookings",
  },
  {
    view: "rooms" as const,
    label: "Room Directory",
    icon: BedDouble,
    section: "Company",
  },
  {
    view: "settings" as const,
    label: "Company Profile",
    icon: Building2,
    section: "Company",
  },
  {
    view: "about" as const,
    label: "About & Help",
    icon: HelpCircle,
    section: "Setup",
  },
];

export function Sidebar({
  activeView,
  onViewChange,
  dbReady,
  organizationName,
}: SidebarProps) {
  let section = "";

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-name">{organizationName || "GST Invoice"}</div>
        <div className="sidebar-sub">Private Workspace</div>
        <div className="db-badge">
          {dbReady ? "MongoDB Online" : "Connecting"}
        </div>
      </div>

      <div className="db-status">
        {dbReady ? "Database ready" : "Checking database"}
      </div>

      <nav className="nav-list">
        {navItems.map((item) => {
          const Icon = item.icon;
          const sectionChanged = section !== item.section;
          section = item.section;

          return (
            <div key={item.view}>
              {sectionChanged ? (
                <span className="sidebar-section">{item.section}</span>
              ) : null}
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
