export type Preset = {
  business_name: string;
  tagline?: string;
  gstin?: string;
  address_line1?: string;
  address_line2?: string;
  phone?: string;
  fax?: string;
  upi?: string;
  website?: string;
  email?: string;
  bank_acc_name?: string;
  invoice_prefix: string;
  bank_name?: string;
  bank_account?: string;
  bank_ifsc?: string;
  terms?: string;
};

export type Settings = {
  preset: Preset;
  logoDataUrl: string | null;
};

<<<<<<< HEAD
export type InvoiceWorkflowStatus = "draft" | "checkedIn" | "checkedOut" | "cancelled";
export type CreatableInvoiceWorkflowStatus = Exclude<InvoiceWorkflowStatus, "cancelled">;
=======
export type InvoiceWorkflowStatus =
  "draft" | "checkedIn" | "checkedOut" | "cancelled";
export type InvoiceWorkbenchStatus = "all" | InvoiceWorkflowStatus;
export type CreatableInvoiceWorkflowStatus = Exclude<
  InvoiceWorkflowStatus,
  "cancelled"
>;
>>>>>>> codex/backend-api-data
export type InvoiceRecordStatus = "active" | "cancelled";
export type InvoiceFormSaveState = "saved" | "unsaved";

export type InvoiceFormHeaderState = {
  workflowStatus: InvoiceWorkflowStatus;
  invoiceNumber: string;
  saveState: InvoiceFormSaveState;
};

export type LineItemInput = {
  id: string;
  presetKey: string;
  description: string;
  hsn: string;
  date: string;
  units: number | string;
  rate: number | string;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  taxInclusive: boolean;
};

<<<<<<< HEAD
export type CalculatedLineItem = Omit<LineItemInput, "id" | "units" | "rate"> & {
=======
export type CalculatedLineItem = Omit<
  LineItemInput,
  "id" | "units" | "rate"
> & {
>>>>>>> codex/backend-api-data
  units: number;
  rate: number;
  taxable: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  taxTotal: number;
  total: number;
};

export type AdjustmentInput = {
  id: string;
  desc: string;
  amount: number | string;
  type: "add" | "deduct";
};

export type Adjustment = Omit<AdjustmentInput, "id" | "amount"> & {
  amount: number;
};

export type InvoicePayload = {
  invDate: string;
  checkinDate: string;
  checkoutDate: string;
  confirmNo: string;
  partyName: string;
  partyGSTIN: string;
  partyAddress: string;
  partyState: string;
  groupName: string;
  roomNo: string;
  workflowStatus: CreatableInvoiceWorkflowStatus;
  lineItems: Omit<LineItemInput, "id">[];
  adjustments: Omit<AdjustmentInput, "id">[];
};

<<<<<<< HEAD
type InvoiceRecordBase = Omit<InvoicePayload, "lineItems" | "adjustments" | "workflowStatus"> & {
=======
type InvoiceRecordBase = Omit<
  InvoicePayload,
  "lineItems" | "adjustments" | "workflowStatus"
> & {
>>>>>>> codex/backend-api-data
  _id?: string;
  lineItems: CalculatedLineItem[];
  adjustments: Adjustment[];
  totalTaxable: number;
  totalCGST: number;
  totalSGST: number;
  totalIGST: number;
  grandTotal: number;
  addTotal: number;
  deductTotal: number;
  netTotal: number;
  presetSnapshot: Preset;
  createdAt?: string;
  updatedAt?: string;
};

export type Invoice = InvoiceRecordBase & {
  invNo: string;
  status: InvoiceRecordStatus;
  workflowStatus?: InvoiceWorkflowStatus;
  cancelledAt?: string;
};

export type InvoiceDraft = InvoiceRecordBase & {
  _id: string;
  status?: "active";
  workflowStatus: "draft";
};

export type InvoiceListItem = {
  invNo: string;
  invDate: string;
  partyName: string;
  netTotal: number;
  totalCGST: number;
  totalSGST: number;
  totalIGST: number;
  items: number;
  status: InvoiceRecordStatus | InvoiceWorkflowStatus;
  workflowStatus?: InvoiceWorkflowStatus;
  createdAt?: string;
};

export type InvoiceDraftListItem = {
  _id: string;
  invDate: string;
  partyName: string;
  netTotal: number;
  totalCGST: number;
  totalSGST: number;
  totalIGST: number;
  items: number;
  status: "active";
  workflowStatus: "draft";
  createdAt?: string;
  updatedAt?: string;
};

<<<<<<< HEAD
=======
export type InvoiceWorkbenchRow = {
  id: string;
  invoiceNumber: string;
  createdAt?: string;
  workflowStatus: InvoiceWorkflowStatus;
  source: "draft" | "invoice";
  draftId?: string;
  invNo?: string;
};

export type InvoiceWorkbenchResponse = {
  counts: Record<InvoiceWorkbenchStatus, number>;
  rows: InvoiceWorkbenchRow[];
};

>>>>>>> codex/backend-api-data
export type InvoiceFilters = {
  from: string;
  to: string;
  gst: "" | "yes" | "no";
  status: "" | "active" | "cancelled";
  workflowStatus?: "" | InvoiceWorkflowStatus;
  search: string;
<<<<<<< HEAD
};
=======
};
>>>>>>> codex/backend-api-data
