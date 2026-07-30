import {
  CalendarDays,
  Download,
  FilePlus2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { emptyLineItem, taxPresets } from "../constants";
import { findIndianState } from "../data/indianStates";
import { StateCombobox } from "./StateCombobox";
import type { AdjustmentInput, Invoice, InvoicePayload, LineItemInput, Settings } from "../types";
import { calculateInvoiceTotals, formatCurrency, numWords } from "../utils/calculations";
import { todayIso } from "../utils/dates";
import { buildInvoicePdf, resolveLogoDataUrl } from "../utils/pdf";

type FormState = Omit<InvoicePayload, "lineItems" | "adjustments">;

type InvoiceFormProps = {
  settings: Settings;
  nextInvoiceNo: string;
  editingInvoice: Invoice | null;
  onInvoiceDateChange: (date: string) => void;
  onSaved: (invoice: Invoice) => void;
  onCancelEdit: () => void;
  showToast: (message: string) => void;
};

const initialForm = (): FormState => ({
  invDate: todayIso(),
  checkinDate: "",
  checkoutDate: "",
  confirmNo: "",
  partyName: "",
  partyGSTIN: "",
  partyAddress: "",
  partyState: "",
  groupName: "",
  roomNo: ""
});

const initialLineItems = (): LineItemInput[] => {
  const invoiceDate = todayIso();
  return [emptyLineItem("Rooms <= Rs.7500/day", invoiceDate), emptyLineItem("Food Bill", invoiceDate)];
};

const makeAdjustment = (): AdjustmentInput => ({
  id: crypto.randomUUID(),
  desc: "",
  amount: "",
  type: "add"
});

function RequiredLabel({ children }: { children: string }) {
  return (
    <label>
      {children} <span className="required-star">*</span>
    </label>
  );
}

const canUseInclusive = (presetKey: string) => taxPresets.find((preset) => preset.key === presetKey)?.allowInclusive;

function cleanPayload(form: FormState, lineItems: LineItemInput[], adjustments: AdjustmentInput[]): InvoicePayload {
  return {
    ...form,
    lineItems: lineItems.map(({ id: _id, ...line }) => ({
      ...line,
      units: Number(line.units) || 0,
      rate: Number(line.rate) || 0
    })),
    adjustments: adjustments
      .filter((adjustment) => adjustment.desc.trim() || Number(adjustment.amount))
      .map(({ id: _id, ...adjustment }) => ({
        ...adjustment,
        amount: Number(adjustment.amount) || 0
      }))
  };
}

export function InvoiceForm({
  settings,
  nextInvoiceNo,
  editingInvoice,
  onInvoiceDateChange,
  onSaved,
  onCancelEdit,
  showToast
}: InvoiceFormProps) {
  const [form, setForm] = useState<FormState>(() => initialForm());
  const [lineItems, setLineItems] = useState<LineItemInput[]>(() => initialLineItems());
  const [adjustments, setAdjustments] = useState<AdjustmentInput[]>([]);
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => calculateInvoiceTotals(lineItems, adjustments), [lineItems, adjustments]);

  const resetInvoiceForm = useCallback(() => {
    setForm(initialForm());
    setLineItems(initialLineItems());
    setAdjustments([]);
  }, []);

  useEffect(() => {
    onInvoiceDateChange(form.invDate);
  }, [form.invDate, onInvoiceDateChange]);

  useEffect(() => {
    if (!editingInvoice) {
      resetInvoiceForm();
      return;
    }

    setForm({
      invDate: editingInvoice.invDate,
      checkinDate: editingInvoice.checkinDate || "",
      checkoutDate: editingInvoice.checkoutDate || "",
      confirmNo: editingInvoice.confirmNo || "",
      partyName: editingInvoice.partyName,
      partyGSTIN: editingInvoice.partyGSTIN || "",
      partyAddress: editingInvoice.partyAddress || "",
      partyState: editingInvoice.partyState || "",
      groupName: editingInvoice.groupName || "",
      roomNo: editingInvoice.roomNo || ""
    });
    setLineItems(
      editingInvoice.lineItems.map((item) => ({
        ...item,
        id: crypto.randomUUID()
      }))
    );
    setAdjustments(
      editingInvoice.adjustments.map((adjustment) => ({
        ...adjustment,
        id: crypto.randomUUID()
      }))
    );
  }, [editingInvoice, resetInvoiceForm]);

  const updateForm = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateLine = (id: string, patch: Partial<LineItemInput>) => {
    setLineItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const updateAdjustment = (id: string, patch: Partial<AdjustmentInput>) => {
    setAdjustments((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addLine = (presetKey = "Custom") => {
    setLineItems((current) => [...current, emptyLineItem(presetKey, form.checkinDate || form.invDate)]);
  };

  const handlePresetChange = (id: string, presetKey: string) => {
    const preset = taxPresets.find((item) => item.key === presetKey) || taxPresets[taxPresets.length - 1];
    updateLine(id, {
      presetKey,
      hsn: preset.hsn,
      cgstRate: preset.cgstRate,
      sgstRate: preset.sgstRate,
      igstRate: preset.igstRate,
      taxInclusive: preset.allowInclusive ? false : false
    });
  };

  const clearForm = () => {
    resetInvoiceForm();
    onCancelEdit();
    showToast("Form cleared.");
  };

  const submit = async () => {
    const requiredValues = [
      ["Invoice Number", editingInvoice?.invNo || nextInvoiceNo],
      ["Arrival", form.checkinDate],
      ["Departure", form.checkoutDate],
      ["Room No.", form.roomNo],
      ["Payee Name", form.partyName],
      ["State", form.partyState],
      ["Address", form.partyAddress]
    ];
    const missingFields = requiredValues.filter(([, value]) => !String(value || "").trim()).map(([label]) => label);

    if (missingFields.length) {
      showToast(`Please fill required fields: ${missingFields.join(", ")}.`);
      return;
    }

    const selectedState = findIndianState(form.partyState);
    if (!selectedState) {
      showToast("Please select a valid Indian state.");
      return;
    }

    setSaving(true);
    try {
      const payload = cleanPayload({ ...form, partyState: selectedState }, lineItems, adjustments);
      const savedInvoice = editingInvoice
        ? await api.updateInvoice(editingInvoice.invNo, payload)
        : await api.createInvoice(payload);
      const logoDataUrl = await resolveLogoDataUrl(settings.logoDataUrl);
      buildInvoicePdf(savedInvoice, logoDataUrl);
      onSaved(savedInvoice);
      showToast(`Invoice ${savedInvoice.invNo} ${editingInvoice ? "updated" : "saved"} and downloaded.`);
      if (!editingInvoice) {
        resetInvoiceForm();
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save invoice.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-title">
          <CalendarDays size={16} />
          <span>Invoice Details</span>
        </div>
        <div className="form-grid">
          <div className="field">
            <RequiredLabel>Invoice Number</RequiredLabel>
            <div className="readonly-box">{editingInvoice?.invNo || nextInvoiceNo || "Loading..."}</div>
          </div>
          <div className="field">
            <label>Invoice Date</label>
            <input className="input" type="date" value={form.invDate} onChange={(event) => updateForm("invDate", event.target.value)} />
          </div>
          <div className="field">
            <RequiredLabel>Arrival</RequiredLabel>
            <input
              className="input"
              type="date"
              value={form.checkinDate}
              onChange={(event) => updateForm("checkinDate", event.target.value)}
              required
            />
          </div>
          <div className="field">
            <RequiredLabel>Departure</RequiredLabel>
            <input
              className="input"
              type="date"
              value={form.checkoutDate}
              onChange={(event) => updateForm("checkoutDate", event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Confirmation No.</label>
            <input className="input" value={form.confirmNo} onChange={(event) => updateForm("confirmNo", event.target.value)} />
          </div>
          <div className="field">
            <RequiredLabel>Room No.</RequiredLabel>
            <input className="input" value={form.roomNo} onChange={(event) => updateForm("roomNo", event.target.value)} required />
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <FilePlus2 size={16} />
          <span>Guest / Payee Details</span>
        </div>
        <div className="form-grid">
          <div className="field span-2">
            <RequiredLabel>Payee Name</RequiredLabel>
            <input
              className="input"
              value={form.partyName}
              onChange={(event) => updateForm("partyName", event.target.value)}
              placeholder="Mr. Rahul Sharma / ABC Corp"
              required
            />
          </div>
          <div className="field">
            <label>GSTIN (B2B)</label>
            <input className="input" value={form.partyGSTIN} onChange={(event) => updateForm("partyGSTIN", event.target.value)} />
          </div>
          <div className="field">
            <RequiredLabel>State</RequiredLabel>
            <StateCombobox value={form.partyState} onChange={(value) => updateForm("partyState", value)} required />
          </div>
          <div className="field span-2">
            <label>Group Name</label>
            <input className="input" value={form.groupName} onChange={(event) => updateForm("groupName", event.target.value)} />
          </div>
          <div className="field full">
            <RequiredLabel>Address</RequiredLabel>
            <textarea className="input min-h-20" value={form.partyAddress} onChange={(event) => updateForm("partyAddress", event.target.value)} required />
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title row-title">
          <span>Line Items</span>
          <span>GST applied per line item based on preset</span>
        </div>
        <div className="table-wrap">
          <table className="data-table min-w-[1060px]">
            <thead>
              <tr>
                <th>Preset / Description</th>
                <th>Date</th>
                <th>HSN</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Rate</th>
                <th className="text-right">CGST%</th>
                <th className="text-right">SGST%</th>
                <th className="text-right">IGST%</th>
                <th className="text-right">Taxable</th>
                <th className="text-right">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((line, index) => {
                const calculated = totals.lineItems[index];
                return (
                  <tr key={line.id}>
                    <td>
                      <select className="table-input mb-1" value={line.presetKey} onChange={(event) => handlePresetChange(line.id, event.target.value)}>
                        {taxPresets.map((preset) => (
                          <option key={preset.key} value={preset.key}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                      <input
                        className="table-input"
                        value={line.description}
                        onChange={(event) => updateLine(line.id, { description: event.target.value })}
                        placeholder="Description"
                      />
                      {canUseInclusive(line.presetKey) ? (
                        <label className="inclusive-check">
                          <input
                            type="checkbox"
                            checked={line.taxInclusive}
                            onChange={(event) => updateLine(line.id, { taxInclusive: event.target.checked })}
                          />
                          <span>Rate includes GST</span>
                        </label>
                      ) : null}
                    </td>
                    <td>
                      <input className="table-input" type="date" value={line.date} onChange={(event) => updateLine(line.id, { date: event.target.value })} />
                    </td>
                    <td>
                      <input className="table-input" value={line.hsn} onChange={(event) => updateLine(line.id, { hsn: event.target.value })} />
                    </td>
                    <td>
                      <input
                        className="table-input text-right"
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.units}
                        onChange={(event) => updateLine(line.id, { units: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="table-input text-right"
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.rate}
                        onChange={(event) => updateLine(line.id, { rate: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="table-input text-right"
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={line.cgstRate}
                        onChange={(event) => updateLine(line.id, { cgstRate: Number(event.target.value) || 0 })}
                      />
                    </td>
                    <td>
                      <input
                        className="table-input text-right"
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={line.sgstRate}
                        onChange={(event) => updateLine(line.id, { sgstRate: Number(event.target.value) || 0 })}
                      />
                    </td>
                    <td>
                      <input
                        className="table-input text-right"
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={line.igstRate}
                        onChange={(event) => updateLine(line.id, { igstRate: Number(event.target.value) || 0 })}
                      />
                    </td>
                    <td className="amount-cell">{formatCurrency(calculated?.taxable || 0)}</td>
                    <td className="amount-cell">{formatCurrency(calculated?.total || 0)}</td>
                    <td>
                      <button className="icon-button danger" type="button" onClick={() => setLineItems((current) => current.filter((item) => item.id !== line.id))}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button className="add-row-button" type="button" onClick={() => addLine()}>
          <Plus size={15} />
          Add line item
        </button>
      </section>

      <section className="panel">
        <div className="panel-title row-title">
          <span>Adjustments</span>
          <span>Optional additions and deductions after GST</span>
        </div>
        <div className="table-wrap">
          <table className="data-table min-w-[620px]">
            <thead>
              <tr>
                <th>Description</th>
                <th>Type</th>
                <th className="text-right">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {adjustments.length ? (
                adjustments.map((adjustment) => (
                  <tr key={adjustment.id}>
                    <td>
                      <input
                        className="table-input"
                        value={adjustment.desc}
                        onChange={(event) => updateAdjustment(adjustment.id, { desc: event.target.value })}
                        placeholder="Round off / extra bed / discount"
                      />
                    </td>
                    <td>
                      <select className="table-input" value={adjustment.type} onChange={(event) => updateAdjustment(adjustment.id, { type: event.target.value as "add" | "deduct" })}>
                        <option value="add">Add</option>
                        <option value="deduct">Deduct</option>
                      </select>
                    </td>
                    <td>
                      <input
                        className="table-input text-right"
                        type="number"
                        min="0"
                        step="0.01"
                        value={adjustment.amount}
                        onChange={(event) => updateAdjustment(adjustment.id, { amount: event.target.value })}
                      />
                    </td>
                    <td>
                      <button className="icon-button danger" type="button" onClick={() => setAdjustments((current) => current.filter((item) => item.id !== adjustment.id))}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="empty-row" colSpan={4}>
                    No adjustments added.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <button className="add-row-button" type="button" onClick={() => setAdjustments((current) => [...current, makeAdjustment()])}>
          <Plus size={15} />
          Add adjustment
        </button>
      </section>

      <section className="summary-strip">
        <div className="totals-panel">
          <div className="total-row">
            <span>Taxable Value</span>
            <strong>{formatCurrency(totals.totalTaxable)}</strong>
          </div>
          <div className="total-row">
            <span>CGST</span>
            <strong>{formatCurrency(totals.totalCGST)}</strong>
          </div>
          <div className="total-row">
            <span>SGST</span>
            <strong>{formatCurrency(totals.totalSGST)}</strong>
          </div>
          <div className="total-row">
            <span>IGST</span>
            <strong>{formatCurrency(totals.totalIGST)}</strong>
          </div>
          <div className="total-row grand">
            <span>Grand Total</span>
            <strong>{formatCurrency(totals.grandTotal)}</strong>
          </div>
          <div className="total-row add">
            <span>Additions</span>
            <strong>{formatCurrency(totals.addTotal)}</strong>
          </div>
          <div className="total-row deduct">
            <span>Deductions</span>
            <strong>{formatCurrency(totals.deductTotal)}</strong>
          </div>
          <div className="total-row net">
            <span>Net Total</span>
            <strong>{formatCurrency(totals.netTotal)}</strong>
          </div>
          <div className="words">Rupees {totals.netTotal > 0 ? numWords(Math.round(totals.netTotal)) : "Zero"} Only</div>
        </div>
      </section>

      <div className="action-bar">
        {editingInvoice ? (
          <button
            className="btn btn-outline"
            type="button"
            onClick={() => {
              resetInvoiceForm();
              onCancelEdit();
            }}
          >
            <X size={16} />
            Cancel edit
          </button>
        ) : null}
        <button className="btn btn-outline" type="button" onClick={clearForm}>
          <RotateCcw size={16} />
          Clear Form
        </button>
        <button className="btn btn-primary" type="button" onClick={submit} disabled={saving}>
          {editingInvoice ? <Save size={16} /> : <Download size={16} />}
          {saving ? "Saving..." : editingInvoice ? "Save & Download PDF" : "Generate & Download PDF"}
        </button>
      </div>
    </div>
  );
}
