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
  organizationName,
}: SidebarProps) {
  let section = "";

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-name">{organizationName || "GST Invoice"}</div>
        <div className="sidebar-sub">Company Workspace</div>
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
    </aside>
  );
}
