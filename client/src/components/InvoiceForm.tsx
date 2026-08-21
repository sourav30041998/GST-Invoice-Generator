import {
  ArrowLeft,
  BedDouble,
  CalendarDays,
  FilePlus2,
  FileText,
  ListChecks,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { emptyLineItem, invoiceCustomTaxPreset } from "../constants";
import { findIndianState, indianStates } from "../data/indianStates";
import { StateCombobox } from "./StateCombobox";
import type {
  AdjustmentInput,
  CreatableInvoiceWorkflowStatus,
  Invoice,
  InvoiceDraft,
  InvoiceFormHeaderState,
  InvoicePayload,
  InvoiceWorkflowStatus,
  LineItemInput,
  Room,
  TaxPreset,
} from "../types";
import {
  calculateInvoiceTotals,
  formatCurrency,
  numWords,
} from "../utils/calculations";
import { todayIso } from "../utils/dates";

type FormState = Omit<
  InvoicePayload,
  "lineItems" | "adjustments" | "workflowStatus"
> & {
  workflowStatus: InvoiceWorkflowStatus;
};

type InvoiceFormTab = "details" | "items";

type InvoiceFormProps = {
  nextInvoiceNo: string;
  taxPresets: TaxPreset[];
  editingInvoice: Invoice | null;
  activeDraft: InvoiceDraft | null;
  onInvoiceDateChange: (date: string) => void;
  onSaved: (invoice: Invoice, closeAfterSave: boolean) => void;
  onDraftSaved: (closeAfterSave: boolean) => void;
  onHeaderStateChange: (state: InvoiceFormHeaderState) => void;
  onBack: () => void;
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
  rooms: [],
  workflowStatus: "draft",
});

const initialLineItems = (taxPresets: TaxPreset[]): LineItemInput[] => {
  const invoiceDate = todayIso();
  const preferredKeys = ["Rooms <= Rs.7500/day", "Food Bill"];
  const preferredPresets = preferredKeys.flatMap((key) => {
    const preset = taxPresets.find((item) => item.key === key);
    return preset ? [preset] : [];
  });
  const remainingPresets = taxPresets.filter(
    (preset) => !preferredKeys.includes(preset.key),
  );
  const initialPresets = [...preferredPresets, ...remainingPresets].slice(0, 2);

  return (
    initialPresets.length > 0 ? initialPresets : [invoiceCustomTaxPreset]
  ).map((preset) => emptyLineItem(preset.key, invoiceDate, taxPresets));
};

const makeAdjustment = (): AdjustmentInput => ({
  id: crypto.randomUUID(),
  desc: "",
  amount: "",
  type: "add",
});

function RequiredLabel({ children }: { children: string }) {
  return (
    <label>
      {children} <span className="required-star">*</span>
    </label>
  );
}

const canUseInclusive = (taxPresets: TaxPreset[], presetKey: string) =>
  presetKey === invoiceCustomTaxPreset.key ||
  taxPresets.find((preset) => preset.key === presetKey)?.allowInclusive;

function cleanPayload(
  form: FormState,
  lineItems: LineItemInput[],
  adjustments: AdjustmentInput[],
): InvoicePayload {
  const workflowStatus: CreatableInvoiceWorkflowStatus =
    form.workflowStatus === "cancelled" ? "checkedOut" : form.workflowStatus;

  return {
    ...form,
    workflowStatus,
    lineItems: lineItems.map((line) => ({
      presetKey: line.presetKey,
      description: line.description,
      hsn: line.hsn,
      date: line.date,
      units: Number(line.units) || 0,
      rate: Number(line.rate) || 0,
      cgstRate: Number(line.cgstRate) || 0,
      sgstRate: Number(line.sgstRate) || 0,
      igstRate: Number(line.igstRate) || 0,
      taxInclusive: Boolean(line.taxInclusive),
    })),
    adjustments: adjustments
      .filter(
        (adjustment) => adjustment.desc.trim() || Number(adjustment.amount),
      )
      .map(({ id: _id, ...adjustment }) => ({
        ...adjustment,
        amount: Number(adjustment.amount) || 0,
      })),
  };
}
function formSnapshot(
  form: FormState,
  lineItems: LineItemInput[],
  adjustments: AdjustmentInput[],
) {
  return JSON.stringify({
    form,
    lineItems: lineItems.map((line) => ({
      presetKey: line.presetKey,
      description: line.description,
      hsn: line.hsn,
      date: line.date,
      units: String(line.units ?? ""),
      rate: String(line.rate ?? ""),
      cgstRate: Number(line.cgstRate) || 0,
      sgstRate: Number(line.sgstRate) || 0,
      igstRate: Number(line.igstRate) || 0,
      taxInclusive: Boolean(line.taxInclusive),
    })),
    adjustments: adjustments.map((adjustment) => ({
      desc: adjustment.desc,
      amount: String(adjustment.amount ?? ""),
      type: adjustment.type,
    })),
  });
}
export function InvoiceForm({
  nextInvoiceNo,
  taxPresets,
  editingInvoice,
  activeDraft,
  onInvoiceDateChange,
  onSaved,
  onDraftSaved,
  onHeaderStateChange,
  onBack,
  showToast,
}: InvoiceFormProps) {
  const [form, setForm] = useState<FormState>(() => initialForm());
  const [lineItems, setLineItems] = useState<LineItemInput[]>(() =>
    initialLineItems(taxPresets),
  );
  const [adjustments, setAdjustments] = useState<AdjustmentInput[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [statusVisible, setStatusVisible] = useState(
    Boolean(editingInvoice || activeDraft),
  );
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<InvoiceFormTab>("details");
  const [backConfirmOpen, setBackConfirmOpen] = useState(false);
  const [stateOptions, setStateOptions] =
    useState<readonly string[]>(indianStates);
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [roomSearch, setRoomSearch] = useState("");
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomLoadError, setRoomLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  const totals = useMemo(
    () => calculateInvoiceTotals(lineItems, adjustments),
    [lineItems, adjustments],
  );

  const resetInvoiceForm = useCallback(() => {
    setForm(initialForm());
    setLineItems(initialLineItems(taxPresets));
    setAdjustments([]);
    setDraftId(null);
    setStatusVisible(false);
    setLastSavedSnapshot(null);
    setActiveTab("details");
  }, [taxPresets]);

  useEffect(() => {
    const loadIndianStates = async () => {
      try {
        const states = await api.listIndianStates();
        if (states.length) {
          setStateOptions(states);
        }
      } catch {
        setStateOptions(indianStates);
      }
    };

    void loadIndianStates();
  }, []);

  useEffect(() => {
    onInvoiceDateChange(form.invDate);
  }, [form.invDate, onInvoiceDateChange]);

  useEffect(() => {
    if (
      !form.checkinDate ||
      !form.checkoutDate ||
      form.checkinDate >= form.checkoutDate
    ) {
      setAvailableRooms([]);
      setRoomLoadError("");
      setRoomsLoading(false);
      return;
    }

    let current = true;
    setRoomsLoading(true);
    setRoomLoadError("");
    void api
      .listAvailableRooms(
        form.checkinDate,
        form.checkoutDate,
        editingInvoice?._id,
      )
      .then((rooms) => {
        if (current) {
          setAvailableRooms(rooms);
        }
      })
      .catch((error) => {
        if (current) {
          setAvailableRooms([]);
          setRoomLoadError(
            error instanceof Error ? error.message : "Could not load rooms.",
          );
        }
      })
      .finally(() => {
        if (current) {
          setRoomsLoading(false);
        }
      });

    return () => {
      current = false;
    };
  }, [editingInvoice?._id, form.checkinDate, form.checkoutDate]);

  useEffect(() => {
    if (editingInvoice) {
      const nextForm: FormState = {
        invDate: editingInvoice.invDate,
        checkinDate: editingInvoice.checkinDate || "",
        checkoutDate: editingInvoice.checkoutDate || "",
        confirmNo: editingInvoice.confirmNo || "",
        partyName: editingInvoice.partyName,
        partyGSTIN: editingInvoice.partyGSTIN || "",
        partyAddress: editingInvoice.partyAddress || "",
        partyState: editingInvoice.partyState || "",
        groupName: editingInvoice.groupName || "",
        rooms: (editingInvoice.rooms || []).map((room) => ({
          roomId: room.roomId,
        })),
        workflowStatus: editingInvoice.workflowStatus || "checkedOut",
      };
      const nextLineItems = editingInvoice.lineItems.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
      }));
      const nextAdjustments = editingInvoice.adjustments.map((adjustment) => ({
        ...adjustment,
        id: crypto.randomUUID(),
      }));

      setForm(nextForm);
      setDraftId(null);
      setStatusVisible(true);
      setLineItems(nextLineItems);
      setAdjustments(nextAdjustments);
      setLastSavedSnapshot(
        formSnapshot(nextForm, nextLineItems, nextAdjustments),
      );
      setActiveTab("details");
      return;
    }

    if (activeDraft) {
      const nextForm: FormState = {
        invDate: activeDraft.invDate,
        checkinDate: activeDraft.checkinDate || "",
        checkoutDate: activeDraft.checkoutDate || "",
        confirmNo: activeDraft.confirmNo || "",
        partyName: activeDraft.partyName,
        partyGSTIN: activeDraft.partyGSTIN || "",
        partyAddress: activeDraft.partyAddress || "",
        partyState: activeDraft.partyState || "",
        groupName: activeDraft.groupName || "",
        rooms: (activeDraft.rooms || []).map((room) => ({
          roomId: room.roomId,
        })),
        workflowStatus: activeDraft.workflowStatus,
      };
      const nextLineItems = activeDraft.lineItems.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
      }));
      const nextAdjustments = activeDraft.adjustments.map((adjustment) => ({
        ...adjustment,
        id: crypto.randomUUID(),
      }));

      setForm(nextForm);
      setDraftId(activeDraft._id);
      setStatusVisible(true);
      setLineItems(nextLineItems);
      setAdjustments(nextAdjustments);
      setLastSavedSnapshot(
        formSnapshot(nextForm, nextLineItems, nextAdjustments),
      );
      setActiveTab("details");
      return;
    }

    resetInvoiceForm();
  }, [editingInvoice, activeDraft, resetInvoiceForm]);

  const updateForm = (
    key: Exclude<keyof FormState, "rooms">,
    value: string,
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toggleRoom = (roomId: string) => {
    setForm((current) => {
      const selected = current.rooms.some((room) => room.roomId === roomId);
      return {
        ...current,
        rooms: selected
          ? current.rooms.filter((room) => room.roomId !== roomId)
          : [...current.rooms, { roomId }],
      };
    });
  };

  const updateLine = (id: string, patch: Partial<LineItemInput>) => {
    setLineItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const updateAdjustment = (id: string, patch: Partial<AdjustmentInput>) => {
    setAdjustments((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const addLine = (presetKey = "Custom") => {
    setLineItems((current) => [
      ...current,
      emptyLineItem(presetKey, form.checkinDate || form.invDate, taxPresets),
    ]);
  };

  const handlePresetChange = (id: string, presetKey: string) => {
    const preset =
      presetKey === invoiceCustomTaxPreset.key
        ? invoiceCustomTaxPreset
        : taxPresets.find((item) => item.key === presetKey);
    if (!preset) {
      return;
    }
    updateLine(id, {
      presetKey,
      description: preset.note,
      hsn: preset.hsn,
      cgstRate: preset.cgstRate,
      sgstRate: preset.sgstRate,
      igstRate: preset.igstRate,
      taxInclusive: false,
    });
  };

  const currentSnapshot = useMemo(
    () => formSnapshot(form, lineItems, adjustments),
    [form, lineItems, adjustments],
  );
  const saveState =
    lastSavedSnapshot && currentSnapshot === lastSavedSnapshot
      ? "saved"
      : "unsaved";
  const invoiceNumberText =
    editingInvoice?.invNo ||
    (form.workflowStatus === "draft"
      ? "Not generated for draft"
      : nextInvoiceNo || "Will be generated on save");
  const selectedRoomIds = useMemo(
    () => new Set(form.rooms.map((room) => room.roomId)),
    [form.rooms],
  );
  const roomOptions = useMemo(() => {
    const search = roomSearch.trim().toLowerCase();
    return availableRooms.filter((room) => {
      if (!search) return true;
      return [room.roomNumber, room.roomType, room.floor, room.wing]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [availableRooms, roomSearch]);
  const selectedRoomDetails = useMemo(() => {
    const knownRooms = new Map<
      string,
      { roomNumber: string; roomType: string }
    >();
    availableRooms.forEach((room) => {
      knownRooms.set(room._id, room);
    });
    editingInvoice?.rooms?.forEach((room) => {
      knownRooms.set(room.roomId, room);
    });
    activeDraft?.rooms?.forEach((room) => {
      knownRooms.set(room.roomId, room);
    });
    return form.rooms.map((room) => ({
      roomId: room.roomId,
      roomNumber: knownRooms.get(room.roomId)?.roomNumber || "Unavailable room",
      roomType: knownRooms.get(room.roomId)?.roomType || "",
    }));
  }, [activeDraft?.rooms, availableRooms, editingInvoice?.rooms, form.rooms]);

  useEffect(() => {
    onHeaderStateChange({
      workflowStatus: form.workflowStatus,
      invoiceNumber: invoiceNumberText,
      saveState,
    });
  }, [form.workflowStatus, invoiceNumberText, onHeaderStateChange, saveState]);
  const submit = async (closeAfterSave: boolean) => {
    const effectiveStatus = statusVisible ? form.workflowStatus : "draft";
    const requiredValues = [
      ["Arrival", form.checkinDate],
      ["Departure", form.checkoutDate],
      ["Rooms", form.rooms.length],
      ["Payee Name", form.partyName],
      ["State", form.partyState],
      ["Address", form.partyAddress],
    ];
    const missingFields = requiredValues
      .filter(([, value]) => !String(value || "").trim())
      .map(([label]) => label);

    if (missingFields.length) {
      setActiveTab("details");
      showToast(`Please fill required fields: ${missingFields.join(", ")}.`);
      return;
    }

    const selectedState = findIndianState(form.partyState, stateOptions);
    if (!selectedState) {
      setActiveTab("details");
      showToast("Please select a valid Indian state.");
      return;
    }

    setSaving(true);
    try {
      const payload = cleanPayload(
        { ...form, partyState: selectedState, workflowStatus: effectiveStatus },
        lineItems,
        adjustments,
      );

      if (!editingInvoice && effectiveStatus === "draft") {
        const draft = draftId
          ? await api.updateInvoiceDraft(draftId, payload)
          : await api.createInvoiceDraft(payload);
        const savedDraft = draft as InvoiceDraft;
        setDraftId(savedDraft._id);
        setStatusVisible(true);
        setLastSavedSnapshot(currentSnapshot);
        onDraftSaved(closeAfterSave);
        showToast("Draft saved without invoice number.");
        return;
      }

      const savedInvoice = editingInvoice
        ? await api.updateInvoice(editingInvoice.invNo, payload)
        : draftId
          ? await api.updateInvoiceDraft(draftId, payload)
          : await api.createInvoice(payload);
      const savedInvoiceWithStatus: Invoice = {
        ...(savedInvoice as Invoice),
        workflowStatus: effectiveStatus,
      };
      setDraftId(null);
      setStatusVisible(true);
      setLastSavedSnapshot(currentSnapshot);
      onSaved(savedInvoiceWithStatus, closeAfterSave);
      showToast(
        `Invoice ${savedInvoiceWithStatus.invNo} ${editingInvoice ? "updated" : "saved"}.`,
      );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not save invoice.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (saveState === "unsaved") {
      setBackConfirmOpen(true);
      return;
    }

    onBack();
  };

  const confirmBack = () => {
    setBackConfirmOpen(false);
    onBack();
  };

  return (
    <div className="view-stack">
      <div className="invoice-form-nav">
        <button
          className="btn btn-outline invoice-back-button"
          type="button"
          onClick={handleBack}
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <div
          className="invoice-form-tabs"
          role="tablist"
          aria-label="Invoice form sections"
        >
          <button
            className={`invoice-form-tab${activeTab === "details" ? " active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "details"}
            onClick={() => setActiveTab("details")}
          >
            <FileText size={16} />
            <span>Invoice & Customer</span>
          </button>
          <button
            className={`invoice-form-tab${activeTab === "items" ? " active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "items"}
            onClick={() => setActiveTab("items")}
          >
            <ListChecks size={16} />
            <span>Line Items</span>
            <strong>{lineItems.length}</strong>
          </button>
        </div>
      </div>

      {activeTab === "details" ? (
        <>
          <section className="panel">
            <div className="panel-title">
              <CalendarDays size={16} />
              <span>Invoice Details</span>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Invoice Number</label>
                <div className="readonly-box">{invoiceNumberText}</div>
              </div>
              <div className="field">
                <label>Invoice Date</label>
                <input
                  className="input"
                  type="date"
                  value={form.invDate}
                  onChange={(event) =>
                    updateForm("invDate", event.target.value)
                  }
                />
              </div>
              <div className="field">
                <RequiredLabel>Arrival</RequiredLabel>
                <input
                  className="input"
                  type="date"
                  value={form.checkinDate}
                  onChange={(event) =>
                    updateForm("checkinDate", event.target.value)
                  }
                  required
                />
              </div>
              <div className="field">
                <RequiredLabel>Departure</RequiredLabel>
                <input
                  className="input"
                  type="date"
                  value={form.checkoutDate}
                  onChange={(event) =>
                    updateForm("checkoutDate", event.target.value)
                  }
                  required
                />
              </div>
              <div className="field">
                <label>Confirmation No.</label>
                <input
                  className="input"
                  value={form.confirmNo}
                  onChange={(event) =>
                    updateForm("confirmNo", event.target.value)
                  }
                />
              </div>
              <div className="field span-2 room-picker-field">
                <RequiredLabel>Rooms</RequiredLabel>
                <div className="room-picker">
                  <div className="room-selection" aria-live="polite">
                    {selectedRoomDetails.length ? (
                      selectedRoomDetails.map((room) => (
                        <span className="room-chip" key={room.roomId}>
                          <BedDouble size={13} />
                          {room.roomNumber}
                          {room.roomType ? ` - ${room.roomType}` : ""}
                          <button
                            type="button"
                            onClick={() => toggleRoom(room.roomId)}
                            title={`Remove ${room.roomNumber}`}
                          >
                            <X size={13} />
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="room-picker-placeholder">
                        Select one or more rooms
                      </span>
                    )}
                  </div>
                  <input
                    className="input room-search-input"
                    value={roomSearch}
                    onChange={(event) => setRoomSearch(event.target.value)}
                    placeholder="Search available rooms"
                    disabled={
                      !form.checkinDate ||
                      !form.checkoutDate ||
                      form.checkinDate >= form.checkoutDate
                    }
                    aria-label="Search available rooms"
                  />
                  <div
                    className="room-option-list"
                    role="listbox"
                    aria-multiselectable="true"
                  >
                    {!form.checkinDate || !form.checkoutDate ? (
                      <span className="room-option-message">
                        Choose arrival and departure dates first.
                      </span>
                    ) : form.checkinDate >= form.checkoutDate ? (
                      <span className="room-option-message">
                        Departure must be after arrival.
                      </span>
                    ) : roomsLoading ? (
                      <span className="room-option-message">
                        Checking room availability...
                      </span>
                    ) : roomLoadError ? (
                      <span className="room-option-message error">
                        {roomLoadError}
                      </span>
                    ) : roomOptions.length ? (
                      roomOptions.map((room) => {
                        const selected = selectedRoomIds.has(room._id);
                        return (
                          <button
                            className={`room-option${selected ? " selected" : ""}`}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            key={room._id}
                            onClick={() => toggleRoom(room._id)}
                          >
                            <span>{room.roomNumber}</span>
                            <small>
                              {[room.roomType, room.wing, room.floor]
                                .filter(Boolean)
                                .join(" - ") || "Standard room"}
                            </small>
                          </button>
                        );
                      })
                    ) : (
                      <span className="room-option-message">
                        No rooms are available for these dates.
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {statusVisible ? (
                <div className="field">
                  <RequiredLabel>Status</RequiredLabel>
                  <select
                    className="input"
                    value={form.workflowStatus}
                    onChange={(event) =>
                      updateForm(
                        "workflowStatus",
                        event.target.value as InvoiceWorkflowStatus,
                      )
                    }
                    required
                  >
                    {form.workflowStatus === "cancelled" ? (
                      <option value="cancelled">Cancelled</option>
                    ) : null}
                    <option value="draft">Draft</option>
                    <option value="reserved">Reserved</option>
                    <option value="checkedIn">Checked In</option>
                    <option value="checkedOut">Checked Out</option>
                  </select>
                </div>
              ) : null}
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
                  onChange={(event) =>
                    updateForm("partyName", event.target.value)
                  }
                  placeholder="Mr. Rahul Sharma / ABC Corp"
                  required
                />
              </div>
              <div className="field">
                <label>GSTIN (B2B)</label>
                <input
                  className="input"
                  value={form.partyGSTIN}
                  onChange={(event) =>
                    updateForm("partyGSTIN", event.target.value)
                  }
                />
              </div>
              <div className="field">
                <RequiredLabel>State</RequiredLabel>
                <StateCombobox
                  value={form.partyState}
                  onChange={(value) => updateForm("partyState", value)}
                  states={stateOptions}
                  required
                />
              </div>
              <div className="field span-2">
                <label>Group Name</label>
                <input
                  className="input"
                  value={form.groupName}
                  onChange={(event) =>
                    updateForm("groupName", event.target.value)
                  }
                />
              </div>
              <div className="field full">
                <RequiredLabel>Address</RequiredLabel>
                <textarea
                  className="input min-h-20"
                  value={form.partyAddress}
                  onChange={(event) =>
                    updateForm("partyAddress", event.target.value)
                  }
                  required
                />
              </div>
            </div>
          </section>
        </>
      ) : null}

      {activeTab === "items" ? (
        <>
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
                    const currentPresetAvailable =
                      line.presetKey === invoiceCustomTaxPreset.key ||
                      taxPresets.some(
                        (preset) => preset.key === line.presetKey,
                      );
                    return (
                      <tr key={line.id}>
                        <td>
                          <select
                            className="table-input mb-1"
                            value={line.presetKey}
                            onChange={(event) =>
                              handlePresetChange(line.id, event.target.value)
                            }
                          >
                            {!currentPresetAvailable ? (
                              <option value={line.presetKey}>
                                {line.presetKey} (saved)
                              </option>
                            ) : null}
                            {taxPresets.map((preset) => (
                              <option key={preset.key} value={preset.key}>
                                {preset.label}
                              </option>
                            ))}
                            <option value={invoiceCustomTaxPreset.key}>
                              {invoiceCustomTaxPreset.label}
                            </option>
                          </select>
                          <input
                            className="table-input"
                            value={line.description}
                            onChange={(event) =>
                              updateLine(line.id, {
                                description: event.target.value,
                              })
                            }
                            placeholder="Description"
                          />
                          {canUseInclusive(taxPresets, line.presetKey) ? (
                            <label className="inclusive-check">
                              <input
                                type="checkbox"
                                checked={line.taxInclusive}
                                onChange={(event) =>
                                  updateLine(line.id, {
                                    taxInclusive: event.target.checked,
                                  })
                                }
                              />
                              <span>Rate includes GST</span>
                            </label>
                          ) : null}
                        </td>
                        <td>
                          <input
                            className="table-input"
                            type="date"
                            value={line.date}
                            onChange={(event) =>
                              updateLine(line.id, { date: event.target.value })
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="table-input"
                            value={line.hsn}
                            onChange={(event) =>
                              updateLine(line.id, { hsn: event.target.value })
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="table-input text-right"
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.units}
                            onChange={(event) =>
                              updateLine(line.id, { units: event.target.value })
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="table-input text-right"
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.rate}
                            onChange={(event) =>
                              updateLine(line.id, { rate: event.target.value })
                            }
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
                            onChange={(event) =>
                              updateLine(line.id, {
                                cgstRate: Number(event.target.value) || 0,
                              })
                            }
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
                            onChange={(event) =>
                              updateLine(line.id, {
                                sgstRate: Number(event.target.value) || 0,
                              })
                            }
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
                            onChange={(event) =>
                              updateLine(line.id, {
                                igstRate: Number(event.target.value) || 0,
                              })
                            }
                          />
                        </td>
                        <td className="amount-cell">
                          {formatCurrency(calculated?.taxable || 0)}
                        </td>
                        <td className="amount-cell">
                          {formatCurrency(calculated?.total || 0)}
                        </td>
                        <td>
                          <button
                            className="icon-button danger"
                            type="button"
                            onClick={() =>
                              setLineItems((current) =>
                                current.filter((item) => item.id !== line.id),
                              )
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button
              className="add-row-button"
              type="button"
              onClick={() => addLine()}
            >
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
                            onChange={(event) =>
                              updateAdjustment(adjustment.id, {
                                desc: event.target.value,
                              })
                            }
                            placeholder="Round off / extra bed / discount"
                          />
                        </td>
                        <td>
                          <select
                            className="table-input"
                            value={adjustment.type}
                            onChange={(event) =>
                              updateAdjustment(adjustment.id, {
                                type: event.target.value as "add" | "deduct",
                              })
                            }
                          >
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
                            onChange={(event) =>
                              updateAdjustment(adjustment.id, {
                                amount: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <button
                            className="icon-button danger"
                            type="button"
                            onClick={() =>
                              setAdjustments((current) =>
                                current.filter(
                                  (item) => item.id !== adjustment.id,
                                ),
                              )
                            }
                          >
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
            <button
              className="add-row-button"
              type="button"
              onClick={() =>
                setAdjustments((current) => [...current, makeAdjustment()])
              }
            >
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
              <div className="words">
                Rupees{" "}
                {totals.netTotal > 0
                  ? numWords(Math.round(totals.netTotal))
                  : "Zero"}{" "}
                Only
              </div>
            </div>
          </section>
        </>
      ) : null}

      <div className="action-bar">
        <button
          className="btn btn-outline"
          type="button"
          onClick={() => void submit(false)}
          disabled={saving}
        >
          <Save size={16} />
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => void submit(true)}
          disabled={saving}
        >
          <X size={16} />
          {saving ? "Saving..." : "Save & Close"}
        </button>
      </div>
      {backConfirmOpen ? (
        <div
          className="app-dialog-backdrop"
          role="presentation"
          onMouseDown={() => setBackConfirmOpen(false)}
        >
          <div
            className="app-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-invoice-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 className="app-dialog-title" id="unsaved-invoice-dialog-title">
              Leave invoice?
            </h2>
            <p className="app-dialog-message">
              You have unsaved changes. Nothing will be saved if you go back
              now.
            </p>
            <div className="app-dialog-actions">
              <button
                className="btn btn-soft"
                type="button"
                onClick={() => setBackConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={confirmBack}
              >
                Go back
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
