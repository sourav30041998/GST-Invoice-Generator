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

export type CalculatedLineItem = Omit<LineItemInput, "id" | "units" | "rate"> & {
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
  lineItems: Omit<LineItemInput, "id">[];
  adjustments: Omit<AdjustmentInput, "id">[];
};

export type Invoice = Omit<InvoicePayload, "lineItems" | "adjustments"> & {
  _id?: string;
  invNo: string;
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
  status: "active" | "cancelled";
  cancelledAt?: string;
  presetSnapshot: Preset;
  createdAt?: string;
  updatedAt?: string;
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
  status: "active" | "cancelled";
  createdAt?: string;
};

export type InvoiceFilters = {
  from: string;
  to: string;
  gst: "" | "yes" | "no";
  status: "" | "active" | "cancelled";
  search: string;
};