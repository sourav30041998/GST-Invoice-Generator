import {
  AlertTriangle,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  MAX_INVOICE_AMOUNT,
  numWords,
} from "../utils/calculations";
import { todayIso } from "../utils/dates";
import { validateInvoiceForm } from "../utils/invoiceValidation";

type FormState = Omit<
  InvoicePayload,
  "lineItems" | "adjustments" | "workflowStatus"
> & {
  workflowStatus: InvoiceWorkflowStatus;
};

type InvoiceFormTab = "details" | "items";

type FieldLimitField = {
  id: string;
  type:
    | "rate"
    | "adjustment"
    | "units"
    | "hsn"
    | "cgstRate"
    | "sgstRate"
    | "igstRate";
};

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

function SummaryAmount({ value }: { value: number }) {
  const formattedValue = formatCurrency(value);
  return (
    <strong className="total-value" title={formattedValue}>
      {formattedValue}
    </strong>
  );
}

function exceedsNumberLimit(value: number | string, limit: number) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > limit;
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
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const [statusVisible, setStatusVisible] = useState(
    Boolean(editingInvoice || activeDraft),
  );
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<InvoiceFormTab>("details");
  const [backConfirmOpen, setBackConfirmOpen] = useState(false);
  const [validationDialogMessage, setValidationDialogMessage] = useState<
    string | null
  >(null);
  const [fieldLimitField, setFieldLimitField] =
    useState<FieldLimitField | null>(null);
  const tabToRestoreAfterSaveRef = useRef<InvoiceFormTab | null>(null);
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
  const netTotalWords = numWords(Math.round(totals.netTotal));
  const fieldLimitMessage = fieldLimitField
    ? {
        rate: "A rate cannot exceed Rs. 9,999,999,999.00. The extra value was not accepted.",
        adjustment:
          "An adjustment amount cannot exceed Rs. 9,999,999,999.00. The extra value was not accepted.",
        units: "Quantity cannot exceed 999. The extra value was not accepted.",
        hsn: "HSN/SAC is limited to six digits. The extra digit was not accepted.",
        cgstRate: "CGST cannot exceed 100%. The extra value was not accepted.",
        sgstRate: "SGST cannot exceed 100%. The extra value was not accepted.",
        igstRate: "IGST cannot exceed 100%. The extra value was not accepted.",
      }[fieldLimitField.type]
    : null;

  const resetInvoiceForm = useCallback(() => {
    setForm(initialForm());
    setLineItems(initialLineItems(taxPresets));
    setAdjustments([]);
    setDraftId(null);
    setDraftVersion(null);
    setStatusVisible(false);
    setLastSavedSnapshot(null);
    setActiveTab("details");
    setValidationDialogMessage(null);
    setFieldLimitField(null);
    tabToRestoreAfterSaveRef.current = null;
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
    if (!fieldLimitField) {
      return;
    }

    const fieldStillExists =
      fieldLimitField.type === "adjustment"
        ? adjustments.some((item) => item.id === fieldLimitField.id)
        : lineItems.some((item) => item.id === fieldLimitField.id);
    if (!fieldStillExists) {
      setFieldLimitField(null);
    }
  }, [adjustments, fieldLimitField, lineItems]);

  useEffect(() => {
    const restoreTabAfterSave = () => {
      const tabToRestore = tabToRestoreAfterSaveRef.current;
      tabToRestoreAfterSaveRef.current = null;
      setActiveTab(tabToRestore || "details");
    };

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
      setDraftVersion(null);
      setStatusVisible(true);
      setLineItems(nextLineItems);
      setAdjustments(nextAdjustments);
      setLastSavedSnapshot(
        formSnapshot(nextForm, nextLineItems, nextAdjustments),
      );
      restoreTabAfterSave();
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
      setDraftVersion(activeDraft.version);
      setStatusVisible(true);
      setLineItems(nextLineItems);
      setAdjustments(nextAdjustments);
      setLastSavedSnapshot(
        formSnapshot(nextForm, nextLineItems, nextAdjustments),
      );
      restoreTabAfterSave();
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
  const editingWorkflowStatus =
    editingInvoice?.workflowStatus ||
    (editingInvoice?.status === "cancelled" ? "cancelled" : "checkedOut");
  const invoiceLocked = Boolean(
    editingInvoice &&
      editingWorkflowStatus !== "reserved" &&
      editingWorkflowStatus !== "checkedIn",
  );
  const workflowOptions: InvoiceWorkflowStatus[] = editingInvoice
    ? editingWorkflowStatus === "reserved"
      ? ["reserved", "checkedIn"]
      : editingWorkflowStatus === "checkedIn"
        ? ["checkedIn", "checkedOut"]
        : [editingWorkflowStatus]
    : ["draft", "reserved", "checkedIn", "checkedOut"];

  useEffect(() => {
    onHeaderStateChange({
      workflowStatus: form.workflowStatus,
      invoiceNumber: invoiceNumberText,
      saveState,
    });
  }, [form.workflowStatus, invoiceNumberText, onHeaderStateChange, saveState]);
  const submit = async (closeAfterSave: boolean) => {
    if (invoiceLocked) {
      setValidationDialogMessage(
        "This invoice is locked. Cancel it and issue a corrected invoice instead.",
      );
      return;
    }

    const effectiveStatus = statusVisible ? form.workflowStatus : "draft";
    const requiredValues = [
      ["Invoice Date", form.invDate],
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
      setValidationDialogMessage(
        `Please fill required fields: ${missingFields.join(", ")}.`,
      );
      return;
    }

    const selectedState = findIndianState(form.partyState, stateOptions);
    if (!selectedState) {
      setActiveTab("details");
      setValidationDialogMessage("Please select a valid Indian state.");
      return;
    }

    const validationIssue = validateInvoiceForm(form, lineItems, adjustments);
    if (validationIssue) {
      setActiveTab(validationIssue.tab);
      setValidationDialogMessage(validationIssue.message);
      return;
    }

    if (draftId && draftVersion === null) {
      setValidationDialogMessage(
        "Draft revision is unavailable. Reload the draft before saving it.",
      );
      return;
    }

    const currentDraftVersion = () => {
      if (draftVersion === null) {
        throw new Error(
          "Draft revision is unavailable. Reload the draft before saving it.",
        );
      }
      return draftVersion;
    };

    setSaving(true);
    try {
      const payload = cleanPayload(
        { ...form, partyState: selectedState, workflowStatus: effectiveStatus },
        lineItems,
        adjustments,
      );

      if (!editingInvoice && effectiveStatus === "draft") {
        const draft = draftId
          ? await api.updateInvoiceDraft(
              draftId,
              payload,
              currentDraftVersion(),
            )
          : await api.createInvoiceDraft(payload);
        const savedDraft = draft as InvoiceDraft;
        setDraftId(savedDraft._id);
        setDraftVersion(savedDraft.version);
        setStatusVisible(true);
        setLastSavedSnapshot(currentSnapshot);
        onDraftSaved(closeAfterSave);
        showToast("Draft saved without invoice number.");
        return;
      }

      const savedInvoice = editingInvoice
        ? await api.updateInvoice(
            editingInvoice.invNo,
            payload,
            editingInvoice.version,
          )
        : draftId
          ? await api.updateInvoiceDraft(
              draftId,
              payload,
              currentDraftVersion(),
            )
          : await api.createInvoice(payload);
      const savedInvoiceWithStatus: Invoice = {
        ...(savedInvoice as Invoice),
        workflowStatus: effectiveStatus,
      };
      setDraftId(null);
      setDraftVersion(null);
      setStatusVisible(true);
      setLastSavedSnapshot(currentSnapshot);
      tabToRestoreAfterSaveRef.current = activeTab;
      onSaved(savedInvoiceWithStatus, closeAfterSave);
      showToast(
        `Invoice ${savedInvoiceWithStatus.invNo} ${editingInvoice ? "updated" : "saved"}.`,
      );
    } catch (error) {
      setValidationDialogMessage(
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
          disabled={Boolean(validationDialogMessage)}
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
            disabled={Boolean(validationDialogMessage)}
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
            disabled={Boolean(validationDialogMessage)}
          >
            <ListChecks size={16} />
            <span>Charges & Services</span>
            <strong>{lineItems.length}</strong>
          </button>
        </div>
      </div>

      <fieldset
        className="invoice-form-fields"
        disabled={invoiceLocked || Boolean(validationDialogMessage)}
      >
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
                <RequiredLabel>Invoice Date</RequiredLabel>
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
                  max={form.checkoutDate || undefined}
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
                  min={form.checkinDate || undefined}
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
                    {workflowOptions.map((status) => (
                      <option key={status} value={status}>
                        {status === "draft"
                          ? "Draft"
                          : status === "reserved"
                            ? "Reserved"
                            : status === "checkedIn"
                              ? "Checked In"
                              : status === "checkedOut"
                                ? "Checked Out"
                                : "Cancelled"}
                      </option>
                    ))}
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
              <span>Charges & Services</span>
              <span>GST applied to each charge or service based on preset</span>
            </div>
            {fieldLimitMessage ? (
              <div className="amount-limit-alert" role="alert">
                <AlertTriangle size={17} aria-hidden="true" />
                <span>{fieldLimitMessage}</span>
              </div>
            ) : null}
            <div className="table-wrap">
              <table className="data-table charges-services-table">
                <colgroup>
                  <col className="charge-col-description" />
                  <col className="charge-col-date" />
                  <col className="charge-col-hsn" />
                  <col className="charge-col-quantity" />
                  <col className="charge-col-rate" />
                  <col className="charge-col-tax" />
                  <col className="charge-col-tax" />
                  <col className="charge-col-tax" />
                  <col className="charge-col-amount" />
                  <col className="charge-col-amount" />
                  <col className="charge-col-action" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="charge-heading-text">Preset / Description</th>
                    <th className="charge-heading-text">Date</th>
                    <th className="charge-heading-text">HSN</th>
                    <th className="charge-heading-number">Qty</th>
                    <th className="charge-heading-number">Rate</th>
                    <th className="charge-heading-number">CGST%</th>
                    <th className="charge-heading-number">SGST%</th>
                    <th className="charge-heading-number">IGST%</th>
                    <th className="charge-heading-number">Taxable</th>
                    <th className="charge-heading-number">Total</th>
                    <th className="charge-heading-action"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((line, index) => {
                    const calculated = totals.lineItems[index];
                    const taxableAmount = formatCurrency(
                      calculated?.taxable || 0,
                    );
                    const totalAmount = formatCurrency(calculated?.total || 0);
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
                            inputMode="numeric"
                            onChange={(event) => {
                              const nextHsn = event.target.value.replace(
                                /\D/g,
                                "",
                              );
                              if (nextHsn.length > 6) {
                                setFieldLimitField({ id: line.id, type: "hsn" });
                                return;
                              }
                              if (
                                fieldLimitField?.id === line.id &&
                                fieldLimitField.type === "hsn"
                              ) {
                                setFieldLimitField(null);
                              }
                              updateLine(line.id, { hsn: nextHsn });
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="table-input text-right"
                            type="number"
                            min="0.001"
                            max="999"
                            step="0.001"
                            value={line.units}
                            onChange={(event) => {
                              const nextUnits = event.target.value;
                              if (exceedsNumberLimit(nextUnits, 999)) {
                                setFieldLimitField({ id: line.id, type: "units" });
                                return;
                              }
                              if (
                                fieldLimitField?.id === line.id &&
                                fieldLimitField.type === "units"
                              ) {
                                setFieldLimitField(null);
                              }
                              updateLine(line.id, { units: nextUnits });
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="table-input text-right"
                            type="number"
                            min="0.01"
                            max={MAX_INVOICE_AMOUNT}
                            step="0.01"
                            value={line.rate}
                            onChange={(event) => {
                              const nextRate = event.target.value;
                              if (exceedsNumberLimit(nextRate, MAX_INVOICE_AMOUNT)) {
                                setFieldLimitField({ id: line.id, type: "rate" });
                                return;
                              }
                              if (
                                fieldLimitField?.id === line.id &&
                                fieldLimitField.type === "rate"
                              ) {
                                setFieldLimitField(null);
                              }
                              updateLine(line.id, { rate: nextRate });
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="table-input text-right"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={line.cgstRate}
                            onChange={(event) => {
                              const nextRate = event.target.value;
                              if (exceedsNumberLimit(nextRate, 100)) {
                                setFieldLimitField({ id: line.id, type: "cgstRate" });
                                return;
                              }
                              if (fieldLimitField?.id === line.id && fieldLimitField.type === "cgstRate") {
                                setFieldLimitField(null);
                              }
                              updateLine(line.id, { cgstRate: Number(nextRate) || 0 });
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="table-input text-right"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={line.sgstRate}
                            onChange={(event) => {
                              const nextRate = event.target.value;
                              if (exceedsNumberLimit(nextRate, 100)) {
                                setFieldLimitField({ id: line.id, type: "sgstRate" });
                                return;
                              }
                              if (fieldLimitField?.id === line.id && fieldLimitField.type === "sgstRate") {
                                setFieldLimitField(null);
                              }
                              updateLine(line.id, { sgstRate: Number(nextRate) || 0 });
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="table-input text-right"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={line.igstRate}
                            onChange={(event) => {
                              const nextRate = event.target.value;
                              if (exceedsNumberLimit(nextRate, 100)) {
                                setFieldLimitField({ id: line.id, type: "igstRate" });
                                return;
                              }
                              if (fieldLimitField?.id === line.id && fieldLimitField.type === "igstRate") {
                                setFieldLimitField(null);
                              }
                              updateLine(line.id, { igstRate: Number(nextRate) || 0 });
                            }}
                          />
                        </td>
                        <td className="amount-cell" title={taxableAmount}>
                          <span>{taxableAmount}</span>
                        </td>
                        <td className="amount-cell" title={totalAmount}>
                          <span>{totalAmount}</span>
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
                            max={MAX_INVOICE_AMOUNT}
                            step="0.01"
                            value={adjustment.amount}
                            onChange={(event) => {
                              const nextAmount = event.target.value;
                              if (
                                exceedsNumberLimit(
                                  nextAmount,
                                  MAX_INVOICE_AMOUNT,
                                )
                              ) {
                                setFieldLimitField({
                                  id: adjustment.id,
                                  type: "adjustment",
                                });
                                return;
                              }
                              if (
                                fieldLimitField?.id === adjustment.id &&
                                fieldLimitField.type === "adjustment"
                              ) {
                                setFieldLimitField(null);
                              }
                              updateAdjustment(adjustment.id, {
                                amount: nextAmount,
                              });
                            }}
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
                <SummaryAmount value={totals.totalTaxable} />
              </div>
              <div className="total-row">
                <span>CGST</span>
                <SummaryAmount value={totals.totalCGST} />
              </div>
              <div className="total-row">
                <span>SGST</span>
                <SummaryAmount value={totals.totalSGST} />
              </div>
              <div className="total-row">
                <span>IGST</span>
                <SummaryAmount value={totals.totalIGST} />
              </div>
              <div className="total-row grand">
                <span>Grand Total</span>
                <SummaryAmount value={totals.grandTotal} />
              </div>
              <div className="total-row add">
                <span>Additions</span>
                <SummaryAmount value={totals.addTotal} />
              </div>
              <div className="total-row deduct">
                <span>Deductions</span>
                <SummaryAmount value={totals.deductTotal} />
              </div>
              <div className="total-row net">
                <span>Net Total</span>
                <SummaryAmount value={totals.netTotal} />
              </div>
              <div className="words">
                Rupees{" "}
                {totals.netTotal > 0 ? netTotalWords : "Zero"}{" "}
                Only
              </div>
            </div>
          </section>
        </>
      ) : null}
      </fieldset>

      <div className="action-bar">
        <button
          className="btn btn-outline"
          type="button"
          onClick={() => void submit(false)}
          disabled={saving || invoiceLocked || Boolean(validationDialogMessage)}
        >
          <Save size={16} />
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => void submit(true)}
          disabled={saving || invoiceLocked || Boolean(validationDialogMessage)}
        >
          <X size={16} />
          {saving ? "Saving..." : "Save & Close"}
        </button>
      </div>
      {validationDialogMessage ? (
        <div className="app-dialog-backdrop validation-dialog-backdrop">
          <div
            className="app-dialog validation-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="invoice-validation-dialog-title"
            aria-describedby="invoice-validation-dialog-message"
          >
            <div className="validation-dialog-icon" aria-hidden="true">
              <AlertTriangle size={22} />
            </div>
            <h2
              className="app-dialog-title"
              id="invoice-validation-dialog-title"
            >
              Check invoice details
            </h2>
            <p
              className="app-dialog-message"
              id="invoice-validation-dialog-message"
            >
              {validationDialogMessage}
            </p>
            <div className="app-dialog-actions">
              <button
                className="btn btn-primary"
                type="button"
                autoFocus
                onClick={() => setValidationDialogMessage(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
