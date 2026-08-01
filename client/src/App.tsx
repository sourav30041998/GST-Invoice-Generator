import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { AboutView } from "./components/AboutView";
import { HistoryView } from "./components/HistoryView";
import { InvoiceForm } from "./components/InvoiceForm";
import { NewInvoiceStart } from "./components/NewInvoiceStart";
import { SettingsView } from "./components/SettingsView";
import { Sidebar, type ViewName } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Toast } from "./components/Toast";
import { defaultPreset } from "./constants";
import type {
  Invoice,
  InvoiceDraft,
  InvoiceFormHeaderState,
  InvoiceWorkflowStatus,
  Settings,
} from "./types";
import { todayIso } from "./utils/dates";

const defaultSettings: Settings = {
  preset: defaultPreset,
  logoDataUrl: null,
};

function invoiceWorkflowStatus(invoice: Invoice): InvoiceWorkflowStatus {
  if (invoice.workflowStatus) {
    return invoice.workflowStatus;
  }

  return invoice.status === "cancelled" ? "cancelled" : "checkedOut";
}

export default function App() {
  const [activeView, setActiveView] = useState<ViewName>("create");
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [dbReady, setDbReady] = useState(false);
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

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const loadedSettings = await api.getSettings();
        setSettings(loadedSettings);
        setDbReady(true);
        await refreshNextNumber(
          invoiceDate,
          loadedSettings.preset.invoice_prefix,
        );
      } catch (error) {
        setDbReady(false);
        showToast(
          error instanceof Error ? error.message : "Could not connect to API.",
        );
      }
    };
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    void refreshNextNumber(invoiceDate, nextSettings.preset.invoice_prefix);
  };

  return (
    <div className="app-shell">
      <Sidebar
        activeView={activeView}
        onViewChange={handleViewChange}
        dbReady={dbReady}
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
        />
        <div className="content-shell">
          {activeView === "create" &&
          (invoiceFormOpen || editingInvoice || activeDraft) ? (
            <InvoiceForm
              nextInvoiceNo={nextInvoiceNo}
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
              settings={settings}
              refreshKey={refreshKey}
              onEdit={handleEdit}
              showToast={showToast}
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
          {activeView === "about" ? <AboutView settings={settings} /> : null}
        </div>
      </main>
      <Toast message={toast} />
    </div>
  );
}
