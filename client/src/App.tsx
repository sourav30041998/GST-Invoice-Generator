import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { api } from "./api";
import { AboutView } from "./components/AboutView";
import { HistoryView } from "./components/HistoryView";
import { InvoiceForm } from "./components/InvoiceForm";
import { InvitationAcceptanceView } from "./components/InvitationAcceptanceView";
import { LoginView } from "./components/LoginView";
import { PasswordRecoveryView } from "./components/PasswordRecoveryView";
import { NewInvoiceStart } from "./components/NewInvoiceStart";
import { RoomDirectoryView } from "./components/RoomDirectoryView";
import { SettingsView } from "./components/SettingsView";
import { Sidebar, type ViewName } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Toast } from "./components/Toast";
import { defaultPreset, defaultTaxPresets } from "./constants";
import type {
  AuthStatus,
  Invoice,
  InvoiceDraft,
  InvoiceFormHeaderState,
  InvoiceWorkflowStatus,
  Settings,
} from "./types";
import { todayIso } from "./utils/dates";

const CustomerWorkspaceView = lazy(() =>
  import("./components/CustomerWorkspaceView").then((module) => ({
    default: module.CustomerWorkspaceView,
  })),
);

const defaultSettings: Settings = {
  preset: defaultPreset,
  taxPresets: defaultTaxPresets,
  logoDataUrl: null,
};

function invoiceWorkflowStatus(invoice: Invoice): InvoiceWorkflowStatus {
  if (invoice.workflowStatus) {
    return invoice.workflowStatus;
  }

  return invoice.status === "cancelled" ? "cancelled" : "checkedOut";
}

export default function App() {
  const invitationToken = new URLSearchParams(
    window.location.hash.replace(/^#/, ""),
  ).get("invite");
  const [activeView, setActiveView] = useState<ViewName>("create");
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [authRetryKey, setAuthRetryKey] = useState(0);
  const [authScreen, setAuthScreen] = useState<"login" | "recovery">("login");
  const [nextInvoiceNo, setNextInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [toast, setToast] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [activeDraft, setActiveDraft] = useState<InvoiceDraft | null>(null);
  const [invoiceFormOpen, setInvoiceFormOpen] = useState(false);
  const [formHeader, setFormHeader] = useState<InvoiceFormHeaderState | null>(
    null,
  );
  const toastTimer = useRef<number>();

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3200);
  }, []);

  const refreshNextNumber = useCallback(
    async (date: string, prefix = settings.preset.invoice_prefix) => {
      try {
        const { invNo } = await api.nextInvoiceNumber(prefix || "INV", date);
        setNextInvoiceNo(invNo);
      } catch {
        setNextInvoiceNo("");
      }
    },
    [settings.preset.invoice_prefix],
  );

  const loadProtectedWorkspace = useCallback(
    async (date = invoiceDate) => {
      const loadedSettings = await api.getSettings();
      setSettings(loadedSettings);
      await refreshNextNumber(date, loadedSettings.preset.invoice_prefix);
    },
    [invoiceDate, refreshNextNumber],
  );

  useEffect(() => {
    if (invitationToken) {
      setBootstrapped(true);
      return;
    }

    const bootstrap = async () => {
      try {
        const status = await api.authStatus();
        setAuthStatus(status);

        if (status.authenticated) {
          await loadProtectedWorkspace();
          return;
        }
      } catch (error) {
        showToast(
          error instanceof Error
            ? error.message
            : "Could not open your workspace. Please try again.",
        );
      } finally {
        setBootstrapped(true);
      }
    };
    void bootstrap();
  }, [authRetryKey, invitationToken, loadProtectedWorkspace, showToast]);

  const handleAuthenticated = async (
    status: AuthStatus,
    firstAccess = false,
  ) => {
    setAuthScreen("login");
    setAuthStatus(status);
    try {
      await loadProtectedWorkspace();
      if (firstAccess) {
        setActiveView("settings");
        showToast("Workspace activated. Complete your business profile.");
      } else {
        showToast("Signed in.");
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not load workspace.",
      );
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // The local session is cleared even if the server already expired it.
    }

    setAuthStatus((current) =>
      current
        ? {
            ...current,
            authenticated: false,
            csrfToken: null,
            user: null,
            organization: null,
          }
        : null,
    );
    setSettings(defaultSettings);
    setEditingInvoice(null);
    setActiveDraft(null);
    setFormHeader(null);
    setInvoiceFormOpen(false);
    setActiveView("create");
    setAuthScreen("login");
    showToast("Signed out.");
  };

  const handleInvoiceDateChange = useCallback(
    (date: string) => {
      setInvoiceDate(date);
      void refreshNextNumber(date);
    },
    [refreshNextNumber],
  );

  const handleSaved = (invoice: Invoice, closeAfterSave: boolean) => {
    setActiveDraft(null);
    setRefreshKey((key) => key + 1);
    void refreshNextNumber(invoiceDate);
    if (closeAfterSave) {
      setEditingInvoice(null);
      setFormHeader(null);
      setInvoiceFormOpen(false);
      return;
    }

    setFormHeader({
      workflowStatus: invoiceWorkflowStatus(invoice),
      invoiceNumber: invoice.invNo,
      saveState: "saved",
    });
    setEditingInvoice(invoice);
    setInvoiceFormOpen(true);
  };

  const handleDraftSaved = (closeAfterSave: boolean) => {
    setRefreshKey((key) => key + 1);
    if (closeAfterSave) {
      setEditingInvoice(null);
      setActiveDraft(null);
      setFormHeader(null);
      setInvoiceFormOpen(false);
    }
  };

  const handleEdit = (invoice: Invoice) => {
    setActiveDraft(null);
    setFormHeader({
      workflowStatus: invoiceWorkflowStatus(invoice),
      invoiceNumber: invoice.invNo,
      saveState: "saved",
    });
    setEditingInvoice(invoice);
    setInvoiceFormOpen(true);
    setActiveView("create");
  };

  const handleViewChange = (view: ViewName) => {
    setActiveView(view);
    if (view !== "create") {
      setEditingInvoice(null);
      setActiveDraft(null);
      setFormHeader(null);
      setInvoiceFormOpen(false);
      return;
    }

    if (!editingInvoice) {
      setFormHeader(null);
      setInvoiceFormOpen(false);
    }
  };

  const handleStartInvoice = () => {
    setEditingInvoice(null);
    setActiveDraft(null);
    setFormHeader({
      workflowStatus: "draft",
      invoiceNumber: "Not generated for draft",
      saveState: "unsaved",
    });
    setInvoiceFormOpen(true);
  };

  const handleOpenDraft = async (draftId: string) => {
    try {
      const draft = await api.getInvoiceDraft(draftId);
      setEditingInvoice(null);
      setFormHeader({
        workflowStatus: draft.workflowStatus,
        invoiceNumber: "Not generated for draft",
        saveState: "saved",
      });
      setActiveDraft(draft);
      setInvoiceFormOpen(true);
      setActiveView("create");
    } catch (error) {
      setRefreshKey((key) => key + 1);
      showToast(
        error instanceof Error ? error.message : "Draft could not be found.",
      );
    }
  };

  const handleOpenInvoice = async (
    invNo: string,
    workflowStatus: InvoiceWorkflowStatus,
  ) => {
    try {
      const invoice = await api.getInvoice(invNo);
      const invoiceWithStatus = { ...invoice, workflowStatus };
      setActiveDraft(null);
      setFormHeader({
        workflowStatus,
        invoiceNumber: invNo,
        saveState: "saved",
      });
      setEditingInvoice(invoiceWithStatus);
      setInvoiceFormOpen(true);
      setActiveView("create");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not open invoice.",
      );
    }
  };

  const handleBackToInvoiceView = () => {
    setRefreshKey((key) => key + 1);
    setEditingInvoice(null);
    setActiveDraft(null);
    setFormHeader(null);
    setInvoiceFormOpen(false);
    setActiveView("create");
  };

  const handleSettingsChange = (nextSettings: Settings) => {
    setSettings(nextSettings);
    setAuthStatus((current) =>
      current?.organization
        ? {
            ...current,
            organization: {
              ...current.organization,
              name: nextSettings.preset.business_name,
            },
          }
        : current,
    );
    void refreshNextNumber(invoiceDate, nextSettings.preset.invoice_prefix);
  };

  if (invitationToken) {
    return (
      <>
        <InvitationAcceptanceView
          token={invitationToken}
          onAccepted={(status) => void handleAuthenticated(status, true)}
          showToast={showToast}
        />
        <Toast message={toast} />
      </>
    );
  }

  if (!bootstrapped) {
    return (
      <>
        <div className="auth-shell">
          <div className="auth-panel auth-loading">
            Loading your workspace...
          </div>
        </div>
        <Toast message={toast} />
      </>
    );
  }

  if (!authStatus) {
    return (
      <>
        <div className="auth-shell">
          <div className="auth-layout">
            <section className="auth-intro" aria-hidden="true">
              <div className="auth-brand-mark">
                <ShieldAlert size={22} />
              </div>
              <p className="auth-kicker">GST Invoice Workspace</p>
              <h1>Your company data stays protected.</h1>
              <div className="auth-trust-row">
                <ShieldAlert size={17} />
                <span>Private company workspace</span>
              </div>
            </section>
            <section className="auth-panel auth-panel-wide auth-unavailable">
              <div className="auth-icon">
                <ShieldAlert size={22} />
              </div>
              <h2>Workspace unavailable</h2>
              <p>
                We could not open your workspace. Please try again.
                No company data has been loaded.
              </p>
              <button
                className="btn btn-primary btn-large"
                type="button"
                onClick={() => {
                  setBootstrapped(false);
                  setAuthRetryKey((key) => key + 1);
                }}
              >
                <span>Retry connection</span>
                <RefreshCw size={16} />
              </button>
            </section>
          </div>
        </div>
        <Toast message={toast} />
      </>
    );
  }

  if (authStatus.authRequired && !authStatus.authenticated) {
    if (authScreen === "recovery") {
      return (
        <>
          <PasswordRecoveryView onBackToLogin={() => setAuthScreen("login")} />
          <Toast message={toast} />
        </>
      );
    }

    return (
      <>
        <LoginView
          onAuthenticated={handleAuthenticated}
          onForgotPassword={() => setAuthScreen("recovery")}
          showToast={showToast}
        />
        <Toast message={toast} />
      </>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        activeView={activeView}
        onViewChange={handleViewChange}
        organizationName={
          authStatus?.organization?.name || settings.preset.business_name
        }
      />
      <main className="main-shell">
        <TopBar
          activeView={activeView}
          presetName={settings.preset.business_name}
          formHeader={
            activeView === "create" &&
            (invoiceFormOpen || editingInvoice || activeDraft)
              ? formHeader
              : null
          }
          authStatus={authStatus}
          onLogout={handleLogout}
        />
        <div className="content-shell">
          {activeView === "create" &&
          (invoiceFormOpen || editingInvoice || activeDraft) ? (
            <InvoiceForm
              nextInvoiceNo={nextInvoiceNo}
              taxPresets={settings.taxPresets}
              editingInvoice={editingInvoice}
              activeDraft={activeDraft}
              onInvoiceDateChange={handleInvoiceDateChange}
              onSaved={handleSaved}
              onDraftSaved={handleDraftSaved}
              onHeaderStateChange={setFormHeader}
              onBack={handleBackToInvoiceView}
              showToast={showToast}
            />
          ) : null}
          {activeView === "create" &&
          !invoiceFormOpen &&
          !editingInvoice &&
          !activeDraft ? (
            <NewInvoiceStart
              refreshKey={refreshKey}
              onCreate={handleStartInvoice}
              onOpenDraft={handleOpenDraft}
              onOpenInvoice={handleOpenInvoice}
              showToast={showToast}
            />
          ) : null}
          {activeView === "history" ? (
            <HistoryView
              refreshKey={refreshKey}
              onEdit={handleEdit}
              showToast={showToast}
            />
          ) : null}
          {activeView === "customers" ? (
            <Suspense
              fallback={
                <div className="customer-page-lock customer-route-loader">
                  <div className="orbit-loader"><i /><i /><i /></div>
                  <strong>Opening customer desk...</strong>
                </div>
              }
            >
              <CustomerWorkspaceView
                settings={settings}
                showToast={showToast}
              />
            </Suspense>
          ) : null}
          {activeView === "rooms" ? (
            <RoomDirectoryView
              showToast={showToast}
              onOpenInvoice={handleOpenInvoice}
            />
          ) : null}
          {activeView === "settings" ? (
            <SettingsView
              settings={settings}
              onSettingsChange={handleSettingsChange}
              onDatabaseCleared={() => {
                setRefreshKey((key) => key + 1);
                setEditingInvoice(null);
                setActiveDraft(null);
                setFormHeader(null);
                setInvoiceFormOpen(false);
                void refreshNextNumber(
                  todayIso(),
                  defaultPreset.invoice_prefix,
                );
              }}
              showToast={showToast}
            />
          ) : null}
          {activeView === "about" ? <AboutView /> : null}
        </div>
      </main>
      <Toast message={toast} />
    </div>
  );
}
