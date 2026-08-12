import type { ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Download,
  ImagePlus,
  Landmark,
  Save,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { api } from "../api";
import { defaultPreset } from "../constants";
import type { Preset, Settings } from "../types";

type SettingsViewProps = {
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  onDatabaseCleared: () => void;
  showToast: (message: string) => void;
};

const MAX_PRESET_FILE_SIZE = 100 * 1024;
const MAX_LOGO_FILE_SIZE = 1_000_000;

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function readImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function downloadSamplePreset() {
  const blob = new Blob([JSON.stringify(defaultPreset, null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "sample-stay-hotel-preset.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "CO"
  );
}

export function SettingsView({
  settings,
  onSettingsChange,
  onDatabaseCleared,
  showToast,
}: SettingsViewProps) {
  const [form, setForm] = useState<Preset>(settings.preset);
  const [saving, setSaving] = useState(false);
  const logoInitials = useMemo(
    () => initials(form.business_name),
    [form.business_name],
  );

  useEffect(() => {
    setForm(settings.preset);
  }, [settings.preset]);

  const updateField = (field: keyof Preset, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const { preset } = await api.updatePreset(form);
      onSettingsChange({ ...settings, preset });
      showToast("Company profile saved.");
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Could not save company profile.",
      );
    } finally {
      setSaving(false);
    }
  };

  const uploadPreset = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    if (file.size > MAX_PRESET_FILE_SIZE) {
      showToast("Preset file is too large.");
      return;
    }

    try {
      const json = JSON.parse(await readFile(file)) as Preset;
      const { preset } = await api.updatePreset(json);
      setForm(preset);
      onSettingsChange({ ...settings, preset });
      showToast("Company preset loaded.");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Invalid preset file.",
      );
    }
  };

  const uploadLogo = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    if (file.size > MAX_LOGO_FILE_SIZE) {
      showToast("Logo must be 1 MB or smaller.");
      return;
    }

    try {
      const dataUrl = await readImage(file);
      const { logoDataUrl } = await api.updateLogo(dataUrl);
      onSettingsChange({ ...settings, logoDataUrl });
      showToast("Company logo saved.");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not upload logo.",
      );
    }
  };

  const clearLogo = async () => {
    if (!window.confirm("Remove the company logo?")) {
      return;
    }
    try {
      await api.deleteLogo();
      onSettingsChange({ ...settings, logoDataUrl: null });
      showToast("Company logo removed.");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not remove logo.",
      );
    }
  };

  const clearCompanyData = async () => {
    if (
      !window.confirm(
        "Delete invoices, drafts, counters, and audit history for this company?",
      )
    ) {
      return;
    }
    if (
      !window.confirm(
        "This cannot be undone. Delete this company’s invoice data?",
      )
    ) {
      return;
    }
    try {
      await api.clearDatabase();
      onDatabaseCleared();
      showToast("Company invoice data cleared.");
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Could not clear company data.",
      );
    }
  };

  const handleLogoInput = (event: ChangeEvent<HTMLInputElement>) => {
    void uploadLogo(event.target.files?.[0]);
    event.target.value = "";
  };

  return (
    <div className="view-stack">
      <section className="company-profile-hero">
        <div className="company-avatar">
          {settings.logoDataUrl ? (
            <img
              src={settings.logoDataUrl}
              alt={`${form.business_name} logo`}
            />
          ) : (
            logoInitials
          )}
        </div>
        <div>
          <span className="company-eyebrow">Private company workspace</span>
          <h2>{form.business_name || "Your company"}</h2>
          <p>
            {form.gstin
              ? `GSTIN ${form.gstin}`
              : "Complete the business profile before issuing invoices."}
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <Building2 size={16} />
          <span>Business Details</span>
        </div>
        <div className="company-profile-grid">
          <label className="field span-2">
            <span>Business Name</span>
            <input
              className="input"
              value={form.business_name}
              onChange={(event) =>
                updateField("business_name", event.target.value)
              }
              required
            />
          </label>
          <label className="field span-2">
            <span>Tagline</span>
            <input
              className="input"
              value={form.tagline || ""}
              onChange={(event) => updateField("tagline", event.target.value)}
            />
          </label>
          <label className="field span-2">
            <span>GSTIN</span>
            <input
              className="input"
              value={form.gstin || ""}
              onChange={(event) => updateField("gstin", event.target.value)}
            />
          </label>
          <label className="field span-2">
            <span>Invoice Prefix</span>
            <input
              className="input"
              value={form.invoice_prefix}
              onChange={(event) =>
                updateField("invoice_prefix", event.target.value.toUpperCase())
              }
              maxLength={8}
              required
            />
          </label>
          <label className="field span-3">
            <span>Address Line 1</span>
            <input
              className="input"
              value={form.address_line1 || ""}
              onChange={(event) =>
                updateField("address_line1", event.target.value)
              }
            />
          </label>
          <label className="field span-3">
            <span>Address Line 2</span>
            <input
              className="input"
              value={form.address_line2 || ""}
              onChange={(event) =>
                updateField("address_line2", event.target.value)
              }
            />
          </label>
          <label className="field span-2">
            <span>Phone</span>
            <input
              className="input"
              value={form.phone || ""}
              onChange={(event) => updateField("phone", event.target.value)}
            />
          </label>
          <label className="field span-2">
            <span>Email</span>
            <input
              className="input"
              type="email"
              value={form.email || ""}
              onChange={(event) => updateField("email", event.target.value)}
            />
          </label>
          <label className="field span-2">
            <span>Website</span>
            <input
              className="input"
              value={form.website || ""}
              onChange={(event) => updateField("website", event.target.value)}
            />
          </label>
          <label className="field full">
            <span>Invoice Terms</span>
            <textarea
              className="input textarea-input"
              value={form.terms || ""}
              onChange={(event) => updateField("terms", event.target.value)}
              rows={4}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <Landmark size={16} />
          <span>Banking and Payments</span>
        </div>
        <div className="company-profile-grid">
          <label className="field span-3">
            <span>Account Name</span>
            <input
              className="input"
              value={form.bank_acc_name || ""}
              onChange={(event) =>
                updateField("bank_acc_name", event.target.value)
              }
            />
          </label>
          <label className="field span-3">
            <span>Bank Name</span>
            <input
              className="input"
              value={form.bank_name || ""}
              onChange={(event) => updateField("bank_name", event.target.value)}
            />
          </label>
          <label className="field span-2">
            <span>Account Number</span>
            <input
              className="input"
              value={form.bank_account || ""}
              onChange={(event) =>
                updateField("bank_account", event.target.value)
              }
            />
          </label>
          <label className="field span-2">
            <span>IFSC</span>
            <input
              className="input"
              value={form.bank_ifsc || ""}
              onChange={(event) =>
                updateField("bank_ifsc", event.target.value.toUpperCase())
              }
            />
          </label>
          <label className="field span-2">
            <span>UPI ID</span>
            <input
              className="input"
              value={form.upi || ""}
              onChange={(event) => updateField("upi", event.target.value)}
            />
          </label>
        </div>
        <div className="button-row profile-save-row">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => void saveProfile()}
            disabled={saving}
          >
            <Save size={16} />
            {saving ? "Saving..." : "Save Company Profile"}
          </button>
        </div>
      </section>

      <section className="settings-grid">
        <div className="panel compact-panel">
          <div className="panel-title">
            <ImagePlus size={16} />
            <span>Company Logo</span>
          </div>
          <div className="logo-row">
            {settings.logoDataUrl ? (
              <img
                className="logo-preview"
                src={settings.logoDataUrl}
                alt={`${form.business_name} logo`}
              />
            ) : (
              <div
                className="logo-preview logo-placeholder"
                aria-label="No company logo uploaded"
              >
                {logoInitials}
              </div>
            )}
            <label className="btn btn-outline file-button">
              <ImagePlus size={16} />
              Upload Logo
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={handleLogoInput}
              />
            </label>
            {settings.logoDataUrl ? (
              <button
                className="btn btn-outline danger-text"
                type="button"
                onClick={() => void clearLogo()}
              >
                <Trash2 size={16} />
                Remove
              </button>
            ) : null}
          </div>
        </div>

        <div className="panel compact-panel">
          <div className="panel-title">
            <UploadCloud size={16} />
            <span>Preset File</span>
          </div>
          <div className="button-row preset-actions">
            <label className="btn btn-outline file-button">
              <UploadCloud size={16} />
              Import JSON
              <input
                type="file"
                accept=".json,application/json"
                onChange={(event) => void uploadPreset(event.target.files?.[0])}
              />
            </label>
            <button
              className="btn btn-outline"
              type="button"
              onClick={downloadSamplePreset}
            >
              <Download size={16} />
              Sample JSON
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <Trash2 size={16} />
          <span>Company Data</span>
        </div>
        <div className="danger-zone">
          <div>
            <strong>Clear company invoice data</strong>
            <p>
              Only this company’s invoices, drafts, counters, and audit history
              are removed. The company profile remains protected.
            </p>
          </div>
          <button
            className="btn btn-outline danger-text"
            type="button"
            onClick={() => void clearCompanyData()}
          >
            <Trash2 size={16} />
            Clear Invoice Data
          </button>
        </div>
      </section>
    </div>
  );
}
