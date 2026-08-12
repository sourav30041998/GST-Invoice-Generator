import { defaultPreset, taxPresets } from "../constants";
import type { Settings } from "../types";

type AboutViewProps = {
  settings: Settings;
};

export function AboutView({ settings }: AboutViewProps) {
  const preset = settings.preset || defaultPreset;

  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-title">Active Preset</div>
        <div className="about-grid">
          {[
            ["Business Name", preset.business_name],
            ["GSTIN", preset.gstin || "-"],
            [
              "Address",
              `${preset.address_line1 || ""} ${preset.address_line2 || ""}`.trim(),
            ],
            ["Phone", preset.phone || "-"],
            ["Website", preset.website || "-"],
            ["Prefix", preset.invoice_prefix],
            [
              "Bank Details",
              preset.bank_acc_name
                ? `${preset.bank_acc_name}, ${preset.bank_name || ""}, A/c: ${preset.bank_account || ""}, IFSC: ${preset.bank_ifsc || ""}`
                : "-",
            ],
            ["UPI ID", preset.upi || "-"],
          ].map(([label, value]) => (
            <div className="about-cell" key={label}>
              <label>{label}</label>
              <span>{value || "-"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">GST Preset Reference</div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Line Type</th>
                <th>HSN/SAC</th>
                <th className="text-right">CGST</th>
                <th className="text-right">SGST</th>
                <th className="text-right">IGST</th>
                <th>Basis</th>
              </tr>
            </thead>
            <tbody>
              {taxPresets.map((presetItem) => (
                <tr key={presetItem.key}>
                  <td>{presetItem.key}</td>
                  <td>{presetItem.hsn || "-"}</td>
                  <td className="amount-cell">{presetItem.cgstRate}%</td>
                  <td className="amount-cell">{presetItem.sgstRate}%</td>
                  <td className="amount-cell">{presetItem.igstRate}%</td>
                  <td>{presetItem.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">System Notes</div>
        <div className="notes-grid">
          <div>
            <strong>Invoice format</strong>
            <span>{`{PREFIX}-{YYMM}-{NNNN}`}</span>
          </div>
          <div>
            <strong>Storage</strong>
            <span>
              MongoDB collections for invoices, settings, and counters.
            </span>
          </div>
          <div>
            <strong>PDF</strong>
            <span>Generated in-browser from saved invoice data.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
