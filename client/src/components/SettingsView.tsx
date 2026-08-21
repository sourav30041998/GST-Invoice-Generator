import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgePercent,
  Building2,
  Download,
  ImagePlus,
  Landmark,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { api } from "../api";
import { defaultPreset } from "../constants";
import type { Preset, Settings, TaxPreset } from "../types";

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

function validateTaxPresets(taxPresets: TaxPreset[]) {
  if (taxPresets.length === 0) {
    return "Add at least one reusable GST preset.";
  }

  if (taxPresets.length > 20) {
    return "A maximum of 20 GST presets is allowed.";
  }

  for (const preset of taxPresets) {
    if (!preset.label.trim()) {
      return "Every GST preset needs a name.";
    }

    if (
      preset.key.trim().toLowerCase() === "custom" ||
      preset.label.trim().toLowerCase() === "custom"
    ) {
      return "Custom is reserved for invoice-only entries.";
    }

    if (!/^[A-Z0-9/-]*$/i.test(preset.hsn.trim())) {
      return `${preset.label}: HSN/SAC contains unsupported characters.`;
    }

    const rates = [preset.cgstRate, preset.sgstRate, preset.igstRate];
    if (
      rates.some((rate) => !Number.isFinite(rate) || rate < 0 || rate > 100)
    ) {
      return `${preset.label}: tax rates must be between 0% and 100%.`;
    }
    if (
      (preset.cgstRate > 0 || preset.sgstRate > 0) &&
      preset.cgstRate !== preset.sgstRate
    ) {
      return `${preset.label}: CGST and SGST must be equal.`;
    }
    if (preset.igstRate > 0 && (preset.cgstRate > 0 || preset.sgstRate > 0)) {
      return `${preset.label}: use either CGST/SGST or IGST.`;
    }
  }

  return "";
}

function createTaxPreset(): TaxPreset {
  return {
    key: `preset-${crypto.randomUUID()}`,
    label: "",
    hsn: "",
    cgstRate: 0,
    sgstRate: 0,
    igstRate: 0,
    allowInclusive: true,
    note: "",
  };
}

export function SettingsView({
  settings,
  onSettingsChange,
  onDatabaseCleared,
  showToast,
}: SettingsViewProps) {
  const [form, setForm] = useState<Preset>(settings.preset);
  const [taxPresetForm, setTaxPresetForm] = useState<TaxPreset[]>(
    settings.taxPresets,
  );
  const [saving, setSaving] = useState(false);
  const [savingTaxPresets, setSavingTaxPresets] = useState(false);
  const [newTaxPreset, setNewTaxPreset] = useState<TaxPreset | null>(null);
  const [newTaxPresetError, setNewTaxPresetError] = useState("");
  const [savingNewTaxPreset, setSavingNewTaxPreset] = useState(false);
  const addTaxPresetButtonRef = useRef<HTMLButtonElement>(null);
  const taxPresetDialogRef = useRef<HTMLElement>(null);
  const taxPresetNameInputRef = useRef<HTMLInputElement>(null);
  const newTaxPresetOpen = newTaxPreset !== null;
  const logoInitials = useMemo(
    () => initials(form.business_name),
    [form.business_name],
  );

  useEffect(() => {
    setForm(settings.preset);
  }, [settings.preset]);

  useEffect(() => {
    setTaxPresetForm(settings.taxPresets.map((preset) => ({ ...preset })));
  }, [settings.taxPresets]);

  useEffect(() => {
    if (!newTaxPresetOpen) return;

    const previousOverflow = document.body.style.overflow;
    const focusableSelector =
      "button:not([disabled]), input:not([disabled]), textarea:not([disabled])";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingNewTaxPreset) {
        setNewTaxPreset(null);
        setNewTaxPresetError("");
        window.setTimeout(() => addTaxPresetButtonRef.current?.focus(), 0);
        return;
      }

      if (event.key !== "Tab" || !taxPresetDialogRef.current) return;
      const focusable = Array.from(
        taxPresetDialogRef.current.querySelectorAll<HTMLElement>(
          focusableSelector,
        ),
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(
      () => taxPresetNameInputRef.current?.focus(),
      0,
    );

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [newTaxPresetOpen, savingNewTaxPreset]);

  const taxPresetsChanged = useMemo(
    () => JSON.stringify(taxPresetForm) !== JSON.stringify(settings.taxPresets),
    [settings.taxPresets, taxPresetForm],
  );

  const updateField = (field: keyof Preset, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateTaxPreset = (
    key: string,
    field: Exclude<keyof TaxPreset, "key">,
    value: string | number | boolean,
  ) => {
    setTaxPresetForm((current) =>
      current.map((preset) =>
        preset.key === key
          ? ({ ...preset, [field]: value } as TaxPreset)
          : preset,
      ),
    );
  };

  const openTaxPresetModal = () => {
    if (taxPresetForm.length >= 20) {
      showToast("A maximum of 20 GST presets is allowed.");
      return;
    }
    setNewTaxPresetError("");
    setNewTaxPreset(createTaxPreset());
  };

  const closeTaxPresetModal = () => {
    if (savingNewTaxPreset) return;
    setNewTaxPreset(null);
    setNewTaxPresetError("");
    window.setTimeout(() => addTaxPresetButtonRef.current?.focus(), 0);
  };

  const updateNewTaxPreset = (
    field: Exclude<keyof TaxPreset, "key">,
    value: string | number | boolean,
  ) => {
    setNewTaxPreset((current) =>
      current ? ({ ...current, [field]: value } as TaxPreset) : current,
    );
    setNewTaxPresetError("");
  };

  const saveNewTaxPreset = async () => {
    if (!newTaxPreset) return;

    const nextTaxPresets = [...taxPresetForm, newTaxPreset];
    const validationMessage = validateTaxPresets(nextTaxPresets);
    if (validationMessage) {
      setNewTaxPresetError(validationMessage);
      return;
    }

    setSavingNewTaxPreset(true);
    setNewTaxPresetError("");
    try {
      const { taxPresets } = await api.updateTaxPresets(nextTaxPresets);
      setTaxPresetForm(taxPresets);
      onSettingsChange({ ...settings, taxPresets });
      setNewTaxPreset(null);
      showToast("GST preset added.");
      window.setTimeout(() => addTaxPresetButtonRef.current?.focus(), 0);
    } catch (error) {
      setNewTaxPresetError(
        error instanceof Error ? error.message : "Could not add GST preset.",
      );
    } finally {
      setSavingNewTaxPreset(false);
    }
  };

  const removeTaxPreset = (key: string) => {
    if (taxPresetForm.length <= 1) {
      showToast("Keep at least one reusable GST preset.");
      return;
    }
    setTaxPresetForm((current) =>
      current.filter((preset) => preset.key !== key),
    );
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

  const saveTaxPresetPreferences = async () => {
    const validationMessage = validateTaxPresets(taxPresetForm);
    if (validationMessage) {
      showToast(validationMessage);
      return;
    }

    setSavingTaxPresets(true);
    try {
      const { taxPresets } = await api.updateTaxPresets(taxPresetForm);
      setTaxPresetForm(taxPresets);
      onSettingsChange({ ...settings, taxPresets });
      showToast("GST preset preferences saved.");
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Could not save GST preset preferences.",
      );
    } finally {
      setSavingTaxPresets(false);
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

      <section className="panel gst-preset-panel">
        <div className="panel-title gst-preset-title">
          <span className="panel-title-label">
            <BadgePercent size={16} />
            <span>GST Preset Preferences</span>
          </span>
          <div className="gst-preset-title-actions">
            <span
              className={`settings-save-state${taxPresetsChanged ? " unsaved" : ""}`}
            >
              {taxPresetsChanged ? "Unsaved changes" : "Saved"}
            </span>
            <button
              className="btn btn-outline gst-preset-add"
              type="button"
              ref={addTaxPresetButtonRef}
              onClick={openTaxPresetModal}
              disabled={savingTaxPresets || taxPresetForm.length >= 20}
            >
              <Plus size={15} />
              Add Preset
            </button>
          </div>
        </div>

        <div
          className="gst-preset-editor"
          role="table"
          aria-label="GST presets"
        >
          <div className="gst-preset-editor-head" role="row">
            <span role="columnheader">Preset</span>
            <span role="columnheader">HSN/SAC</span>
            <span role="columnheader">CGST%</span>
            <span role="columnheader">SGST%</span>
            <span role="columnheader">IGST%</span>
            <span role="columnheader">Inclusive</span>
            <span role="columnheader">Description</span>
          </div>
          {taxPresetForm.map((preset, index) => (
            <div className="gst-preset-editor-row" role="row" key={preset.key}>
              <div className="gst-preset-name-field" role="cell">
                <span className="gst-preset-order">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <input
                    className="input gst-preset-input"
                    aria-label={`${preset.key} preset name`}
                    value={preset.label}
                    maxLength={80}
                    disabled={savingTaxPresets}
                    onChange={(event) =>
                      updateTaxPreset(preset.key, "label", event.target.value)
                    }
                  />
                </div>
                <button
                  className="icon-button danger gst-preset-remove"
                  type="button"
                  title={`Remove ${preset.label}`}
                  aria-label={`Remove ${preset.label}`}
                  onClick={() => removeTaxPreset(preset.key)}
                  disabled={savingTaxPresets || taxPresetForm.length <= 1}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div role="cell" data-label="HSN/SAC">
                <input
                  className="input gst-preset-input gst-preset-code"
                  aria-label={`${preset.label} HSN or SAC`}
                  value={preset.hsn}
                  maxLength={16}
                  disabled={savingTaxPresets}
                  onChange={(event) =>
                    updateTaxPreset(
                      preset.key,
                      "hsn",
                      event.target.value.toUpperCase(),
                    )
                  }
                />
              </div>
              {(["cgstRate", "sgstRate", "igstRate"] as const).map((field) => (
                <div
                  role="cell"
                  data-label={`${field.slice(0, -4).toUpperCase()}%`}
                  key={field}
                >
                  <input
                    className="input gst-preset-input gst-preset-rate"
                    aria-label={`${preset.label} ${field}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="0.01"
                    value={preset[field]}
                    disabled={savingTaxPresets}
                    onChange={(event) =>
                      updateTaxPreset(
                        preset.key,
                        field,
                        event.target.value === ""
                          ? 0
                          : Number(event.target.value),
                      )
                    }
                  />
                </div>
              ))}
              <div role="cell" data-label="Inclusive">
                <label className="gst-inclusive-control">
                  <input
                    type="checkbox"
                    checked={preset.allowInclusive}
                    disabled={savingTaxPresets}
                    onChange={(event) =>
                      updateTaxPreset(
                        preset.key,
                        "allowInclusive",
                        event.target.checked,
                      )
                    }
                  />
                  <span aria-hidden="true" />
                  <strong>{preset.allowInclusive ? "Allowed" : "Off"}</strong>
                </label>
              </div>
              <div role="cell" data-label="Description">
                <textarea
                  className="input gst-preset-input gst-preset-description"
                  aria-label={`${preset.label} description`}
                  value={preset.note}
                  maxLength={240}
                  rows={2}
                  placeholder="Where this preset applies"
                  disabled={savingTaxPresets}
                  onChange={(event) =>
                    updateTaxPreset(preset.key, "note", event.target.value)
                  }
                />
              </div>
            </div>
          ))}
        </div>

        <div className="button-row profile-save-row gst-preset-save-row">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => void saveTaxPresetPreferences()}
            disabled={savingTaxPresets || !taxPresetsChanged}
          >
            <Save size={16} />
            {savingTaxPresets ? "Saving..." : "Save GST Presets"}
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

      {newTaxPreset ? (
        <div className="preset-modal-backdrop" role="presentation">
          <section
            className="preset-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-tax-preset-title"
            ref={taxPresetDialogRef}
          >
            <header className="preset-modal-header">
              <div className="preset-modal-heading">
                <span className="preset-modal-icon">
                  <BadgePercent size={19} />
                </span>
                <div>
                  <span className="preset-modal-kicker">GST preference</span>
                  <h3 id="add-tax-preset-title">Add new preset</h3>
                </div>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={closeTaxPresetModal}
                title="Close preset form"
                aria-label="Close preset form"
                disabled={savingNewTaxPreset}
              >
                <X size={16} />
              </button>
            </header>

            <form
              className="preset-modal-form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveNewTaxPreset();
              }}
            >
              <div className="preset-modal-grid">
                <label className="field preset-modal-name">
                  <span>
                    Preset name <span className="required-star">*</span>
                  </span>
                  <input
                    className="input"
                    ref={taxPresetNameInputRef}
                    value={newTaxPreset.label}
                    maxLength={80}
                    placeholder="Rooms - 12%"
                    disabled={savingNewTaxPreset}
                    onChange={(event) =>
                      updateNewTaxPreset("label", event.target.value)
                    }
                    required
                  />
                </label>

                <label className="field">
                  <span>HSN/SAC</span>
                  <input
                    className="input"
                    value={newTaxPreset.hsn}
                    maxLength={16}
                    placeholder="996311"
                    disabled={savingNewTaxPreset}
                    onChange={(event) =>
                      updateNewTaxPreset(
                        "hsn",
                        event.target.value.toUpperCase(),
                      )
                    }
                  />
                </label>

                {(["cgstRate", "sgstRate", "igstRate"] as const).map(
                  (field) => (
                    <label className="field" key={field}>
                      <span>{field.slice(0, -4).toUpperCase()}%</span>
                      <input
                        className="input preset-modal-rate"
                        aria-label={`New preset ${field}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max="100"
                        step="0.01"
                        value={newTaxPreset[field]}
                        disabled={savingNewTaxPreset}
                        onChange={(event) =>
                          updateNewTaxPreset(
                            field,
                            event.target.value === ""
                              ? 0
                              : Number(event.target.value),
                          )
                        }
                      />
                    </label>
                  ),
                )}

                <div className="field preset-modal-inclusive">
                  <span>GST-inclusive rate</span>
                  <label className="gst-inclusive-control">
                    <input
                      type="checkbox"
                      checked={newTaxPreset.allowInclusive}
                      disabled={savingNewTaxPreset}
                      onChange={(event) =>
                        updateNewTaxPreset(
                          "allowInclusive",
                          event.target.checked,
                        )
                      }
                    />
                    <span aria-hidden="true" />
                    <strong>
                      {newTaxPreset.allowInclusive ? "Allowed" : "Off"}
                    </strong>
                  </label>
                </div>

                <label className="field preset-modal-description">
                  <span>Description</span>
                  <textarea
                    className="input"
                    value={newTaxPreset.note}
                    maxLength={240}
                    rows={3}
                    placeholder="Where this preset applies"
                    disabled={savingNewTaxPreset}
                    onChange={(event) =>
                      updateNewTaxPreset("note", event.target.value)
                    }
                  />
                </label>
              </div>

              {newTaxPresetError ? (
                <div className="preset-modal-error" role="alert">
                  {newTaxPresetError}
                </div>
              ) : null}

              <footer className="preset-modal-actions">
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={closeTaxPresetModal}
                  disabled={savingNewTaxPreset}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={savingNewTaxPreset || !newTaxPreset.label.trim()}
                >
                  {savingNewTaxPreset ? (
                    <LoaderCircle className="preset-modal-spinner" size={16} />
                  ) : (
                    <Save size={16} />
                  )}
                  {savingNewTaxPreset ? "Saving..." : "Save Preset"}
                </button>
              </footer>
            </form>

            {savingNewTaxPreset ? (
              <div className="preset-modal-saving-overlay" aria-live="polite">
                <LoaderCircle className="preset-modal-spinner" size={26} />
                <strong>Saving preset</strong>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
