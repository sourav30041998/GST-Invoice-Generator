import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { AboutView } from "./components/AboutView";
import { HistoryView } from "./components/HistoryView";
import { InvoiceForm } from "./components/InvoiceForm";
import { SettingsView } from "./components/SettingsView";
import { Sidebar, type ViewName } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Toast } from "./components/Toast";
import { defaultPreset } from "./constants";
import type { Invoice, Settings } from "./types";
import { todayIso } from "./utils/dates";

const defaultSettings: Settings = {
  preset: defaultPreset,
  logoDataUrl: null
};

export default function App() {
  const [activeView, setActiveView] = useState<ViewName>("create");
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [dbReady, setDbReady] = useState(false);
  const [nextInvoiceNo, setNextInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [toast, setToast] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
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
    [settings.preset.invoice_prefix]
  );

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const loadedSettings = await api.getSettings();
        setSettings(loadedSettings);
        setDbReady(true);
        await refreshNextNumber(invoiceDate, loadedSettings.preset.invoice_prefix);
      } catch (error) {
        setDbReady(false);
        showToast(error instanceof Error ? error.message : "Could not connect to API.");
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
    [refreshNextNumber]
  );

  const handleSaved = (invoice: Invoice) => {
    setRefreshKey((key) => key + 1);
    setEditingInvoice(null);
    void refreshNextNumber(invoiceDate);
    if (invoice.status !== "cancelled") {
      setActiveView("history");
    }
  };

  const handleEdit = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setActiveView("create");
  };

  const handleSettingsChange = (nextSettings: Settings) => {
    setSettings(nextSettings);
    void refreshNextNumber(invoiceDate, nextSettings.preset.invoice_prefix);
  };

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} onViewChange={setActiveView} dbReady={dbReady} />
      <main className="main-shell">
        <TopBar activeView={activeView} presetName={settings.preset.business_name} editingInvoiceNo={editingInvoice?.invNo} />
        <div className="content-shell">
          {activeView === "create" ? (
            <InvoiceForm
              settings={settings}
              nextInvoiceNo={nextInvoiceNo}
              editingInvoice={editingInvoice}
              onInvoiceDateChange={handleInvoiceDateChange}
              onSaved={handleSaved}
              onCancelEdit={() => setEditingInvoice(null)}
              showToast={showToast}
            />
          ) : null}
          {activeView === "history" ? (
            <HistoryView settings={settings} refreshKey={refreshKey} onEdit={handleEdit} showToast={showToast} />
          ) : null}
          {activeView === "settings" ? (
            <SettingsView
              settings={settings}
              onSettingsChange={handleSettingsChange}
              onDatabaseCleared={() => {
                setRefreshKey((key) => key + 1);
                setEditingInvoice(null);
                void refreshNextNumber(todayIso(), defaultPreset.invoice_prefix);
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