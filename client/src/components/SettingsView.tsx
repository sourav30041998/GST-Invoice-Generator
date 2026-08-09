import { Download, ImagePlus, Trash2, UploadCloud } from "lucide-react";
import { api } from "../api";
import { defaultPreset } from "../constants";
import type { Settings } from "../types";

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

export function SettingsView({
  settings,
  onSettingsChange,
  onDatabaseCleared,
  showToast,
}: SettingsViewProps) {
  const uploadPreset = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    if (file.size > MAX_PRESET_FILE_SIZE) {
      showToast("Preset file is too large.");
      return;
    }

    try {
      const json = JSON.parse(await readFile(file));
      const { preset } = await api.updatePreset(json);
      onSettingsChange({ ...settings, preset });
      showToast(`Preset loaded: ${preset.business_name}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Invalid preset file.");
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
      showToast("Logo saved to database.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not upload logo.");
    }
  };

  const clearLogo = async () => {
    if (!window.confirm("Remove logo?")) {
      return;
    }
    try {
      await api.deleteLogo();
      onSettingsChange({ ...settings, logoDataUrl: null });
      showToast("Logo removed.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not remove logo.");
    }
  };

  const clearDatabase = async () => {
    if (!window.confirm("This will delete all invoices, preset, logo, and counters. Continue?")) {
      return;
    }
    if (!window.confirm("Last chance. Delete everything?")) {
      return;
    }
    try {
      await api.clearDatabase();
      onSettingsChange({ preset: defaultPreset, logoDataUrl: null });
      onDatabaseCleared();
      showToast("All data cleared.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not clear database.");
    }
  };

  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-title">
          <UploadCloud size={16} />
          <span>Business Preset</span>
        </div>
        <div className="settings-grid">
          <label className="upload-box">
            <UploadCloud size={28} />
            <span>Upload preset JSON</span>
            <small>Business details, GSTIN, bank, invoice prefix</small>
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => void uploadPreset(event.target.files?.[0])}
            />
          </label>
          <div className="preset-preview">
            <div className="success-line">Preset loaded</div>
            <pre>{JSON.stringify(settings.preset, null, 2)}</pre>
          </div>
        </div>
        <div className="button-row">
          <button className="btn btn-outline" type="button" onClick={downloadSamplePreset}>
            <Download size={16} />
            Download sample preset
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <ImagePlus size={16} />
          <span>Logo</span>
        </div>
        <div className="logo-row">
          {settings.logoDataUrl ? (
            <img
              className="logo-preview"
              src={settings.logoDataUrl}
              alt={`${settings.preset.business_name} logo`}
            />
          ) : (
            <div
              className="logo-preview logo-placeholder"
              aria-label="No business logo uploaded"
            >
              SSH
            </div>
          )}
          <label className="btn btn-outline file-button">
            <ImagePlus size={16} />
            Upload Logo
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={(event) => void uploadLogo(event.target.files?.[0])}
            />
          </label>
          <button className="btn btn-outline danger-text" type="button" onClick={clearLogo}>
            <Trash2 size={16} />
            Clear Logo
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <Trash2 size={16} />
          <span>Database Tools</span>
        </div>
        <div className="danger-zone">
          <div>
            <strong>Clear all stored data</strong>
            <p>Invoices, preset, logo, and invoice counters will be removed from MongoDB.</p>
          </div>
          <button className="btn btn-outline danger-text" type="button" onClick={clearDatabase}>
            <Trash2 size={16} />
            Clear Database
          </button>
        </div>
      </section>
    </div>
  );
}
