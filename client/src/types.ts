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

export type TaxPreset = {
  key: string;
  label: string;
  hsn: string;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  allowInclusive: boolean;
  note: string;
};

export type Settings = {
  preset: Preset;
  taxPresets: TaxPreset[];
  logoDataUrl: string | null;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
  role: "owner";
};

export type CurrentOrganization = {
  id: string;
  name: string;
  role: "owner";
};

export type AuthStatus = {
  authRequired: boolean;
  authenticated: boolean;
  user: AuthenticatedUser | null;
  organization: CurrentOrganization | null;
  csrfToken: string | null;
  sessionExpiresAt: string | null;
};

export type InvoiceWorkflowStatus =
  "draft" | "reserved" | "checkedIn" | "checkedOut" | "cancelled";
export type InvoiceWorkbenchStatus = "all" | InvoiceWorkflowStatus;
export type CreatableInvoiceWorkflowStatus = Exclude<
  InvoiceWorkflowStatus,
  "cancelled"
>;
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

export type CalculatedLineItem = Omit<
  LineItemInput,
  "id" | "units" | "rate"
> & {
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

export type Room = {
  _id: string;
  roomNumber: string;
  roomType: string;
  floor: string;
  wing: string;
  capacity: number;
  isActive: boolean;
  version: number;
  createdAt?: string;
  updatedAt?: string;
};

export type RoomInput = {
  roomNumber: string;
  roomType: string;
  floor: string;
  wing: string;
  capacity: number;
};

export type RoomSelection = {
  roomId: string;
};

export type InvoiceRoom = RoomSelection & {
  roomNumber: string;
  roomType: string;
};

export type RoomAllocation = {
  _id: string;
  roomId?: string;
  invoiceNumber: string;
  roomNumberSnapshot: string;
  checkinDate: string;
  checkoutDate: string;
  status: Exclude<InvoiceWorkflowStatus, "draft">;
  createdAt?: string;
};

export type RoomAllocationHistory = {
  items: RoomAllocation[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
};

export type RoomBookingBoard = {
  from: string;
  to: string;
  rooms: Room[];
  allocations: RoomAllocation[];
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
  rooms: RoomSelection[];
  workflowStatus: CreatableInvoiceWorkflowStatus;
  lineItems: Omit<LineItemInput, "id">[];
  adjustments: Omit<AdjustmentInput, "id">[];
};

type InvoiceRecordBase = Omit<
  InvoicePayload,
  "lineItems" | "adjustments" | "workflowStatus" | "rooms"
> & {
  roomNo: string;
  rooms: InvoiceRoom[];
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

export type InvoiceFilters = {
  from: string;
  to: string;
  gst: "" | "yes" | "no";
  status: "" | "active" | "cancelled";
  workflowStatus?: "" | InvoiceWorkflowStatus;
  search: string;
};
